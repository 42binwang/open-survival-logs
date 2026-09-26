// @ts-check
// Worker thread entry: runs one driver task at a time and posts back what it observed.
import { isMainThread, parentPort } from 'node:worker_threads';
import { emptyObs } from './observe.mjs';

/**
 * @param {import('./pool.mjs').Task} task
 * @returns {Promise<import('./observe.mjs').Obs>}
 */
export async function runTask(task) {
  if (!/^[a-z][\w-]*$/i.test(task.driver)) throw new Error(`bad driver name ${task.driver}`);
  const mod = await import(new URL(`./drivers/${task.driver}.mjs`, import.meta.url).href);
  try {
    return await mod.run(task.args || {});
  } catch (err) {
    const obs = emptyObs();
    obs.errors.push(`${task.driver}${task.label ? ` (${task.label})` : ''} crashed: ${/** @type {Error} */ (err).stack || err}`);
    return obs;
  }
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  const error = console.error;
  console.log = (...a) => error(...a); // stdout belongs to the tool's report
  port.on('message', async (/** @type {import('./pool.mjs').Task} */ task) => {
    try {
      port.postMessage({ obs: await runTask(task) });
    } catch (err) {
      port.postMessage({ error: /** @type {Error} */ (err).stack || String(err) });
    }
  });
}
