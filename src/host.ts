import { saveSettings, saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { power_user } from '/scripts/power-user.js';
import {
  SETTINGS_KEY,
  TOAST_METHODS,
  getBlockedMethods,
  hasManagedCss,
  normalizeMaxVisible,
  normalizeSettings,
  type ToastLevel,
  type ToastBlockerSettings,
  updateManagedCss,
} from './core.js';
import { ToastRuntimeBlocker } from './runtime.js';
import { createTimedConfirmation, type TimedConfirmation } from './interaction.js';
import { scheduleFrontendReload } from './reload.js';

const APP_ID = 'qyh-toast-blocker';
const INSTANCE_KEY = Symbol.for('qyh9527.sillytavern.toastBlocker');

interface PublicStatus extends Record<string, unknown> {
  enabled: boolean;
  redrawEnabled: boolean;
  blockedMethods: ToastLevel[];
  guardedMethods: number;
  observingDom: boolean;
  runtimeStyle: boolean;
  earlyRuleInstalled: boolean;
  suppressedThisSession: number;
  settings: ToastBlockerSettings;
}

class ToastBlockerHost {
  settings: ToastBlockerSettings;
  preloadPresentAtBoot: boolean;
  suppressedCount = 0;
  panel: HTMLElement | null = null;
  statusText = '';
  bootPromise: Promise<void> | null = null;
  runtime: ToastRuntimeBlocker;
  refreshConfirmation: TimedConfirmation;
  statusRenderScheduled = false;
  statusRenderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const stored = normalizeSettings(extension_settings[SETTINGS_KEY]);
    extension_settings[SETTINGS_KEY] = stored;
    this.settings = stored;
    this.preloadPresentAtBoot = hasManagedCss(power_user.custom_css);
    this.runtime = new ToastRuntimeBlocker({
      onSuppressed: data => {
        this.suppressedCount += 1;
        if (this.settings.logSuppressed) console.debug(`[${APP_ID}] suppressed ${data.level} toast`);
        this.renderStatus();
      },
      onStateChanged: () => this.renderStatus(),
    });
    this.refreshConfirmation = createTimedConfirmation({
      timeoutMs: 5000,
      onExpired: () => {
        this.resetRefreshButton();
        this.statusText = '刷新确认已自动取消，页面未刷新';
        this.renderStatus();
      },
    });
  }

  activate({ forceSave = false }: { forceSave?: boolean } = {}): Promise<void> {
    if (!this.bootPromise) {
      this.bootPromise = this.applyPreference({ forceSave }).then(() => this.mountPanelWhenReady());
    } else if (forceSave) {
      this.bootPromise = this.bootPromise.then(() => this.applyPreference({ forceSave: true }));
    }
    return this.bootPromise;
  }

  async install(): Promise<void> {
    this.settings.enabled = true;
    extension_settings[SETTINGS_KEY] = this.settings;
    await this.applyPreference({ forceSave: true });
    await this.mountPanelWhenReady();
  }

  async enableFromLifecycle(): Promise<void> {
    await this.applyPreference({ forceSave: true });
  }

  async disableFromLifecycle(): Promise<void> {
    this.runtime.configure({
      blockerEnabled: false,
      blockedLevels: this.settings.blockedLevels,
      redrawEnabled: false,
      redrawMaxVisible: this.settings.redrawMaxVisible,
      redrawAggregateDuplicates: this.settings.redrawAggregateDuplicates,
      diagnosticsEnabled: this.settings.diagnosticsEnabled,
    });
    await this.persistPreloadCss(false, this.settings.blockedLevels, false, true);
  }

  async clean(): Promise<void> {
    this.refreshConfirmation.cancel();
    this.runtime.configure({
      blockerEnabled: false,
      blockedLevels: this.settings.blockedLevels,
      redrawEnabled: false,
      redrawMaxVisible: this.settings.redrawMaxVisible,
      redrawAggregateDuplicates: this.settings.redrawAggregateDuplicates,
      diagnosticsEnabled: this.settings.diagnosticsEnabled,
    });
    await this.persistPreloadCss(false, this.settings.blockedLevels, false, false);
    delete extension_settings[SETTINGS_KEY];
    await this.forceSave();
    this.panel?.remove();
    this.panel = null;
  }

  async applyPreference({ forceSave = false }: { forceSave?: boolean } = {}): Promise<void> {
    this.applyRuntimeSettings();
    await this.persistPreloadCss(
      this.settings.enabled,
      this.settings.blockedLevels,
      this.settings.redrawEnabled,
      forceSave,
    );
    this.renderStatus();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.settings.enabled = Boolean(enabled);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.statusText = '正在保存…';
    this.renderStatus();
    this.applyRuntimeSettings();
    await this.persistPreloadCss(
      this.settings.enabled,
      this.settings.blockedLevels,
      this.settings.redrawEnabled,
      true,
    );
    this.preloadPresentAtBoot = false;
    this.statusText = this.settings.enabled
      ? '已启用；已保存所选类型，重启后可覆盖启动阶段'
      : this.settings.redrawEnabled
        ? '屏蔽器已关闭；已保留重绘器的启动接管规则'
        : '已关闭并移除早期规则';
    this.renderStatus();
  }

  async setLevel(level: ToastLevel, blocked: boolean): Promise<void> {
    this.settings.blockedLevels[level] = Boolean(blocked);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.statusText = '正在保存类型设置…';
    this.renderStatus();
    this.applyRuntimeSettings();
    await this.persistPreloadCss(
      this.settings.enabled,
      this.settings.blockedLevels,
      this.settings.redrawEnabled,
      true,
    );
    this.preloadPresentAtBoot = false;
    const count = getBlockedMethods(this.settings.blockedLevels).length;
    this.statusText = count > 0 ? `已保存：已选择 ${count} 类 Toast` : '已保存：当前未选择任何类型';
    this.renderStatus();
  }

  async setAllLevels(blocked: boolean): Promise<void> {
    for (const level of TOAST_METHODS) this.settings.blockedLevels[level] = blocked;
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.persistPreloadCss(
      this.settings.enabled,
      this.settings.blockedLevels,
      this.settings.redrawEnabled,
      true,
    );
    this.preloadPresentAtBoot = false;
    this.statusText = blocked ? '已选择全部四类 Toast' : '已取消全部类型';
    this.renderStatus();
  }

  async setLogging(enabled: boolean): Promise<void> {
    this.settings.logSuppressed = Boolean(enabled);
    extension_settings[SETTINGS_KEY] = this.settings;
    await this.forceSave();
    this.renderStatus();
  }

  async setRedrawEnabled(enabled: boolean): Promise<void> {
    this.settings.redrawEnabled = Boolean(enabled);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.persistPreloadCss(
      this.settings.enabled,
      this.settings.blockedLevels,
      this.settings.redrawEnabled,
      true,
    );
    this.preloadPresentAtBoot = false;
    this.statusText = this.settings.redrawEnabled
      ? '高性能重绘器已启用；被屏蔽类型仍优先拦截'
      : '高性能重绘器已关闭；未屏蔽类型恢复原生显示';
    this.renderStatus();
  }

  async setRedrawMaxVisible(value: unknown): Promise<void> {
    this.settings.redrawMaxVisible = normalizeMaxVisible(value);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.forceSave();
    this.renderStatus();
  }

  async setAggregateDuplicates(enabled: boolean): Promise<void> {
    this.settings.redrawAggregateDuplicates = Boolean(enabled);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.forceSave();
    this.statusText = this.settings.redrawAggregateDuplicates
      ? '重复通知聚合已启用：1 秒内相同内容合并计数'
      : '重复通知聚合已关闭';
    this.renderStatus();
  }

  async setDiagnosticsEnabled(enabled: boolean): Promise<void> {
    this.settings.diagnosticsEnabled = Boolean(enabled);
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.forceSave();
    this.statusText = this.settings.diagnosticsEnabled
      ? '本地性能诊断已启用；不会上传或记录 Toast 正文'
      : '本地性能诊断已关闭';
    this.renderStatus();
  }

  resetDiagnostics(): void {
    this.runtime.resetDiagnostics();
    this.statusText = '本地诊断统计已清零';
    this.renderStatus();
  }

  async shutdown(): Promise<void> {
    this.settings.enabled = false;
    this.settings.redrawEnabled = false;
    extension_settings[SETTINGS_KEY] = this.settings;
    this.applyRuntimeSettings();
    await this.persistPreloadCss(false, this.settings.blockedLevels, false, true);
    this.statusText = '屏蔽器与重绘器均已关闭，早期规则已清理';
    this.renderStatus();
  }

  async requestFrontendRefresh(button: HTMLButtonElement): Promise<void> {
    if (this.refreshConfirmation.activate() === 'armed') {
      button.classList.add('qyh-toast-blocker-refresh--armed');
      button.textContent = '再次点击确认刷新（5 秒内）';
      button.setAttribute('aria-label', '再次点击确认立即刷新前端');
      this.statusText = '防误触确认：5 秒内再次点击才会刷新';
      this.renderStatus();
      return;
    }

    button.classList.remove('qyh-toast-blocker-refresh--armed');
    button.disabled = true;
    button.textContent = '正在保存并刷新…';
    this.statusText = '正在保存设置，随后刷新前端…';
    this.renderStatus();
    try {
      await this.forceSave();
      scheduleFrontendReload();
    } catch {
      button.disabled = false;
      this.resetRefreshButton();
    }
  }

  resetRefreshButton(): void {
    const button = this.panel?.querySelector<HTMLButtonElement>(`#${APP_ID}-refresh`);
    if (!button) return;
    button.disabled = false;
    button.classList.remove('qyh-toast-blocker-refresh--armed');
    button.textContent = '立即刷新前端';
    button.setAttribute('aria-label', '立即刷新前端，需要连续确认两次');
  }

  applyRuntimeSettings(): void {
    this.runtime.configure({
      blockerEnabled: this.settings.enabled,
      blockedLevels: this.settings.blockedLevels,
      redrawEnabled: this.settings.redrawEnabled,
      redrawMaxVisible: this.settings.redrawMaxVisible,
      redrawAggregateDuplicates: this.settings.redrawAggregateDuplicates,
      diagnosticsEnabled: this.settings.diagnosticsEnabled,
    });
  }

  async persistPreloadCss(
    enabled: boolean,
    levels: ToastBlockerSettings['blockedLevels'],
    hideNativeUntilRedrawReady: boolean,
    forceSave: boolean,
  ): Promise<boolean> {
    const before = typeof power_user.custom_css === 'string' ? power_user.custom_css : '';
    const after = updateManagedCss(before, enabled, levels, hideNativeUntilRedrawReady);
    if (before === after) {
      if (forceSave) await this.forceSave();
      return false;
    }

    power_user.custom_css = after;
    const textarea = document.getElementById('customCSS') as HTMLTextAreaElement | null;
    if (textarea) textarea.value = after;

    let customStyle = document.getElementById('custom-style');
    if (!customStyle) {
      customStyle = document.createElement('style');
      customStyle.id = 'custom-style';
      document.head.append(customStyle);
    }
    customStyle.textContent = after;

    if (forceSave) await this.forceSave();
    else saveSettingsDebounced();
    return true;
  }

  async forceSave(): Promise<void> {
    try {
      await saveSettings();
    } catch (error) {
      console.error(`[${APP_ID}] failed to save settings`, error);
      this.statusText = `保存失败：${error instanceof Error ? error.message : String(error)}`;
      this.renderStatus();
      throw error;
    }
  }

  async mountPanelWhenReady(): Promise<void> {
    if (this.panel?.isConnected) return;
    const mount = () => document.querySelector('#extensions_settings2, #extensions_settings');
    let parent: Element | null = mount();
    if (!parent) {
      await new Promise<void>(resolve => {
        const observer = new MutationObserver(() => {
          parent = mount();
          if (!parent) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 5000);
      });
    }
    parent ||= mount();
    if (!parent || document.getElementById(`${APP_ID}-panel`)) return;

    const wrapper: HTMLElement = document.createElement('div');
    wrapper.id = `${APP_ID}-panel`;
    wrapper.className = 'inline-drawer';
    wrapper.innerHTML = `
      <div class="inline-drawer-toggle inline-drawer-header">
        <b><i class="fa-solid fa-bell-slash"></i> Toast 屏蔽与重绘器</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="qyh-toast-blocker-row">
          <div>
            <strong>启用分类屏蔽</strong>
            <div class="qyh-toast-blocker-help">所选类型同时使用早期 CSS、方法守卫和 DOM 清理。</div>
          </div>
          <label class="checkbox_label" title="启用所选类型的 Toast 屏蔽">
            <input id="${APP_ID}-enabled" type="checkbox">
            <span>启用</span>
          </label>
        </div>
        <fieldset class="qyh-toast-blocker-levels">
          <legend>要屏蔽的 Toast 类型</legend>
          <label class="qyh-toast-blocker-level qyh-toast-blocker-level--success">
            <input data-toast-level="success" type="checkbox">
            <span><strong>Success</strong><small>成功</small></span>
          </label>
          <label class="qyh-toast-blocker-level qyh-toast-blocker-level--info">
            <input data-toast-level="info" type="checkbox">
            <span><strong>Info</strong><small>信息</small></span>
          </label>
          <label class="qyh-toast-blocker-level qyh-toast-blocker-level--warning">
            <input data-toast-level="warning" type="checkbox">
            <span><strong>Warning</strong><small>警告</small></span>
          </label>
          <label class="qyh-toast-blocker-level qyh-toast-blocker-level--error">
            <input data-toast-level="error" type="checkbox">
            <span><strong>Error</strong><small>错误</small></span>
          </label>
          <div class="qyh-toast-blocker-level-actions">
            <button id="${APP_ID}-select-all" class="menu_button" type="button">全部选择</button>
            <button id="${APP_ID}-select-none" class="menu_button" type="button">全部取消</button>
          </div>
        </fieldset>
        <div class="qyh-toast-blocker-row qyh-toast-blocker-redraw-row">
          <div>
            <strong>高性能重绘器</strong>
            <div class="qyh-toast-blocker-help">异步合批未屏蔽的 Toast；屏蔽规则始终优先。</div>
          </div>
          <label class="checkbox_label" title="启用异步轻量 Toast 重绘">
            <input id="${APP_ID}-redraw" type="checkbox">
            <span>启用</span>
          </label>
        </div>
        <div class="qyh-toast-blocker-row qyh-toast-blocker-redraw-limit">
          <div>
            <strong>最大同时显示</strong>
            <div class="qyh-toast-blocker-help">超出上限时清理最早的重绘 Toast，避免通知风暴拖慢移动端。</div>
          </div>
          <input id="${APP_ID}-redraw-limit" class="text_pole" type="number" min="1" max="20" step="1" inputmode="numeric" aria-label="重绘 Toast 最大同时显示数量">
        </div>
        <div class="qyh-toast-blocker-feature-note">
          <strong>后台计时保护已内置</strong>
          <span>切到后台或锁屏时冻结剩余显示时间，回到前台后继续。</span>
        </div>
        <div class="qyh-toast-blocker-row">
          <div>
            <strong>重复通知聚合</strong>
            <div class="qyh-toast-blocker-help">1 秒内同类型、同标题和正文合并为一张卡片，并显示累计次数。</div>
          </div>
          <label class="checkbox_label" title="聚合短时间内的重复 Toast">
            <input id="${APP_ID}-aggregate" type="checkbox">
            <span>启用</span>
          </label>
        </div>
        <div class="qyh-toast-blocker-row">
          <div>
            <strong>本地性能诊断</strong>
            <div class="qyh-toast-blocker-help">只统计数量和耗时，不保存、不上传，也不读取 Toast 正文。</div>
          </div>
          <label class="checkbox_label" title="启用仅保存在内存中的性能诊断">
            <input id="${APP_ID}-diagnostics" type="checkbox">
            <span>启用</span>
          </label>
        </div>
        <section class="qyh-toast-blocker-diagnostics" id="${APP_ID}-diagnostics-panel" aria-label="本地性能诊断结果" hidden>
          <div class="qyh-toast-blocker-diagnostics-grid">
            <div><small>已重绘</small><strong data-diagnostic="rendered">0</strong></div>
            <div><small>已聚合</small><strong data-diagnostic="aggregated">0</strong></div>
            <div><small>队列峰值</small><strong data-diagnostic="pendingPeak">0</strong></div>
            <div><small>后台暂停</small><strong data-diagnostic="visibilityPauses">0</strong></div>
            <div><small>平均批次</small><strong data-diagnostic="averageBatchMs">0 ms</strong></div>
            <div><small>最慢批次</small><strong data-diagnostic="maxBatchMs">0 ms</strong></div>
            <div><small>超帧预算</small><strong data-diagnostic="overBudgetBatches">0</strong></div>
            <div><small>页面长帧</small><strong data-diagnostic="observedLongFrames">—</strong></div>
          </div>
          <div class="qyh-toast-blocker-help" data-diagnostic="observerSupport"></div>
          <button id="${APP_ID}-diagnostics-reset" class="menu_button" type="button">清空诊断统计</button>
        </section>
        <div class="qyh-toast-blocker-row">
          <div>
            <strong>控制台记录</strong>
            <div class="qyh-toast-blocker-help">只记录级别，不记录 Toast 正文。</div>
          </div>
          <label class="checkbox_label" title="记录被屏蔽的 Toast">
            <input id="${APP_ID}-logging" type="checkbox">
            <span>启用</span>
          </label>
        </div>
        <div class="qyh-toast-blocker-status" id="${APP_ID}-status" role="status"></div>
        <div class="qyh-toast-blocker-refresh-area">
          <button id="${APP_ID}-refresh" class="menu_button qyh-toast-blocker-refresh" type="button" aria-label="立即刷新前端，需要连续确认两次" aria-describedby="${APP_ID}-refresh-help">立即刷新前端</button>
          <div id="${APP_ID}-refresh-help" class="qyh-toast-blocker-help">防误触：首次点击只进入确认状态，5 秒内再次点击才会保存设置并刷新。</div>
        </div>
        <div class="qyh-toast-blocker-actions">
          <button id="${APP_ID}-repair" class="menu_button">修复早期规则</button>
          <button id="${APP_ID}-cleanup" class="menu_button">关闭并清理</button>
        </div>
        <p class="qyh-toast-blocker-help">首次安装或重新启用后建议重启一次酒馆。关闭、禁用或删除扩展时会清理持久规则。</p>
      </div>`;
    parent.append(wrapper);
    this.panel = wrapper;

    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-enabled`)?.addEventListener('change', event => {
      void this.setEnabled((event.currentTarget as HTMLInputElement).checked).catch(() => {});
    });
    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-logging`)?.addEventListener('change', event => {
      void this.setLogging((event.currentTarget as HTMLInputElement).checked).catch(() => {});
    });
    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-redraw`)?.addEventListener('change', event => {
      void this.setRedrawEnabled((event.currentTarget as HTMLInputElement).checked).catch(() => {});
    });
    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-redraw-limit`)?.addEventListener('change', event => {
      void this.setRedrawMaxVisible((event.currentTarget as HTMLInputElement).value).catch(() => {});
    });
    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-aggregate`)?.addEventListener('change', event => {
      void this.setAggregateDuplicates((event.currentTarget as HTMLInputElement).checked).catch(() => {});
    });
    wrapper.querySelector<HTMLInputElement>(`#${APP_ID}-diagnostics`)?.addEventListener('change', event => {
      void this.setDiagnosticsEnabled((event.currentTarget as HTMLInputElement).checked).catch(() => {});
    });
    wrapper.querySelector(`#${APP_ID}-diagnostics-reset`)?.addEventListener('click', () => {
      this.resetDiagnostics();
    });
    wrapper.querySelectorAll<HTMLInputElement>('[data-toast-level]').forEach(input => {
      input.addEventListener('change', event => {
        const target = event.currentTarget as HTMLInputElement;
        const level = target.dataset.toastLevel as ToastLevel;
        if (!TOAST_METHODS.includes(level)) return;
        void this.setLevel(level, target.checked).catch(() => {});
      });
    });
    wrapper.querySelector(`#${APP_ID}-select-all`)?.addEventListener('click', () => {
      void this.setAllLevels(true).catch(() => {});
    });
    wrapper.querySelector(`#${APP_ID}-select-none`)?.addEventListener('click', () => {
      void this.setAllLevels(false).catch(() => {});
    });
    wrapper.querySelector(`#${APP_ID}-repair`)?.addEventListener('click', () => {
      void this.applyPreference({ forceSave: true }).then(() => {
        this.statusText = '早期规则已校验并保存';
        this.renderStatus();
      }).catch(() => {});
    });
    wrapper.querySelector(`#${APP_ID}-cleanup`)?.addEventListener('click', () => {
      void this.shutdown().catch(() => {});
    });
    wrapper.querySelector<HTMLButtonElement>(`#${APP_ID}-refresh`)?.addEventListener('click', event => {
      void this.requestFrontendRefresh(event.currentTarget as HTMLButtonElement);
    });
    this.renderStatus();
  }

  renderStatus(): void {
    // 合批：同一轮内多次请求只执行一次真实绘制，避免 Toast 风暴时重排重绘。
    if (this.statusRenderScheduled) return;
    this.statusRenderScheduled = true;
    const flush = () => {
      this.statusRenderScheduled = false;
      if (this.statusRenderTimer) {
        clearTimeout(this.statusRenderTimer);
        this.statusRenderTimer = null;
      }
      this.paintStatusNow();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush);
    } else if (typeof setTimeout === 'function') {
      this.statusRenderTimer = setTimeout(flush, 100);
    } else {
      flush();
    }
  }

  /** 抽屉合上时跳过诊断数字刷新，只保留轻量的状态行与开关回显。 */
  private isDiagnosticsVisible(): boolean {
    if (!this.panel?.isConnected) return false;
    if (typeof this.panel.closest !== 'function') return true;
    const drawer = this.panel.closest('.inline-drawer');
    if (!drawer || typeof drawer.classList.contains !== 'function') return true;
    return !drawer.classList.contains('inline-drawer-collapsed');
  }

  private paintStatusNow(): void {
    if (!this.panel?.isConnected) return;
    const enabled = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-enabled`);
    const logging = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-logging`);
    const redraw = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-redraw`);
    const redrawLimit = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-redraw-limit`);
    const aggregate = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-aggregate`);
    const diagnostics = this.panel.querySelector<HTMLInputElement>(`#${APP_ID}-diagnostics`);
    if (enabled) enabled.checked = this.settings.enabled;
    if (logging) logging.checked = this.settings.logSuppressed;
    if (redraw) redraw.checked = this.settings.redrawEnabled;
    if (aggregate) aggregate.checked = this.settings.redrawAggregateDuplicates;
    if (diagnostics) diagnostics.checked = this.settings.diagnosticsEnabled;
    if (redrawLimit) {
      redrawLimit.value = String(this.settings.redrawMaxVisible);
      redrawLimit.disabled = !this.settings.redrawEnabled;
    }
    this.panel.querySelectorAll<HTMLInputElement>('[data-toast-level]').forEach(input => {
      const level = input.dataset.toastLevel as ToastLevel;
      const checked = this.settings.blockedLevels[level];
      input.checked = checked;
      // :has() 不支持或被宿主覆盖时，由 .is-selected 提供选中态高亮。
      input.closest('.qyh-toast-blocker-level')?.classList.toggle('is-selected', checked);
    });

    const runtime = this.runtime.getStatus();
    const diagnosticPanel = this.panel.querySelector<HTMLElement>(`#${APP_ID}-diagnostics-panel`);
    if (diagnosticPanel) diagnosticPanel.hidden = !this.settings.diagnosticsEnabled;
    // 抽屉合上时跳过 12 处诊断节点写回，只维护状态行。
    if (this.isDiagnosticsVisible()) {
      const diagnosticValues: Record<string, string> = {
        rendered: String(runtime.redraw.rendered),
        aggregated: String(runtime.redraw.aggregated),
        pendingPeak: String(runtime.redraw.pendingPeak),
        visibilityPauses: String(runtime.redraw.visibilityPauses),
        averageBatchMs: `${runtime.redraw.averageBatchMs.toFixed(2)} ms`,
        maxBatchMs: `${runtime.redraw.maxBatchMs.toFixed(2)} ms`,
        overBudgetBatches: String(runtime.redraw.overBudgetBatches),
        observedLongFrames: runtime.redraw.observerType === null
          ? '—'
          : String(runtime.redraw.observedLongFrames),
      };
      for (const [key, value] of Object.entries(diagnosticValues)) {
        const target = this.panel.querySelector<HTMLElement>(`[data-diagnostic="${key}"]`);
        if (target) target.textContent = value;
      }
      const observerSupport = this.panel.querySelector<HTMLElement>('[data-diagnostic="observerSupport"]');
      if (observerSupport) {
        observerSupport.textContent = runtime.redraw.observerType === 'long-animation-frame'
          ? `页面长帧增强：Long Animation Frame · 最长 ${runtime.redraw.maxObservedLongFrameMs.toFixed(1)} ms`
          : runtime.redraw.observerType === 'longtask'
            ? `页面长帧回退：Long Task · 最长 ${runtime.redraw.maxObservedLongFrameMs.toFixed(1)} ms`
            : '当前 WebView 不提供页面长帧条目；批次耗时诊断仍正常工作。';
      }
    }
    const earlyRule = hasManagedCss(power_user.custom_css);
    const status = this.panel.querySelector(`#${APP_ID}-status`);
    if (!status) return;
    if (this.statusText) {
      status.textContent = this.statusText;
      this.statusText = '';
      return;
    }
    const blocked = getBlockedMethods(this.settings.blockedLevels);
    const effectiveBlocked = this.settings.enabled ? blocked : [];
    const restart = earlyRule && !this.preloadPresentAtBoot ? ' · 建议重启一次' : '';
    const blockerState = effectiveBlocked.length > 0
      ? `屏蔽 ${effectiveBlocked.join(' / ')}`
      : '屏蔽器关闭';
    const redrawState = this.settings.redrawEnabled
      ? `重绘器运行中 ${runtime.redraw.active}/${runtime.redraw.maxVisible} · 重绘 ${runtime.redraw.rendered} · 聚合 ${runtime.redraw.aggregated}`
      : '重绘器关闭';
    status.textContent = `状态：${blockerState} · ${redrawState} · 本次拦截 ${this.suppressedCount}${restart}`;
  }

  getPublicStatus(): PublicStatus {
    return {
      ...this.runtime.getStatus(),
      earlyRuleInstalled: hasManagedCss(power_user.custom_css),
      suppressedThisSession: this.suppressedCount,
      settings: { ...this.settings, blockedLevels: { ...this.settings.blockedLevels } },
    };
  }
}

export function installToastBlockerHost(): ToastBlockerHost {
  const shared = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  if (shared[INSTANCE_KEY]) return shared[INSTANCE_KEY] as ToastBlockerHost;
  const host = new ToastBlockerHost();
  shared[INSTANCE_KEY] = host;
  globalThis.ToastBlocker = Object.freeze({
    enable: () => host.setEnabled(true),
    disable: () => host.setEnabled(false),
    repair: () => host.applyPreference({ forceSave: true }),
    redraw: (enabled: boolean) => host.setRedrawEnabled(enabled),
    aggregate: (enabled: boolean) => host.setAggregateDuplicates(enabled),
    diagnostics: (enabled: boolean) => host.setDiagnosticsEnabled(enabled),
    resetDiagnostics: () => host.resetDiagnostics(),
    shutdown: () => host.shutdown(),
    setLevel: (level: ToastLevel, blocked: boolean) => host.setLevel(level, blocked),
    status: () => host.getPublicStatus(),
  });
  void host.activate();
  return host;
}
