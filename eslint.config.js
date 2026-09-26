// @ts-check
// ESLint (flat config): @eslint/js recommended on every JS file, with browser globals for the game, Node globals for
// tools, and both for tests (they drive the UI through a DOM stand-in).
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'research/', 'src/data/gen/', 'assets/cache/', 'tools/bin/', 'test-results/', 'playwright-report/', '**/.venv/', '.claude/'],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // `try { … } catch {}` is the deliberate "storage unavailable, carry on" idiom of src/engine/save.js and friends.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/**/*.js', 'pages/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tools/**/*.{js,mjs}', '*.config.js'], languageOptions: { globals: globals.node } },
  { files: ['tests/**/*.{js,mjs}'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
