import { saveSettings, saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { power_user } from '/scripts/power-user.js';
import { SETTINGS_KEY, hasManagedCss, normalizeSettings, updateManagedCss, } from './core.js';
import { ToastRuntimeBlocker } from './runtime.js';
const APP_ID = 'qyh-toast-blocker';
const INSTANCE_KEY = Symbol.for('qyh9527.sillytavern.toastBlocker');
class ToastBlockerHost {
    settings;
    preloadPresentAtBoot;
    suppressedCount = 0;
    panel = null;
    statusText = '';
    bootPromise = null;
    runtime;
    constructor() {
        const stored = normalizeSettings(extension_settings[SETTINGS_KEY]);
        extension_settings[SETTINGS_KEY] = stored;
        this.settings = stored;
        this.preloadPresentAtBoot = hasManagedCss(power_user.custom_css);
        this.runtime = new ToastRuntimeBlocker({
            onSuppressed: data => {
                this.suppressedCount += 1;
                if (this.settings.logSuppressed)
                    console.debug(`[${APP_ID}] suppressed ${data.level} toast`);
                this.renderStatus();
            },
            onStateChanged: () => this.renderStatus(),
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
        extension_settings[SETTINGS_KEY] = this.settings;
        await this.applyPreference({ forceSave: true });
        await this.mountPanelWhenReady();
    }
    async enableFromLifecycle() {
        await this.applyPreference({ forceSave: true });
    }
    async disableFromLifecycle() {
        this.runtime.setEnabled(false);
        await this.persistPreloadCss(false, true);
    }
    async clean() {
        this.runtime.setEnabled(false);
        await this.persistPreloadCss(false, false);
        delete extension_settings[SETTINGS_KEY];
        await this.forceSave();
        this.panel?.remove();
        this.panel = null;
    }
    async applyPreference({ forceSave = false } = {}) {
        this.runtime.setEnabled(this.settings.enabled);
        await this.persistPreloadCss(this.settings.enabled, forceSave);
        this.renderStatus();
    }
    async setEnabled(enabled) {
        this.settings.enabled = Boolean(enabled);
        extension_settings[SETTINGS_KEY] = this.settings;
        this.statusText = '正在保存…';
        this.renderStatus();
        this.runtime.setEnabled(this.settings.enabled);
        await this.persistPreloadCss(this.settings.enabled, true);
        this.preloadPresentAtBoot = false;
        this.statusText = this.settings.enabled ? '已启用；重启后可覆盖启动阶段' : '已关闭并移除早期规则';
        this.renderStatus();
    }
    async setLogging(enabled) {
        this.settings.logSuppressed = Boolean(enabled);
        extension_settings[SETTINGS_KEY] = this.settings;
        await this.forceSave();
        this.renderStatus();
    }
    async persistPreloadCss(enabled, forceSave) {
        const before = typeof power_user.custom_css === 'string' ? power_user.custom_css : '';
        const after = updateManagedCss(before, enabled);
        if (before === after) {
            if (forceSave)
                await this.forceSave();
            return false;
        }
        power_user.custom_css = after;
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
            saveSettingsDebounced();
        return true;
    }
    async forceSave() {
        try {
            await saveSettings();
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
        <b><i class="fa-solid fa-bell-slash"></i> Toast 全局屏蔽器</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="qyh-toast-blocker-row">
          <div>
            <strong>屏蔽全部 Toast</strong>
            <div class="qyh-toast-blocker-help">同时启用早期 CSS、方法守卫和 DOM 清理。</div>
          </div>
          <label class="checkbox_label" title="屏蔽全部 Toast">
            <input id="${APP_ID}-enabled" type="checkbox">
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
        <div class="qyh-toast-blocker-actions">
          <button id="${APP_ID}-repair" class="menu_button">修复早期规则</button>
          <button id="${APP_ID}-cleanup" class="menu_button">关闭并清理</button>
        </div>
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
        wrapper.querySelector(`#${APP_ID}-repair`)?.addEventListener('click', () => {
            void this.applyPreference({ forceSave: true }).then(() => {
                this.statusText = '早期规则已校验并保存';
                this.renderStatus();
            }).catch(() => { });
        });
        wrapper.querySelector(`#${APP_ID}-cleanup`)?.addEventListener('click', () => {
            void this.setEnabled(false).catch(() => { });
        });
        this.renderStatus();
    }
    renderStatus() {
        if (!this.panel?.isConnected)
            return;
        const enabled = this.panel.querySelector(`#${APP_ID}-enabled`);
        const logging = this.panel.querySelector(`#${APP_ID}-logging`);
        if (enabled)
            enabled.checked = this.settings.enabled;
        if (logging)
            logging.checked = this.settings.logSuppressed;
        const runtime = this.runtime.getStatus();
        const earlyRule = hasManagedCss(power_user.custom_css);
        const status = this.panel.querySelector(`#${APP_ID}-status`);
        if (!status)
            return;
        if (this.statusText) {
            status.textContent = this.statusText;
            this.statusText = '';
            return;
        }
        if (!this.settings.enabled) {
            status.textContent = '状态：已关闭；原生 Toast 可正常显示';
            return;
        }
        const restart = earlyRule && !this.preloadPresentAtBoot ? ' · 建议重启一次' : '';
        status.textContent = `状态：屏蔽中 · 守卫 ${runtime.guardedMethods}/4 · 本次拦截 ${this.suppressedCount}${restart}`;
    }
    getPublicStatus() {
        return {
            ...this.runtime.getStatus(),
            earlyRuleInstalled: hasManagedCss(power_user.custom_css),
            suppressedThisSession: this.suppressedCount,
            settings: { ...this.settings },
        };
    }
}
export function installToastBlockerHost() {
    const shared = globalThis;
    if (shared[INSTANCE_KEY])
        return shared[INSTANCE_KEY];
    const host = new ToastBlockerHost();
    shared[INSTANCE_KEY] = host;
    globalThis.ToastBlocker = Object.freeze({
        enable: () => host.setEnabled(true),
        disable: () => host.setEnabled(false),
        repair: () => host.applyPreference({ forceSave: true }),
        status: () => host.getPublicStatus(),
    });
    void host.activate();
    return host;
}
//# sourceMappingURL=host.js.map