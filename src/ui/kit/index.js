// @ts-check
// The UI kit's script side (docs/UI.md). The styles are src/ui/kit/kit.css; nothing here touches the game panels yet.
export { GLYPHS, glyph } from './glyphs.js';
export { placeItemTip } from './place.js';
export { CELL, GAP, PITCH, ICON_FILL, placed, slotSize, gridSize, artAngle, iconBox, freshness, gridElement, slotElement } from './slot.js';
export { AA_NORMAL, AA_LARGE, parseColor, luminance, over, contrast, isLargeText, requiredContrast, toHex, toLab, fromLab, darkenToContrast } from './contrast.js';
export { el, button, tag, bar, toast, closeButton, section, panel, frame } from './build.js';
export { QUALITY_SUFFIX, QUALITY_LABEL, splitQuality, qualityText, withQuality, formatKg, formatLoad, formatFootprint, formatMoney, formatClock, labelled } from './format.js';
