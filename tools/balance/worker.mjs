// @ts-check
// One balance session in its own worker thread, so no module state carries over from another seed.
import { parentPort, workerData } from 'node:worker_threads';
import { runSession } from './session.mjs';

const res = await runSession(workerData);
parentPort?.postMessage(res);
