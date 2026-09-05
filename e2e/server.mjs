import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { relative, resolve, extname } from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
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
  // path.resolve 随平台产生 \ 或 /，字符串前缀在 Windows 会误拦截；按相对路径越界判断。
  const within = relative(root, file);
  if (within.startsWith('..') || resolve(within) === within) { response.writeHead(403); return response.end(); }
  try {
    const bytes = await readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)];
    response.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(path === '/' || path === '/e2e/fixture.html'
      ? bytes.toString().replace('__PLUGIN_CSS__', manifest.css).replace('__PLUGIN_JS__', manifest.js)
      : bytes);
  } catch { response.writeHead(404); response.end(); }
}).listen(4173, '127.0.0.1');
