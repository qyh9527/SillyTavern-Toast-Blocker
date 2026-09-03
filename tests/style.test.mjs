import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const mobileStart = css.indexOf('@media (max-width: 520px)');
const mobileEnd = css.indexOf('@media (prefers-reduced-motion: reduce)', mobileStart);
const mobileCss = css.slice(mobileStart, mobileEnd);

test('mobile toast type cards remain a compact two-column grid', () => {
  assert.ok(mobileStart >= 0);
  assert.match(mobileCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(mobileCss, /grid-template-columns:\s*1fr\s*;/);
  assert.match(mobileCss, /min-height:\s*3\.25rem/);
  assert.match(mobileCss, /grid-column:\s*1\s*\/\s*-1/);
});

test('toast type cards expose selected, focus and reduced-motion states', () => {
  assert.match(css, /\.qyh-toast-blocker-level:has\(input:checked\)/);
  assert.match(css, /\.qyh-toast-blocker-level:focus-within/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('panel toggles use host-style-resistant pills without checkmark glyphs', () => {
  assert.match(css, /\.checkbox_label input\[type="checkbox"\]/);
  assert.match(css, /border-radius:\s*999px\s*!important/);
  assert.match(css, /content:\s*none\s*!important/);
  assert.match(css, /content:\s*""\s*!important/);
  assert.doesNotMatch(css, /content:\s*["']✓["']/);
  assert.match(css, /translate3d\(1rem,\s*-50%,\s*0\)/);
});
