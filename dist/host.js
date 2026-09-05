import { resolveHostAdapter } from './host-adapter.js';
import { createSelfCheckReport, copyReport } from './self-check.js';
import { DIAGNOSTIC_OVERVIEW_HTML, paintDiagnosticView } from './diagnostics-view.js';
import { SETTINGS_KEY, TOAST_METHODS, getBlockedMethods, hasManagedCss, normalizeMaxVisible, normalizeSettings, updateManagedCss, } from './core.js';
import { ToastRuntimeBlocker } from './runtime.js';
import { createTimedConfirmation } from './interaction.js';
import { scheduleFrontendReload } from './reload.js';
const APP_ID = 'qyh-toast-blocker';
const INSTANCE_KEY = Symbol.for('qyh9527.sillytavern.toastBlocker');
class ToastBlockerHost {
    adapter;
    settings;
    preloadPresentAtBoot;
    suppressedCount = 0;
    panel = null;
    statusText = '';
    bootPromise = null;
    runtime;
    refreshConfirmation;
    statusRenderScheduled = false;
    statusRenderTimer = null;
    /** 概览手动展开标记：诊断开关切换时只在用户未曾手动干预时自动展开/收起。 */
    overviewManuallyToggled = false;
    constructor(adapter) {
        this.adapter = adapter;
        const stored = normalizeSettings(this.adapter.extensionSettings[SETTINGS_KEY]);
        this.adapter.extensionSettings[SETTINGS_KEY] = stored;
        this.settings = stored;
        this.preloadPresentAtBoot = hasManagedCss(this.adapter.powerUserSettings.custom_css);
        this.runtime = new ToastRuntimeBlocker({
            onSuppressed: data => {
                this.suppressedCount += 1;
                if (this.settings.logSuppressed)
                    console.debug(`[${APP_ID}] suppressed ${data.level} toast`);
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
    activate({ forceSave = false } = {}) {
        if (!this.bootPromise) {
            this.bootPromise = this.applyPreference({ forceSave }).then(() => this.mountPanelWhenReady());
        }
        else if (forceSave) {
            this.bootPromise = this.bootPromise.then(() => this.applyPreference({ forceSave: true }));
        }
        return this.bootPromise;
    }
    async install() {
        this.settings.enabled = true;
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        await this.applyPreference({ forceSave: true });
        await this.mountPanelWhenReady();
    }
    async enableFromLifecycle() {
        await this.applyPreference({ forceSave: true });
    }
    async disableFromLifecycle() {
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
    async clean() {
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
        delete this.adapter.extensionSettings[SETTINGS_KEY];
        await this.forceSave();
        this.panel?.remove();
        this.panel = null;
    }
    async applyPreference({ forceSave = false } = {}) {
        this.applyRuntimeSettings();
        await this.persistPreloadCss(this.settings.enabled, this.settings.blockedLevels, this.settings.redrawEnabled, forceSave);
        this.renderStatus();
    }
    async setEnabled(enabled) {
        this.settings.enabled = Boolean(enabled);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.statusText = '正在保存…';
        this.renderStatus();
        this.applyRuntimeSettings();
        await this.persistPreloadCss(this.settings.enabled, this.settings.blockedLevels, this.settings.redrawEnabled, true);
        this.preloadPresentAtBoot = false;
        this.statusText = this.settings.enabled
            ? '已启用；已保存所选类型，重启后可覆盖启动阶段'
            : this.settings.redrawEnabled
                ? '屏蔽器已关闭；已保留重绘器的启动接管规则'
                : '已关闭并移除早期规则';
        this.renderStatus();
    }
    async setLevel(level, blocked) {
        this.settings.blockedLevels[level] = Boolean(blocked);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.statusText = '正在保存类型设置…';
        this.renderStatus();
        this.applyRuntimeSettings();
        await this.persistPreloadCss(this.settings.enabled, this.settings.blockedLevels, this.settings.redrawEnabled, true);
        this.preloadPresentAtBoot = false;
        const count = getBlockedMethods(this.settings.blockedLevels).length;
        this.statusText = count > 0 ? `已保存：已选择 ${count} 类 Toast` : '已保存：当前未选择任何类型';
        this.renderStatus();
    }
    async setAllLevels(blocked) {
        for (const level of TOAST_METHODS)
            this.settings.blockedLevels[level] = blocked;
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.persistPreloadCss(this.settings.enabled, this.settings.blockedLevels, this.settings.redrawEnabled, true);
        this.preloadPresentAtBoot = false;
        this.statusText = blocked ? '已选择全部四类 Toast' : '已取消全部类型';
        this.renderStatus();
    }
    async setLogging(enabled) {
        this.settings.logSuppressed = Boolean(enabled);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        await this.forceSave();
        this.renderStatus();
    }
    async setRedrawEnabled(enabled) {
        this.settings.redrawEnabled = Boolean(enabled);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.persistPreloadCss(this.settings.enabled, this.settings.blockedLevels, this.settings.redrawEnabled, true);
        this.preloadPresentAtBoot = false;
        this.statusText = this.settings.redrawEnabled
            ? '高性能重绘器已启用；被屏蔽类型仍优先拦截'
            : '高性能重绘器已关闭；未屏蔽类型恢复原生显示';
        this.renderStatus();
    }
    async setRedrawMaxVisible(value) {
        this.settings.redrawMaxVisible = normalizeMaxVisible(value);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.forceSave();
        this.renderStatus();
    }
    async setAggregateDuplicates(enabled) {
        this.settings.redrawAggregateDuplicates = Boolean(enabled);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.forceSave();
        this.statusText = this.settings.redrawAggregateDuplicates
            ? '重复通知聚合已启用：1 秒内相同内容合并计数'
            : '重复通知聚合已关闭';
        this.renderStatus();
    }
    async setDiagnosticsEnabled(enabled) {
        this.settings.diagnosticsEnabled = Boolean(enabled);
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.forceSave();
        this.statusText = this.settings.diagnosticsEnabled
            ? '本地性能诊断已启用；不会上传或记录 Toast 正文'
            : '本地性能诊断已关闭';
        this.renderStatus();
    }
    selfCheck() {
        return createSelfCheckReport(this.getPublicStatus(), this.adapter.source);
    }
    async copySelfCheck() {
        const report = this.selfCheck();
        const copied = await copyReport(report);
        const output = this.panel?.querySelector(`#${APP_ID}-report`);
        if (output) {
            output.hidden = copied;
            output.value = copied ? '' : report;
            if (!copied) {
                output.focus();
                output.select();
            }
        }
        this.statusText = copied ? '自检报告已复制；不含聊天正文或密钥' : '无法自动复制，请复制下方已选中的自检报告';
        this.renderStatus();
    }
    resetDiagnostics() {
        this.runtime.resetDiagnostics();
        this.statusText = '本地诊断统计已清零';
        this.renderStatus();
    }
    async shutdown() {
        this.settings.enabled = false;
        this.settings.redrawEnabled = false;
        this.adapter.extensionSettings[SETTINGS_KEY] = this.settings;
        this.applyRuntimeSettings();
        await this.persistPreloadCss(false, this.settings.blockedLevels, false, true);
        this.statusText = '屏蔽器与重绘器均已关闭，早期规则已清理';
        this.renderStatus();
    }
    async requestFrontendRefresh(button) {
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
        }
        catch {
            button.disabled = false;
            this.resetRefreshButton();
        }
    }
    resetRefreshButton() {
        const button = this.panel?.querySelector(`#${APP_ID}-refresh`);
        if (!button)
            return;
        button.disabled = false;
        button.classList.remove('qyh-toast-blocker-refresh--armed');
        button.textContent = '立即刷新前端';
        button.setAttribute('aria-label', '立即刷新前端，需要连续确认两次');
    }
    applyRuntimeSettings() {
        this.runtime.configure({
            blockerEnabled: this.settings.enabled,
            blockedLevels: this.settings.blockedLevels,
            redrawEnabled: this.settings.redrawEnabled,
            redrawMaxVisible: this.settings.redrawMaxVisible,
            redrawAggregateDuplicates: this.settings.redrawAggregateDuplicates,
            diagnosticsEnabled: this.settings.diagnosticsEnabled,
        });
    }
    async persistPreloadCss(enabled, levels, hideNativeUntilRedrawReady, forceSave) {
        const before = typeof this.adapter.powerUserSettings.custom_css === 'string' ? this.adapter.powerUserSettings.custom_css : '';
        const after = updateManagedCss(before, enabled, levels, hideNativeUntilRedrawReady);
        if (before === after) {
            if (forceSave)
                await this.forceSave();
            return false;
        }
        this.adapter.powerUserSettings.custom_css = after;
        const textarea = document.getElementById('customCSS');
        if (textarea)
            textarea.value = after;
        let customStyle = document.getElementById('custom-style');
        if (!customStyle) {
            customStyle = document.createElement('style');
            customStyle.id = 'custom-style';
            document.head.append(customStyle);
        }
        customStyle.textContent = after;
        if (forceSave)
            await this.forceSave();
        else
            this.adapter.saveSettingsDebounced();
        return true;
    }
    async forceSave() {
        try {
            await this.adapter.saveSettings();
        }
        catch (error) {
            console.error(`[${APP_ID}] failed to save settings`, error);
            this.statusText = `保存失败：${error instanceof Error ? error.message : String(error)}`;
            this.renderStatus();
            throw error;
        }
    }
    async mountPanelWhenReady() {
        if (this.panel?.isConnected)
            return;
        const mount = () => document.querySelector('#extensions_settings2, #extensions_settings');
        let parent = mount();
        if (!parent) {
            await new Promise(resolve => {
                const observer = new MutationObserver(() => {
                    parent = mount();
                    if (!parent)
                        return;
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
        if (!parent || document.getElementById(`${APP_ID}-panel`))
            return;
        const wrapper = document.createElement('div');
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
          <button id="${APP_ID}-self-check" class="menu_button" type="button">一键自检并复制报告</button>
          <button id="${APP_ID}-cleanup" class="menu_button">关闭并清理</button>
        </div>
        ${DIAGNOSTIC_OVERVIEW_HTML}
        <textarea id="${APP_ID}-report" class="text_pole" readonly hidden rows="6" aria-label="自检报告，可手动复制"></textarea>
        <p class="qyh-toast-blocker-help">首次安装或重新启用后建议重启一次酒馆。关闭、禁用或删除扩展时会清理持久规则。</p>
      </div>`;
        parent.append(wrapper);
        this.panel = wrapper;
        wrapper.querySelector(`#${APP_ID}-enabled`)?.addEventListener('change', event => {
            void this.setEnabled(event.currentTarget.checked).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-logging`)?.addEventListener('change', event => {
            void this.setLogging(event.currentTarget.checked).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-redraw`)?.addEventListener('change', event => {
            void this.setRedrawEnabled(event.currentTarget.checked).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-redraw-limit`)?.addEventListener('change', event => {
            void this.setRedrawMaxVisible(event.currentTarget.value).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-aggregate`)?.addEventListener('change', event => {
            void this.setAggregateDuplicates(event.currentTarget.checked).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-diagnostics`)?.addEventListener('change', event => {
            void this.setDiagnosticsEnabled(event.currentTarget.checked).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-diagnostics-reset`)?.addEventListener('click', () => {
            this.resetDiagnostics();
        });
        wrapper.querySelector('.qyh-toast-overview-toggle')?.addEventListener('click', event => {
            this.toggleOverview(event.currentTarget);
        });
        wrapper.querySelectorAll('[data-toast-level]').forEach(input => {
            input.addEventListener('change', event => {
                const target = event.currentTarget;
                const level = target.dataset.toastLevel;
                if (!TOAST_METHODS.includes(level))
                    return;
                void this.setLevel(level, target.checked).catch(() => { });
            });
        });
        wrapper.querySelector(`#${APP_ID}-select-all`)?.addEventListener('click', () => {
            void this.setAllLevels(true).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-select-none`)?.addEventListener('click', () => {
            void this.setAllLevels(false).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-repair`)?.addEventListener('click', () => {
            void this.applyPreference({ forceSave: true }).then(() => {
                this.statusText = '早期规则已校验并保存';
                this.renderStatus();
            }).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-cleanup`)?.addEventListener('click', () => {
            void this.shutdown().catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-refresh`)?.addEventListener('click', event => {
            void this.requestFrontendRefresh(event.currentTarget);
        });
        wrapper.querySelector(`#${APP_ID}-self-check`)?.addEventListener('click', () => {
            void this.copySelfCheck();
        });
        wrapper.querySelector('.inline-drawer-toggle')?.addEventListener('click', () => this.renderStatus());
        this.renderStatus();
    }
    renderStatus() {
        // 合批：同一轮内多次请求只执行一次真实绘制，避免 Toast 风暴时重排重绘。
        if (this.statusRenderScheduled)
            return;
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
        }
        else if (typeof setTimeout === 'function') {
            this.statusRenderTimer = setTimeout(flush, 100);
        }
        else {
            flush();
        }
    }
    /** 抽屉合上时跳过概览与诊断数字写回；不增加独立轮询。 */
    isPanelContentVisible() {
        if (!this.panel?.isConnected)
            return false;
        const content = this.panel.querySelector('.inline-drawer-content');
        return Boolean(content && content.getClientRects().length > 0);
    }
    /** 概览默认折叠；打开本地性能诊断自动展开，关闭自动收回。 */
    toggleOverview(button = null) {
        this.overviewManuallyToggled = true;
        const target = button ?? this.panel?.querySelector('.qyh-toast-overview-toggle') ?? null;
        this.setOverviewCollapsed(target, this.isOverviewCollapsed());
    }
    isOverviewCollapsed() {
        const body = this.panel?.querySelector('#qyh-toast-overview-body');
        return Boolean(body?.hidden);
    }
    setOverviewCollapsed(button, collapsed) {
        const body = this.panel?.querySelector('#qyh-toast-overview-body');
        if (body)
            body.hidden = collapsed;
        if (button)
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    /** 诊断状态变化时自动展开/收回；用户手动切换过后，后续开关切换不再覆盖用户选择。 */
    syncOverviewCollapse() {
        if (this.overviewManuallyToggled)
            return;
        const button = this.panel?.querySelector('.qyh-toast-overview-toggle') ?? null;
        const collapsed = !this.settings.diagnosticsEnabled;
        if (collapsed !== this.isOverviewCollapsed())
            this.setOverviewCollapsed(button, collapsed);
    }
    paintStatusNow() {
        if (!this.panel?.isConnected)
            return;
        const enabled = this.panel.querySelector(`#${APP_ID}-enabled`);
        const logging = this.panel.querySelector(`#${APP_ID}-logging`);
        const redraw = this.panel.querySelector(`#${APP_ID}-redraw`);
        const redrawLimit = this.panel.querySelector(`#${APP_ID}-redraw-limit`);
        const aggregate = this.panel.querySelector(`#${APP_ID}-aggregate`);
        const diagnostics = this.panel.querySelector(`#${APP_ID}-diagnostics`);
        if (enabled)
            enabled.checked = this.settings.enabled;
        if (logging)
            logging.checked = this.settings.logSuppressed;
        if (redraw)
            redraw.checked = this.settings.redrawEnabled;
        if (aggregate)
            aggregate.checked = this.settings.redrawAggregateDuplicates;
        if (diagnostics)
            diagnostics.checked = this.settings.diagnosticsEnabled;
        if (redrawLimit) {
            redrawLimit.value = String(this.settings.redrawMaxVisible);
            redrawLimit.disabled = !this.settings.redrawEnabled;
        }
        this.panel.querySelectorAll('[data-toast-level]').forEach(input => {
            const level = input.dataset.toastLevel;
            const checked = this.settings.blockedLevels[level];
            input.checked = checked;
            // :has() 不支持或被宿主覆盖时，由 .is-selected 提供选中态高亮。
            input.closest('.qyh-toast-blocker-level')?.classList.toggle('is-selected', checked);
        });
        const runtime = this.runtime.getStatus();
        this.syncOverviewCollapse();
        // 抽屉合上时跳过概览写回，只维护状态行。
        if (this.isPanelContentVisible()) {
            paintDiagnosticView(this.panel, {
                ...runtime,
                settings: this.settings,
                earlyRuleInstalled: hasManagedCss(this.adapter.powerUserSettings.custom_css),
            }, this.adapter.source);
        }
        const earlyRule = hasManagedCss(this.adapter.powerUserSettings.custom_css);
        const status = this.panel.querySelector(`#${APP_ID}-status`);
        if (!status)
            return;
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
    getPublicStatus() {
        return {
            ...this.runtime.getStatus(),
            earlyRuleInstalled: hasManagedCss(this.adapter.powerUserSettings.custom_css),
            suppressedThisSession: this.suppressedCount,
            settings: { ...this.settings, blockedLevels: { ...this.settings.blockedLevels } },
        };
    }
}
export async function installToastBlockerHost() {
    const shared = globalThis;
    if (shared[INSTANCE_KEY])
        return shared[INSTANCE_KEY];
    const pending = resolveHostAdapter().then(adapter => new ToastBlockerHost(adapter));
    shared[INSTANCE_KEY] = pending;
    let host;
    try {
        host = await pending;
    }
    catch (error) {
        delete shared[INSTANCE_KEY];
        throw error;
    }
    shared[INSTANCE_KEY] = host;
    globalThis.ToastBlocker = Object.freeze({
        enable: () => host.setEnabled(true),
        disable: () => host.setEnabled(false),
        repair: () => host.applyPreference({ forceSave: true }),
        redraw: (enabled) => host.setRedrawEnabled(enabled),
        aggregate: (enabled) => host.setAggregateDuplicates(enabled),
        diagnostics: (enabled) => host.setDiagnosticsEnabled(enabled),
        resetDiagnostics: () => host.resetDiagnostics(),
        shutdown: () => host.shutdown(),
        setLevel: (level, blocked) => host.setLevel(level, blocked),
        status: () => host.getPublicStatus(),
        selfCheck: () => host.selfCheck(),
    });
    void host.activate().catch(error => console.error(`[${APP_ID}] 启动失败`, error));
    return host;
}
//# sourceMappingURL=host.js.map