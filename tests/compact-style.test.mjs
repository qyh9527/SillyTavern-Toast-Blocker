import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../style-compact.css', import.meta.url), 'utf8');
const mobileStart = css.indexOf('@media (max-width: 520px)');
const reducedStart = css.indexOf('@media (prefers-reduced-motion: reduce)', mobileStart);
const mobileCss = css.slice(mobileStart, reducedStart);

test('compact skin layers on top of the stable base stylesheet', () => {
  assert.match(css, /^@import url\("\.\/style\.css"\);/);
});

test('mobile skin keeps 2x2 toast cards while compressing secondary copy', () => {
  assert.ok(mobileStart >= 0);
  assert.match(mobileCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mobileCss, /min-height:\s*3\.25rem/);
  assert.match(mobileCss, /\.qyh-toast-blocker-help\s*\{[\s\S]*display:\s*none/);
  assert.match(mobileCss, /-webkit-line-clamp:\s*2/);
});

test('compact skin avoids expensive persistent effects', () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /animation:\s*[^;]+infinite/);
});
