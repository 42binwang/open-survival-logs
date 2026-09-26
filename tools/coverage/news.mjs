// @ts-check
// Patch notes: the line items of https://store.steampowered.com/news/app/4164790, and the FEATURES.md rows they may map to.
//
// The news file is the text of every official Steam post (a "######## <date> | <title>" line, then the body). The
// scrape joined the HTML list items without separators, so a line item ends where a sentence end, a closing bracket
// or a lowercase letter is glued to the next item's capital ("…settings.Mouse stability: …", "Update DetailsUpgraded
// …"), and where a "【…】" or "\[…]" section heading starts. Headings name the section of the items after them; every
// other piece is a line item. URLs and file paths are kept whole. An item's id is its post date and a hash of its text, so the map
// (docs/coverage/news-map.json) survives reordering and flags any item whose text changed.
import { createHash } from 'node:crypto';

/**
 * @typedef {{ id: string, date: string, post: string, section: string, text: string }} NewsItem
 * @typedef {{ id: string, status: string, feature: string }} FeatureRow
 */

const POST = /^######## (\d{4}-\d{2}-\d{2}) \| (.*)$/;
const HEADING = /^(【[^】]*】|\\?\[[^\]]*\])$/;
// URLs and file paths (two slashes or more) stay whole: their camel-cased parts are no item boundaries. While the
// text is split they stand in as a numbered placeholder between two private-use marks.
const URL_RE = /https?:\/\/\S+|\S*\/\S*\/\S*/g;
const MARK = '\uE000';
const HOLE = new RegExp(`${MARK}(\\d+)${MARK}`, 'g');
// Item boundaries: a sentence end, closing bracket or closing curly quote glued to a capital or a heading (a straight
// quote may open a phrase, so it is none); a lowercase letter or digit glued to a capitalised word; any "【"; a
// "M/D Update" date heading glued after a sentence end.
const SPLIT = /(?<=[.!?。！？)）】\]”])(?=[A-Z【]|\\\[)|(?<=[a-z0-9])(?=[A-Z][a-z])|(?<=.)(?=【)|(?<=[a-z0-9])(?=\\\[)|(?<=[.!?])(?=\d{1,2}\/\d{1,2} Update)/;

/** @param {string} s */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
/** @param {string} s */
const hash = (s) => createHash('sha1').update(norm(s)).digest('hex').slice(0, 8);

/**
 * @param {string} text  the news file
 * @returns {NewsItem[]}
 */
export function newsItems(text) {
  /** @type {NewsItem[]} */
  const out = [];
  /** @type {{ date: string, title: string, lines: string[] } | null} */
  let post = null;
  const posts = [];
  for (const line of text.split('\n')) {
    const m = POST.exec(line);
    if (m) {
      post = { date: m[1], title: m[2].trim(), lines: [] };
      posts.push(post);
    } else if (post && line.trim()) post.lines.push(line.trim());
  }
  for (const [pi, p] of posts.entries()) {
    let section = '';
    /** @type {Map<string, number>} */
    const seen = new Map();
    for (const line of p.lines) {
      /** @type {string[]} */
      const urls = [];
      const masked = line.replace(URL_RE, (u) => `${MARK}${urls.push(u) - 1}${MARK}`);
      for (const piece of masked.split(SPLIT)) {
        const seg = norm(piece.replace(HOLE, (_, i) => urls[Number(i)]));
        if (!seg) continue;
        if (HEADING.test(seg)) {
          section = seg.replace(/^\\?\[|\]$|^【|】$/g, '');
          continue;
        }
        // the post's index keeps two same-day posts that repeat a line apart
        const base = `${p.date}-p${String(pi).padStart(2, '0')}-${hash(seg)}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        out.push({ id: n > 1 ? `${base}-${n}` : base, date: p.date, post: p.title, section, text: seg });
      }
    }
  }
  return out;
}

/**
 * The rows of docs/FEATURES.md ("| A01 | feature | source | status | code | test |").
 * @param {string} md
 * @returns {Map<string, FeatureRow>}
 */
export function featureRows(md) {
  /** @type {Map<string, FeatureRow>} */
  const rows = new Map();
  for (const line of md.split('\n')) {
    const m = /^\|\s*([A-Z]\d{2,})\s*\|\s*(.*?)\s*\|\s*.*?\s*\|\s*(✅|🟨|⬜)\s*\|/.exec(line);
    if (m) rows.set(m[1], { id: m[1], feature: m[2], status: m[3] });
  }
  return rows;
}
