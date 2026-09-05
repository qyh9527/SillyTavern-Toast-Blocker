import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../style-status.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('top status header reuses the existing diagnostic toggle and health badge', () => {
  assert.match(css, /^@import url\("\.\/style-compact\.css"\);/);
  assert.match(css, /\.qyh-toast-overview-toggle/);
  assert.match(css, /\.qyh-toast-health-badge/);
  assert.match(css, /position:\s*absolute/);
});

test('visual version stays synced with release metadata', () => {
  assert.match(css, new RegExp(`content:\\s*"v${manifest.version.replaceAll('.', '\\.') }"`));
});

test('top status header remains a low-overhead static skin', () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /animation:\s*[^;]+infinite/);
  assert.doesNotMatch(css, /@keyframes/);
});
