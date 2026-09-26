// @ts-check
// Compile-time conformance, checked by `npm run typecheck` and never run: the Canvas renderer implements the renderer
// interface and homeView returns a view, as tsc infers them from the legacy modules. The gate's contracts check
// (tools/gate/contracts.mjs) covers the same ground at run time.
import { IsoRenderer } from '../../src/render/iso.js';
import { homeView } from '../../src/ui/view.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {import('../../src/contracts/render.js').Renderer}
 */
export const canvasRenderer = (canvas) => new IsoRenderer(canvas);

/**
 * @param {any} state
 * @returns {import('../../src/contracts/view.js').SceneView}
 */
export const safehouseView = (state) => homeView(state);
