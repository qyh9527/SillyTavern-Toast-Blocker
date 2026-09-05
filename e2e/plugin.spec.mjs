import { test, expect } from '@playwright/test';
import { VERSION } from '../dist/version.js';

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
  expect(report.version).toBe(VERSION);
  expect(report.settings.blockedLevels.info).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (page.viewportSize().width < 600) {
    const rects = await page.locator('.qyh-toast-blocker-level').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(rects[0].y).toBe(rects[1].y); expect(rects[2].y).toBe(rects[3].y);
    expect(rects[0].x).toBe(rects[2].x); expect(rects[2].y).toBeGreaterThan(rects[0].y);

    // 顶部状态头必须作为正常文档流的独立块，不能再次覆盖“启用分类屏蔽”。
    const [headerBox, firstRowBox] = await Promise.all([
      page.locator('.qyh-toast-plugin-status').boundingBox(),
      page.locator('.inline-drawer-content > .qyh-toast-blocker-row').first().boundingBox(),
    ]);
    expect(headerBox).not.toBeNull();
    expect(firstRowBox).not.toBeNull();
    expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(firstRowBox.y + 1);
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

test('宿主强制显示文本框时仍无空白框，复制成功后收起且概览可见', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async text => { window.copiedReport = text; } },
  }));
  await ready(page);
  await page.locator('.inline-drawer-toggle').click();
  await page.addStyleTag({ content: 'textarea.text_pole { display: block !important; }' });
  const report = page.locator('#qyh-toast-blocker-report');
  await expect(report).toBeHidden();
  await expect(page.locator('.qyh-toast-overview-toggle')).toBeVisible();
  await expect(page.locator('[data-health="batch"]')).toBeHidden();
  await page.locator('.qyh-toast-overview-toggle').click();
  await expect(page.locator('[data-health="batch"]')).toHaveText('暂无批次样本');
  await page.locator('#qyh-toast-blocker-self-check').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.copiedReport).version)).toBe(VERSION);
  await expect(report).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('实机数据可视化区分页面长帧与无重绘样本，清零后同步更新', async ({ page }) => {
  await page.addInitScript(() => {
    window.initialSettings = { qyh_toast_blocker: { enabled: true, blockedLevels: { success: true, info: true, warning: true, error: false }, redrawEnabled: true, diagnosticsEnabled: true } };
    window.PerformanceObserver = class {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(callback) { this.callback = callback; window.fixturePerformance = this; }
      observe(options) { window.fixtureObserveOptions = options; }
      disconnect() {}
      takeRecords() { return []; }
      emit() { this.callback({ getEntries: () => Array.from({ length: 152 }, () => ({ duration: 587.4 })) }); }
    };
  });
  await ready(page, '?adapter=mixed');
  await page.locator('.inline-drawer-toggle').click();
  // 诊断已启用：概览自动展开，无需手动点击。
  const overviewToggle = page.locator('.qyh-toast-overview-toggle');
  const topHealth = page.locator('.qyh-toast-plugin-status [data-health="summary"]');
  const overviewHealth = page.locator('.qyh-toast-overview [data-health="summary"]');
  await expect(overviewToggle).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => fixturePerformance.emit());
  // 顶部小状态头与诊断概览必须同步显示同一份健康模型。
  await expect(topHealth).toHaveText('通知链路正常');
  await expect(overviewHealth).toHaveText('通知链路正常');
  await expect(page.locator('[data-health="batch"]')).toHaveText('暂无批次样本');
  await expect(page.locator('[data-health="page"]')).toHaveText('152 次');
  await expect(page.locator('[data-health="rendered"]')).toHaveText('0');
  await expect(page.locator('[data-health="pageNote"]')).toHaveText('最长 587.4 ms');
  await expect(page.locator('.qyh-toast-page-observation')).toContainText('不能据此归因于本插件');
  expect(await page.evaluate(() => fixtureObserveOptions.buffered)).toBe(false);
  await page.locator('#qyh-toast-blocker-diagnostics-reset').click();
  await expect(page.locator('[data-health="page"]')).toHaveText('0 次');
  const snapshot = await page.evaluate(() => JSON.parse(ToastBlocker.selfCheck()));
  expect(snapshot.reportSchema).toBe(2);
  expect(snapshot.runtime.timingSampleState).toBe('no-samples');
  expect(snapshot.runtime.pageTimingScope).toBe('whole-page');
  await page.evaluate(() => toastr.error('重绘测量'));
  await expect(page.locator('[data-health="batch"]')).toContainText('ms');
  await expect(page.locator('[data-health="rendered"]')).toHaveText('1');
  await page.evaluate(() => toastr.remove());
  // 关闭本地性能诊断：自动收回折叠，仅保留概览标题。
  await page.evaluate(() => {
    document.querySelector('#qyh-toast-blocker-diagnostics').checked = false;
    document.querySelector('#qyh-toast-blocker-diagnostics').dispatchEvent(new Event('change'));
  });
  await expect(overviewToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-health="batch"]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('真实发布样式下抽屉默认折叠，反复展开后状态头仍位于首行上方', async ({ page }) => {
  await ready(page);
  const content = page.locator('#qyh-toast-blocker-panel > .inline-drawer-content');
  const toggle = page.locator('#qyh-toast-blocker-panel > .inline-drawer-toggle');
  await expect(content).toBeHidden();
  for (let i = 0; i < 2; i++) {
    await toggle.click();
    await expect(content).toBeVisible();
    const geometry = await content.evaluate(node => {
      const header = node.querySelector('.qyh-toast-plugin-status').getBoundingClientRect();
      const firstRow = node.querySelector('.qyh-toast-blocker-row').getBoundingClientRect();
      return { headerBottom: header.bottom, firstRowTop: firstRow.top };
    });
    expect(geometry.headerBottom).toBeLessThanOrEqual(geometry.firstRowTop + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await toggle.click();
    await expect(content).toBeHidden();
  }
});

test('通知刷新状态时保留正在编辑的显示上限，提交后规范化并保存', async ({ page }) => {
  await ready(page);
  await page.locator('.inline-drawer-toggle').click();
  await page.evaluate(() => ToastBlocker.redraw(true));
  const limit = page.locator('#qyh-toast-blocker-redraw-limit');
  await limit.focus();
  await limit.fill('12');
  // 触发真实拦截与状态绘制，不能把尚未失焦的输入重置成旧设置。
  await page.evaluate(async () => {
    toastr.info('编辑中拦截');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(limit).toHaveValue('12');
  await limit.fill('99');
  await limit.press('Tab');
  await expect(limit).toHaveValue('20');
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-settings')).qyh_toast_blocker.redrawMaxVisible)).toBe(20);
});
