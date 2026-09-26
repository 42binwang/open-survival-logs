import { EN_NAMES } from '../data/gen/en.js';
import { STRINGS } from '../content/strings.js';

let lang = 'en';

export function setLang(l) {
  lang = l === 'zh' ? 'zh' : 'en';
}

export function getLang() {
  return lang;
}

/**
 * English names the source game prints where they differ from our config's machine translation (docs/UI.md §3.5,
 * read off its screenshots and trailer). They win over the generated EN_NAMES.
 */
export const STEAM_NAMES = Object.freeze({
  红烧牛肉面: 'Beef Noodles',
  '90压缩饼干': 'Hardtack',
  苏打饼干: 'Crackers',
  卤蛋: 'Marinated Eggs',
  纯牛奶: 'Whole Milk',
  红富士苹果: 'Fuji Apple',
  乳清蛋白粉: 'Protein Powder',
  北京烤鸭卷: 'Duck Wrap',
});

// the source labels the middle quality "Average" (docs/wp/STATUS.md, UI builder A)
const QUALITY_SUFFIX = [
  ['(完美)', 'Perfect'],
  ['(优良)', 'Good'],
  ['(普通)', 'Average'],
  ['(失败)', 'Failed'],
];

// Localize a string that comes from the game config (Chinese source text).
export function loc(zh) {
  if (!zh) return '';
  if (lang === 'zh') return zh;
  const steam = STEAM_NAMES[/** @type {keyof typeof STEAM_NAMES} */ (zh)];
  if (steam) return steam;
  const direct = EN_NAMES[zh];
  if (direct) return direct;
  for (const [suffix, label] of QUALITY_SUFFIX) {
    if (zh.endsWith(suffix)) {
      const base = loc(zh.slice(0, -suffix.length));
      return `${base} (${label})`;
    }
  }
  if (zh.endsWith('包裹')) return `${loc(zh.slice(0, -2))} Package`;
  return zh;
}

// UI strings: STRINGS[key] = { en, zh }. Supports {name} placeholders.
export function tr(key, vars) {
  const entry = STRINGS[key];
  let s = entry ? entry[lang] ?? entry.en : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return s;
}

// For content authored in both languages inline: pick({en, zh}).
export function pickLang(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj.en ?? obj.zh ?? '';
}
