import { normalizeSettings } from './core.js';
import type { RuntimeStatus } from './runtime.js';
import { VERSION } from './version.js';

export interface DiagnosticStatus extends RuntimeStatus {
  settings: unknown;
  earlyRuleInstalled: boolean;
}

/** 纯展示模型；页面长帧不参与插件健康状态判断。 */
export function buildDiagnosticView(status: DiagnosticStatus, source: string) {
  const settings = normalizeSettings(status.settings);
  const blocked = settings.enabled ? Object.values(settings.blockedLevels).filter(Boolean).length : 0;
  const expected = settings.redrawEnabled ? 4 : blocked;
  const issues = (expected > 0 && (!status.earlyRuleInstalled || status.guardedMethods < expected))
    || (blocked > 0 && !status.runtimeStyle)
    || (settings.redrawEnabled && status.auxiliaryMethods < 2);
  const collecting = settings.redrawEnabled && settings.diagnosticsEnabled;
  const samples = status.redraw.frameSamples;
  const pageSupported = status.redraw.observerType !== null;
  const count = status.redraw.observedLongFrames;
  return {
    tone: issues ? 'warning' : expected === 0 ? 'idle' : 'ok',
    summary: issues ? '有检查项需留意' : expected === 0 ? '当前已停用' : '通知链路正常',
    early: status.earlyRuleInstalled ? '已安装' : expected === 0 ? '无需安装' : '未安装',
    guards: `${status.guardedMethods} / ${expected}`,
    adapter: source === 'mixed' ? '混合适配 · 正常' : source === 'context' ? '公开接口' : '旧版兼容',
    active: `${status.redraw.active} / ${settings.redrawMaxVisible}`,
    queue: collecting ? `${status.redraw.pending} 条等待 · ${status.redraw.adoptedActive} 条启动接管` : '开启性能诊断后统计',
    batch: samples > 0 ? `${status.redraw.averageBatchMs.toFixed(2)} ms` : '暂无批次样本',
    batchNote: samples > 0
      ? `${samples} 个批次 · 最慢 ${status.redraw.maxBatchMs.toFixed(2)} ms`
      : '启动接管或开启诊断前的通知，不产生批次耗时样本。',
    page: count > 0 || pageSupported ? `${count} 次` : collecting ? '当前环境不支持' : '尚未采集',
    pageNote: count > 0 ? `最长 ${status.redraw.maxObservedLongFrameMs.toFixed(1)} ms` : '暂无页面长帧记录',
    collection: collecting ? '采集中 · 本页累计，清零后重新统计' : '耗时采集已关闭；已有统计保留',
    rendered: String(status.redraw.rendered),
    aggregated: String(status.redraw.aggregated),
    pendingPeak: String(status.redraw.pendingPeak),
    visibilityPauses: String(status.redraw.visibilityPauses),
    maxBatch: samples > 0 ? `${status.redraw.maxBatchMs.toFixed(2)} ms` : '暂无样本',
    overBudget: String(status.redraw.overBudgetBatches),
    budget: Math.min(100, Math.max(0, status.redraw.averageBatchMs / (1000 / 60) * 100)),
    samples,
  };
}

export const PLUGIN_STATUS_HTML = `
  <section class="qyh-toast-plugin-status" aria-label="插件状态">
    <div class="qyh-toast-plugin-status__identity">
      <strong>Toast 屏蔽与重绘器</strong>
      <span class="qyh-toast-plugin-version">v${VERSION}</span>
    </div>
    <span data-health="summary" class="qyh-toast-health-badge qyh-toast-plugin-health"></span>
  </section>`;

export const DIAGNOSTIC_OVERVIEW_HTML = `
  <section class="qyh-toast-overview" aria-label="可视化诊断概览">
    <button class="qyh-toast-overview-toggle" type="button" aria-expanded="false" aria-controls="qyh-toast-overview-body">
      <strong>诊断概览</strong>
      <span data-health="summary" class="qyh-toast-health-badge"></span>
      <i class="fa-solid fa-circle-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="qyh-toast-overview-body" id="qyh-toast-overview-body" hidden>
      <div class="qyh-toast-health-checks">
        <div><span>早期规则</span><strong data-health="early"></strong></div>
        <div><span>方法守卫</span><strong data-health="guards"></strong></div>
        <div><span>宿主接口</span><strong data-health="adapter"></strong></div>
      </div>
      <div class="qyh-toast-overview-grid">
        <article><small>当前通知</small><strong data-health="active"></strong><span data-health="queue"></span></article>
        <article><small>插件重绘 · 平均批次</small><strong data-health="batch"></strong><span data-health="batchNote"></span>
          <div class="qyh-toast-budget" aria-hidden="true"><span data-health-budget></span></div>
          <small>条形仅对照 16.7 ms 参考预算</small>
        </article>
        <article class="qyh-toast-page-observation"><small>整个页面 · 长帧 / 长任务</small><strong data-health="page"></strong><span data-health="pageNote"></span>
          <p>包含酒馆、主题与其他扩展，不能据此归因于本插件。</p>
        </article>
      </div>
      <div class="qyh-toast-overview-grid">
        <article><small>已重绘</small><strong data-health="rendered"></strong></article>
        <article><small>已聚合</small><strong data-health="aggregated"></strong></article>
        <article><small>队列峰值</small><strong data-health="pendingPeak"></strong></article>
        <article><small>后台暂停</small><strong data-health="visibilityPauses"></strong></article>
        <article><small>最慢批次</small><strong data-health="maxBatch"></strong></article>
        <article><small>超帧预算</small><strong data-health="overBudget"></strong></article>
        <button id="qyh-toast-blocker-diagnostics-reset" class="menu_button" type="button">清空诊断统计</button>
      </div>
      <p class="qyh-toast-blocker-help" data-health="collection"></p>
      <p class="qyh-toast-blocker-help">这是状态概览，不代表已验证所有设备。原生启动通知仍使用宿主计时器。</p>
    </div>
  </section>`;

export function paintDiagnosticView(panel: HTMLElement, status: DiagnosticStatus, source: string): void {
  const view = buildDiagnosticView(status, source);
  const summaryNodes = panel.querySelectorAll<HTMLElement>('[data-health="summary"]');
  for (const [key, value] of Object.entries(view)) {
    if (key === 'summary') {
      for (const node of summaryNodes) {
        if (node.textContent !== String(value)) node.textContent = String(value);
      }
      continue;
    }
    const node = panel.querySelector<HTMLElement>(`[data-health="${key}"]`);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }
  for (const badge of summaryNodes) {
    if (badge.dataset.tone !== view.tone) badge.dataset.tone = view.tone;
  }
  const bar = panel.querySelector<HTMLElement>('[data-health-budget]');
  if (bar) bar.style.width = `${view.samples ? view.budget : 0}%`;
}
