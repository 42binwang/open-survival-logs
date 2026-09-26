// @ts-check
// Text conventions of the kit (docs/UI.md §3.4), EN and ZH. Dish quality is text, never an icon badge: the source
// writes "Eat Mushroom Soup (Perfect)" (ss_07) in English and 【完美】 in Chinese; the four tiers share one render
// except Failed.

/** @typedef {'en' | 'zh'} Lang */
/** @typedef {'perfect' | 'good' | 'normal' | 'failed'} Quality */

/** Config name suffixes (Chinese source text) → tier. */
export const QUALITY_SUFFIX = Object.freeze({ '(完美)': 'perfect', '(优良)': 'good', '(普通)': 'normal', '(失败)': 'failed' });

/** @type {Readonly<Record<Quality, { en: string, zh: string }>>} */
export const QUALITY_LABEL = Object.freeze({
  perfect: { en: 'Perfect', zh: '完美' },
  good: { en: 'Good', zh: '优良' },
  normal: { en: 'Normal', zh: '普通' },
  failed: { en: 'Failed', zh: '失败' },
});

/**
 * Splits a config name such as 午餐肉煎蛋(完美) into its base and quality tier.
 * @param {string} zh
 * @returns {{ base: string, quality: Quality | null }}
 */
export function splitQuality(zh) {
  for (const [suffix, quality] of Object.entries(QUALITY_SUFFIX)) {
    if (zh.endsWith(suffix)) return { base: zh.slice(0, -suffix.length), quality: /** @type {Quality} */ (quality) };
  }
  return { base: zh, quality: null };
}

/**
 * The quality as it is written after a name: " (Perfect)" or "【完美】".
 * @param {Quality} quality
 * @param {Lang} lang
 */
export function qualityText(quality, lang) {
  const label = QUALITY_LABEL[quality][lang];
  return lang === 'zh' ? `【${label}】` : ` (${label})`;
}

/**
 * A display name with its quality: "Luncheon Meat and Fried Egg (Perfect)", "午餐肉煎蛋【完美】".
 * @param {string} base  the localized base name
 * @param {Quality | null} quality
 * @param {Lang} lang
 */
export function withQuality(base, quality, lang) {
  return quality ? `${base}${qualityText(quality, lang)}` : base;
}

/**
 * Weight as the source prints it: two decimals, no space, lower-case unit ("0.20kg").
 * @param {number} grams
 */
export function formatKg(grams) {
  return `${(grams / 1000).toFixed(2)}kg`;
}

/**
 * Load line: "8.7 / 9.6 Kg" (one decimal, capital K as in ss_01).
 * @param {number} kg
 * @param {number} maxKg
 */
export function formatLoad(kg, maxKg) {
  return `${kg.toFixed(1)} / ${maxKg.toFixed(1)} Kg`;
}

/**
 * Footprint as the shop lists it: "[2x2]".
 * @param {[number, number]} size
 */
export function formatFootprint(size) {
  return `[${size[0]}x${size[1]}]`;
}

/**
 * Money: "$30", "$1,118".
 * @param {number} n
 */
export function formatMoney(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Clock digits "11:50".
 * @param {number} h
 * @param {number} m
 */
export function formatClock(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A label with a value: "Remaining: 3" / "剩余：3" (full-width colon in Chinese).
 * @param {string} label
 * @param {string | number} value
 * @param {Lang} lang
 */
export function labelled(label, value, lang) {
  return lang === 'zh' ? `${label}：${value}` : `${label}: ${value}`;
}
