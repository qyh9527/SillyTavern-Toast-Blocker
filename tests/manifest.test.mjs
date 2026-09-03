import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('manifest loads before ordinary third-party extensions', () => {
  assert.equal(manifest.js, 'dist/index.js');
  assert.equal(manifest.css, 'style.css');
  assert.ok(Number.isInteger(manifest.loading_order));
  assert.ok(manifest.loading_order < 0);
});

test('manifest declares lifecycle cleanup hooks', () => {
  for (const hook of ['install', 'update', 'delete', 'clean', 'enable', 'disable', 'activate']) {
    assert.equal(typeof manifest.hooks[hook], 'string');
  }
});

test('release metadata versions stay in sync', () => {
  assert.equal(manifest.version, packageJson.version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});
