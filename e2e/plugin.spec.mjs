import { test, expect } from '@playwright/test';

async function ready(page, query = '') {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.fixtureReady);
  await expect(page.locator('#qyh-toast-blocker-panel')).toHaveCount(1);
}

test('分类屏蔽、聚合与停用后恢复原生 Toastr', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => toastr.info('应被屏蔽'));
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.evaluate(async () => { await ToastBlocker.disable(); await ToastBlocker.redraw(true); });
  await page.evaluate(() => { for (let i = 0; i < 3; i++) toastr.info('重复内容'); });
  await expect(page.locator('.qyh-toast-redraw')).toHaveCount(1);
  await expect(page.locator('.qyh-toast-redraw-count')).toHaveText('×3');
  await page.locator('.qyh-toast-redraw').click();
  await expect(page.locator('.qyh-toast-redraw')).toHaveCount(0);
  await page.evaluate(() => fixtureModule.onDisable());
  await page.evaluate(() => toastr.info('恢复原生'));
  await expect(page.locator('#toast-container > .toast')).toHaveCount(1);
  expect(await page.evaluate(() => fixturePowerUser.custom_css)).not.toContain('managed start');
});

test('启动通知共享可见上限、保留事件、支持 remove 与清理', async ({ page }) => {
  await page.addInitScript(() => {
    window.startupCount = 5;
    window.initialSettings = { qyh_toast_blocker: { enabled: false, redrawEnabled: true, redrawMaxVisible: 2 } };
  });
  await ready(page);
  await expect(page.locator('[data-qyh-adopted-toast]')).toHaveCount(2);
  expect(await page.evaluate(() => ToastBlocker.status().redraw.adoptedActive)).toBe(2);
  await page.locator('.native-link').first().click();
  await expect.poll(() => page.evaluate(() => window.linkClicks)).toBe(1);
  await expect(page.locator('[data-qyh-adopted-toast]')).toHaveCount(1);
  await page.evaluate(() => toastr.remove($('.qyh-toast-redraw').first()));
  await expect(page.locator('.qyh-toast-redraw')).toHaveCount(0);
  await page.evaluate(() => ToastBlocker.shutdown());
  await expect(page.locator('.qyh-toast-redraw-container')).toHaveCount(0);
});

test('容器延迟出现及重建后仍及时清理绕过守卫的通知', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const container = document.createElement('div'); container.id = 'toast-container'; document.body.append(container);
    container.innerHTML = '<div class="toast toast-error">绕过方法守卫</div>';
  });
  await expect(page.locator('#toast-container > .toast')).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector('#toast-container').remove();
    const next = document.createElement('div'); next.id = 'toast-container'; document.body.append(next);
  });
  // 等待自适应看门狗重新定向至新容器。
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#toast-container').innerHTML = '<div class="toast toast-error">重建</div>');
  await expect(page.locator('#toast-container > .toast')).toHaveCount(0);
});

test('移动布局、键盘开关与剪贴板失败时手动复制', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await ready(page);
  await page.locator('.inline-drawer-toggle').click();
  const input = page.locator('[data-toast-level="info"]');
  await input.focus(); await page.keyboard.press('Space');
  await expect(input).not.toBeChecked();
  await page.locator('#qyh-toast-blocker-self-check').click();
  const output = page.locator('#qyh-toast-blocker-report');
  await expect(output).toBeVisible();
  const report = JSON.parse(await output.inputValue());
  expect(report.version).toBe('1.4.0');
  expect(report.settings.blockedLevels.info).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (page.viewportSize().width < 600) {
    const rects = await page.locator('.qyh-toast-blocker-level').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(rects[0].y).toBe(rects[1].y); expect(rects[2].y).toBe(rects[3].y);
    expect(rects[0].x).toBe(rects[2].x); expect(rects[2].y).toBeGreaterThan(rects[0].y);
  }
});

for (const adapter of ['context', 'mixed', 'legacy']) {
  test(`宿主适配 ${adapter}，保存与重复激活`, async ({ page }) => {
    await ready(page, `?adapter=${adapter}`);
    expect(await page.evaluate(() => JSON.parse(ToastBlocker.selfCheck()).hostAdapter)).toBe(adapter);
    await page.evaluate(async () => { await ToastBlocker.setLevel('error', false); await fixtureModule.onActivate(); });
    await expect(page.locator('#qyh-toast-blocker-panel')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-settings')).qyh_toast_blocker.blockedLevels.error)).toBe(false);
    expect(await page.evaluate(() => fixturePowerUser.custom_css)).toContain('--user-style');
  });
}

test('刷新需要二次确认且等待设置落盘', async ({ page }) => {
  await ready(page);
  await page.locator('.inline-drawer-toggle').click();
  const refresh = page.locator('#qyh-toast-blocker-refresh');
  await refresh.click();
  await expect(refresh).toContainText('再次点击');
  await page.evaluate(() => { ToastBlocker.status(); window.fixtureExtensionSettings.qyh_toast_blocker.redrawMaxVisible = 3; });
  await Promise.all([page.waitForEvent('load'), refresh.click()]);
  await page.waitForFunction(() => window.fixtureReady);
  expect(await page.evaluate(() => ToastBlocker.status().settings.redrawMaxVisible)).toBe(3);
});
