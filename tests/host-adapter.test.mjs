import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHostAdapter } from '../dist/host-adapter.js';

test('public context needs no internal imports and waits for real persistence', async () => {
  let resolveSave;
  const settings = {};
  const adapter = await resolveHostAdapter(() => ({
    extensionSettings: settings, powerUserSettings: {},
    saveSettings: () => new Promise(resolve => { resolveSave = resolve; }), saveSettingsDebounced() {},
  }), async () => { throw new Error('must not import'); });
  assert.equal(adapter.source, 'context');
  assert.equal(adapter.extensionSettings, settings);
  let done = false;
  const pending = adapter.saveSettings().then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false);
  resolveSave(); await pending; assert.equal(done, true);
});

test('partial context imports only the missing save API; debounce is not a save barrier', async () => {
  const imports = [];
  let saved = 0;
  const adapter = await resolveHostAdapter(() => ({
    extensionSettings: {}, powerUserSettings: {}, saveSettingsDebounced() {},
  }), async path => { imports.push(path); return { saveSettings: async () => { saved++; } }; });
  assert.deepEqual(imports, ['/script.js']); assert.equal(adapter.source, 'mixed');
  await adapter.saveSettings(); assert.equal(saved, 1);
});

test('unavailable context resolves legacy modules; invalid settings fail without fabricating storage', async () => {
  const adapter = await resolveHostAdapter(() => { throw new Error('not ready'); }, async path => ({
    '/script.js': { saveSettings: async () => {}, saveSettingsDebounced() {} },
    '/scripts/extensions.js': { extension_settings: {} },
    '/scripts/power-user.js': { power_user: {} },
  })[path]);
  assert.equal(adapter.source, 'legacy');
  await assert.rejects(resolveHostAdapter(() => ({}), async () => ({})), /宿主未提供/);
});
