// @ts-check
// The report: the verdict for the gate (JSON), the terminal table and the Markdown report (docs/coverage/P<n>.md).

/** Phase from which every family must be at 100% (docs/wp: coverage is printed in P0–P2 and required from P3). */
export const REQUIRED_FROM = 3;

/**
 * FEATURES.md rows a gap in a family's check reopens (the integrator edits the ledger).
 * @type {Record<string, Record<string, string[]>>}
 */
export const ROWS = {
  items: { obtain: ['D06', 'G01', 'G05'], use: ['D06', 'D10', 'G04', 'C11'] },
  furniture: { obtain: ['E08', 'F03', 'F01'], install: ['F03'], placed: ['F01', 'E04', 'N01', 'N02'], functions: ['F04', 'N02'], render: [] },
  funcs: { spec: ['F04'], test: ['F04'], loot: ['N02', 'F04'] },
  cooking: { cook: ['G05', 'G03'], outputs: ['G05'] },
  crafting: { craft: ['I02'], outputs: ['I02'], unlock: ['I04'] },
  plants: { plant: ['H02'], harvest: ['H02'], outputs: ['H02'] },
  achievements: { test: ['S03'], counter: ['S03'] },
  news: { mapped: [] },
};

/**
 * FEATURES.md rows the failing entities reopen: an entity's own rows for a check where the family sets them, else the
 * family's rows for that check.
 * @param {import('./family.mjs').Family[]} families
 * @returns {{ rows: string[], family: string, check: string, ids: string[] }[]}
 */
export function reopenRows(families) {
  /** @type {Map<string, { rows: string[], family: string, check: string, ids: string[] }>} */
  const by = new Map();
  for (const f of families) {
    for (const c of f.checks) {
      for (const e of f.entities) {
        if (!e.checks[c.id] || e.checks[c.id].ok) continue;
        const rows = e.rows?.[c.id] || ROWS[f.id]?.[c.id] || [];
        const key = `${rows.join(',')}|${f.id}|${c.id}`;
        if (!by.has(key)) by.set(key, { rows, family: f.id, check: c.id, ids: [] });
        by.get(key)?.ids.push(e.id);
      }
    }
  }
  return [...by.values()];
}

/**
 * An in-scope check no probe or driver can pass even at full parity, as a tool problem.
 * @param {import('./selfcheck.mjs').Impossible} x
 */
export const toolProblem = (x) => `tool: ${x.family}/${x.check} ${x.id} can never pass, even at full parity (${x.why})`;

/**
 * @param {import('./family.mjs').Family[]} families
 * @param {{ phase: number | null, problems: string[], warnings: string[], impossible?: import('./selfcheck.mjs').Impossible[] }} ctx
 */
export function verdict(families, { phase, problems, warnings, impossible = [] }) {
  const required = phase != null && phase >= REQUIRED_FROM;
  const scope = families.reduce((a, f) => a + f.scope, 0);
  const ok = families.reduce((a, f) => a + f.ok, 0);
  const pct = scope ? Math.floor((ok / scope) * 1000) / 10 : 100;
  // checks no probe can pass fail the run in every phase: 100% could never be reached by building the game
  const out = [...problems, ...impossible.map(toolProblem)];
  if (required) for (const f of families) if (f.ok < f.scope) out.push(`${f.id}: ${f.pct}% (${f.scope - f.ok} of ${f.scope} entities fail) — P${phase} requires 100%`);
  const fams = families.map((f) => ({
    id: f.id,
    title: f.title,
    source: f.source,
    total: f.total,
    excluded: f.excluded.length,
    scope: f.scope,
    ok: f.ok,
    pct: f.pct,
    required,
    checks: f.checks.map((c) => {
      const applies = f.entities.filter((e) => e.checks[c.id]);
      return { id: c.id, title: c.title, ok: applies.filter((e) => e.checks[c.id].ok).length, of: applies.length };
    }),
    gaps: Object.fromEntries(f.checks.map((c) => [c.id, f.entities.filter((e) => e.checks[c.id] && !e.checks[c.id].ok).map((e) => e.id)]).filter(([, ids]) => ids.length)),
  }));
  const summary = `${fams.map((f) => `${f.id} ${f.pct}%`).join(', ')} · total ${pct}% (${ok}/${scope})${required ? ` · P${phase} requires 100%` : phase != null ? ` · P${phase}: printed, 100% required from P${REQUIRED_FROM}` : ''}${problems.length ? ` · ${problems.length} probe error(s)` : ''}${impossible.length ? ` · ${impossible.length} check(s) no probe can pass` : ''}`;
  return { tool: 'coverage', ok: out.length === 0, summary, phase: phase == null ? null : `P${phase}`, required, total: { ok, scope, pct }, families: fams, reopen: reopenRows(families), impossible, problems: out, warnings };
}

/** @param {string} s @param {number} n */
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
/** @param {string} s @param {number} n */
const lpad = (s, n) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

/**
 * @param {ReturnType<typeof verdict>} v
 * @param {{ ms: number, where: string }} meta
 */
export function table(v, meta) {
  const lines = [`Survival Log coverage · ${v.phase ?? 'phase unknown'} · ${meta.where} · ${(meta.ms / 1000).toFixed(1)} s`, ''];
  lines.push(`${pad('Family', 22)}${lpad('Config', 8)}${lpad('Left out', 10)}${lpad('Scope', 8)}${lpad('Covered', 9)}${lpad('%', 8)}   Checks`);
  for (const f of v.families) {
    const checks = f.checks.map((c) => `${c.id} ${c.ok}/${c.of}`).join(', ');
    lines.push(`${pad(f.title, 22)}${lpad(String(f.total), 8)}${lpad(String(f.excluded), 10)}${lpad(String(f.scope), 8)}${lpad(String(f.ok), 9)}${lpad(`${f.pct}%`, 8)}   ${checks}`);
  }
  lines.push(`${pad('Total', 22)}${lpad('', 8)}${lpad('', 10)}${lpad(String(v.total.scope), 8)}${lpad(String(v.total.ok), 9)}${lpad(`${v.total.pct}%`, 8)}`);
  lines.push('', v.required ? `${v.phase} requires every family at 100%.` : `Printed only${v.phase ? ` in ${v.phase}` : ''}: every family must reach 100% from P${REQUIRED_FROM} (--phase P${REQUIRED_FROM}).`);
  lines.push(v.impossible.length ? `Self-check: ${v.impossible.length} in-scope check(s) no probe can pass even at full parity (tool problems below).` : 'Self-check: every in-scope check is one some probe can pass once the game does what its config says.');
  if (v.problems.length) lines.push('', 'Problems:', ...v.problems.map((p) => `  ✖ ${p}`));
  if (v.warnings.length) lines.push('', `${v.warnings.length} probe warning(s) (--verbose lists them)`);
  return lines.join('\n');
}

/**
 * Failing entities of one check, grouped by their reason (long ids lists stay complete).
 * @param {import('./family.mjs').Family} f
 * @param {string} checkId
 */
export function gapGroups(f, checkId) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const e of f.entities) {
    const c = e.checks[checkId];
    if (!c || c.ok) continue;
    const why = (c.detail || 'failed').replace(/\b\d{3,}\b/g, '#').replace(/\(\+\d+\)/g, '(+…)');
    groups.set(why, [...(groups.get(why) || []), e.id]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

/**
 * @param {ReturnType<typeof verdict>} v
 * @param {import('./family.mjs').Family[]} families
 * @param {{ ms: number, where: string, date: string, workers: number, tasks: number, trace: import('./trace.mjs').Trace | null, command: string }} meta
 */
export function markdown(v, families, meta) {
  const out = [];
  out.push(`# Coverage report — ${v.phase ?? 'P?'}`, '');
  out.push(
    `Generated by \`${meta.command}\` on ${meta.date} at ${meta.where}: ${meta.tasks} driver tasks on ${meta.workers} worker threads${meta.trace ? `, ${meta.trace.tests.length} traced tests` : ''}, ${(meta.ms / 1000).toFixed(0)} s.`,
    '',
    'Every denominator is the full table of the generated game config (`src/data/gen`); an entity is left out only by a rule over its own config fields (tools/coverage/data.mjs, listed at the end), never because of what the recreation’s content or sim does: a piece nothing places, a recipe the sim does not offer or a function no menu shows stays in scope and fails. Each check is an automated probe that drives the real simulation headless (`tools/coverage/drivers/`) or reads the traced test run; nothing is counted from a list written by hand.',
    ''
  );
  out.push('## Summary', '');
  out.push('| Family | Config rows | Left out | In scope | Covered | % | Checks (passing / applicable) |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const f of v.families) out.push(`| ${f.title} | ${f.total} | ${f.excluded} | ${f.scope} | ${f.ok} | ${f.pct}% | ${f.checks.map((c) => `${c.id} ${c.ok}/${c.of}`).join(' · ')} |`);
  out.push(`| **Total** | | | ${v.total.scope} | ${v.total.ok} | **${v.total.pct}%** | |`, '');
  out.push(v.required ? `${v.phase} requires every family at 100%.` : `In ${v.phase ?? 'this phase'} the coverage is printed; from P${REQUIRED_FROM} every family must be at 100% (\`--phase P${REQUIRED_FROM}\` makes anything less a failure).`, '');
  out.push('## Self-check: checks no probe can pass', '');
  out.push(
    'Every family is evaluated again on the evidence its drivers and the traced test run record when the game does everything its config says (`tools/coverage/selfcheck.mjs`), as far as the probes can observe it. A check that fails even then could never pass by building the game: it is a tool problem and fails the run in every phase.',
    ''
  );
  if (!v.impossible.length) out.push('None: every in-scope check can pass, so 100% is reachable by building the game.', '');
  else {
    /** @type {Map<string, string[]>} */
    const by = new Map();
    for (const x of v.impossible) {
      const key = `${x.family} / ${x.check}: ${x.why.replace(/\b\d{3,}\b/g, '#')}`;
      by.set(key, [...(by.get(key) || []), x.id]);
    }
    for (const [key, ids] of by) out.push(`- ✖ ${key} (${ids.length}): ${ids.join(', ')}`);
    out.push('');
  }
  out.push('## What each check means', '');
  for (const f of families) {
    out.push(`- **${f.title}** (${f.source}): ${f.checks.map((c) => `\`${c.id}\` ${c.title}`).join('; ')}.`);
    for (const n of f.notes) out.push(`  - ${n}`);
  }
  out.push('');
  out.push('## FEATURES.md rows to reopen', '', 'Rows whose features the probes found incomplete (the integrator edits the ledger):', '');
  out.push('| Rows | Family / check | Failing | Entities |', '| --- | --- | ---: | --- |');
  for (const r of v.reopen) out.push(`| ${r.rows.length ? r.rows.join(', ') : '— (no row yet)'} | ${r.family} / ${r.check} | ${r.ids.length} | ${r.ids.length > 12 ? `${r.ids.slice(0, 12).join(', ')}, … (see Gaps)` : r.ids.join(', ')} |`);
  const byRow = new Map();
  for (const r of v.reopen) for (const row of r.rows) byRow.set(row, (byRow.get(row) || 0) + r.ids.length);
  out.push('', `Distinct rows: ${[...byRow.keys()].sort().join(', ') || 'none'}.`, '');
  out.push('## Gaps', '', 'Failing entities by family and check, grouped by the probe’s reason (`#` stands for an id in the reason).', '');
  for (const f of families) {
    const failing = f.entities.filter((e) => !e.ok).length;
    out.push(`### ${f.title} — ${failing} of ${f.scope} in scope fail`, '');
    if (!failing) {
      out.push('No gaps.', '');
      continue;
    }
    for (const c of f.checks) {
      const groups = gapGroups(f, c.id);
      if (!groups.length) continue;
      out.push(`**${c.id}** — ${groups.reduce((a, g) => a + g[1].length, 0)}`, '');
      for (const [why, ids] of groups) out.push(`- ${why} (${ids.length}): ${ids.join(', ')}`);
      out.push('');
    }
  }
  out.push('## Left out by config rules', '');
  for (const f of families) {
    if (!f.excluded.length) continue;
    /** @type {Map<string, string[]>} */
    const by = new Map();
    for (const e of f.excluded) {
      const why = e.why.replace(/\(.*\)$/, '').trim();
      by.set(why, [...(by.get(why) || []), e.id]);
    }
    for (const [why, ids] of by) out.push(`- ${f.title} (${ids.length}): ${why} — ${ids.join(', ')}`);
  }
  out.push('');
  const own = new Set(v.impossible.map(toolProblem));
  const rest = v.problems.filter((p) => !own.has(p));
  if (rest.length || v.warnings.length) {
    out.push('## Probe problems and warnings', '');
    for (const p of rest) out.push(`- ✖ ${p}`);
    for (const w of v.warnings) out.push(`- ${w}`);
    out.push('');
  }
  return out.join('\n');
}
