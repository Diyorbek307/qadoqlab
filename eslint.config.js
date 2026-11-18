'use strict';

// Lint without installing anything into the project:
//   npx eslint@9
const node = {
  require: 'readonly',
  module: 'writable',
  process: 'readonly',
  console: 'readonly',
  __dirname: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  AbortController: 'readonly',
  Intl: 'readonly',
};
const browser = {
  window: 'readonly',
  document: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  URLSearchParams: 'readonly',
  IntersectionObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  Element: 'readonly',
  Intl: 'readonly',
  confirm: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  Set: 'readonly',
  Promise: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-redeclare': 'error',
  'no-shadow-restricted-names': 'error',
  'no-self-compare': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
};

module.exports = [
  { ignores: ['dist/**', 'dist-demo/**', 'data/**', 'preview/**', 'node_modules/**', '**/*.next/**'] },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: node }, rules },
  // Callbacks passed to page.evaluate() run in the browser.
  {
    files: ['scripts/test-browser.js', 'scripts/render-static.js'],
    languageOptions: { globals: { ...node, ...browser, getComputedStyle: 'readonly' } },
  },
  {
    files: ['src/assets/app.js', 'src/admin/admin.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: browser },
    rules,
  },
];
