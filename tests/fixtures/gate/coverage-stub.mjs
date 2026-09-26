// @ts-check
// Stands in for tools/coverage.mjs in tests/gate-coverage.test.js: 90% covered, so it passes before P3 and fails from P3.
const i = process.argv.indexOf('--phase');
const phase = i > 0 ? Number(/^P(\d+)$/.exec(process.argv[i + 1] || '')?.[1] ?? NaN) : NaN;
const required = phase >= 3;
const ok = !required;
console.log(JSON.stringify({ ok, summary: `stub 90%${required ? ` · P${phase} requires 100%` : ''}`, problems: ok ? [] : [`stub: 90% — P${phase} requires 100%`] }));
process.exit(ok ? 0 : 1);
