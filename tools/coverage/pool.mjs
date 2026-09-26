// @ts-check
// Runs driver tasks on worker threads (each worker loads its own copy of the simulation) and merges what they
// observed. With `workers: 0` the tasks run in this thread, one after another.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { emptyObs, mergeObs } from './observe.mjs';
import { runTask } from './worker.mjs';

/**
 * @typedef {object} Task
 * @property {string} driver  module name under tools/coverage/drivers/
 * @property {any} args  JSON arguments for its run()
 * @property {number} [cost]  rough run time, so the longest tasks start first
 * @property {string} [label]
 */

export const defaultWorkers = () => Math.max(1, Math.min(12, availableParallelism() - 2));

/**
 * @param {Task[]} tasks
 * @param {{ workers?: number, onDone?: (task: Task, ms: number) => void }} [opts]
 * @returns {Promise<import('./observe.mjs').Obs>}
 */
export async function runTasks(tasks, { workers = defaultWorkers(), onDone } = {}) {
  const obs = emptyObs();
  const queue = [...tasks].sort((a, b) => (b.cost || 1) - (a.cost || 1));
  if (workers <= 0) {
    for (const t of queue) {
      const t0 = performance.now();
      mergeObs(obs, await runTask(t));
      onDone?.(t, performance.now() - t0);
    }
    return obs;
  }
  const url = new URL('./worker.mjs', import.meta.url);
  const n = Math.min(workers, queue.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      const w = new Worker(url);
      try {
        for (let t = queue.shift(); t; t = queue.shift()) {
          const task = t;
          const t0 = performance.now();
          const res = await new Promise((resolve) => {
            const onMessage = (/** @type {any} */ msg) => (cleanup(), resolve(msg));
            const onError = (/** @type {Error} */ err) => (cleanup(), resolve({ error: err.stack || err.message }));
            const cleanup = () => (w.off('message', onMessage), w.off('error', onError));
            w.on('message', onMessage);
            w.on('error', onError);
            w.postMessage(task);
          });
          if (res.error) {
            const e = emptyObs();
            e.errors.push(`${task.driver}${task.label ? ` (${task.label})` : ''}: ${res.error}`);
            mergeObs(obs, e);
          } else mergeObs(obs, res.obs);
          onDone?.(task, performance.now() - t0);
        }
      } finally {
        await w.terminate();
      }
    })
  );
  return obs;
}
