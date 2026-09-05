import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PLUGIN_STATUS_HTML, DIAGNOSTIC_OVERVIEW_HTML } from '../dist/diagnostics-view.js';

const css = await readFile(new URL('../style-status.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('top status header is separate from the diagnostic fold control', () => {
  assert.match(css, /^@import url\("\.\/style-compact\.css"\);/);
  assert.match(css, /\.qyh-toast-plugin-status/);
  assert.match(css, /\.qyh-toast-overview-toggle\s*\{[\s\S]*position:\s*static/);
  assert.equal(((PLUGIN_STATUS_HTML + DIAGNOSTIC_OVERVIEW_HTML).match(/data-health="summary"/g) ?? []).length, 2);
});

test('header version is rendered from the shared release constant', () => {
  assert.ok(PLUGIN_STATUS_HTML.includes(`v${manifest.version}`));
});

test('header preserves host drawer visibility and does not rely on CSS reordering', () => {
  const drawerRules = [...css.matchAll(/\.inline-drawer-content\s*\{([^}]+)\}/g)];
  for (const [, declarations] of drawerRules) {
    assert.doesNotMatch(declarations, /display\s*:/);
  }
  assert.doesNotMatch(css, /order\s*:\s*-1/);
  assert.doesNotMatch(css, /position\s*:\s*absolute/);
});

test('top status header remains lightweight', () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /animation:\s*[^;]+infinite/);
  assert.doesNotMatch(css, /@keyframes/);
});
