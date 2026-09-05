import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = process.cwd();
const legacy = {
  '/script.js': 'export const saveSettings = window.fixtureSave; export const saveSettingsDebounced = window.fixtureSave;',
  '/scripts/extensions.js': 'export const extension_settings = window.fixtureExtensionSettings;',
  '/scripts/power-user.js': 'export const power_user = window.fixturePowerUser;',
};
http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path in legacy) {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    return response.end(legacy[path]);
  }
  const file = resolve(root, `.${path === '/' ? '/e2e/fixture.html' : path}`);
  if (!file.startsWith(`${root}/`)) { response.writeHead(403); return response.end(); }
  try {
    const bytes = await readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)];
    response.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
}).listen(4173, '127.0.0.1');
