import { DEFAULT_BLOCKED_LEVELS, buildManagedRules, getBlockedMethods, guardToastrMethods, } from './core.js';
const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';
export class ToastRuntimeBlocker {
    enabled = false;
    blockedLevels = { ...DEFAULT_BLOCKED_LEVELS };
    onSuppressed;
    onStateChanged;
    guard = null;
    guardedTarget = null;
    observer = null;
    watchdog = null;
    constructor({ onSuppressed = () => { }, onStateChanged = () => { } } = {}) {
        this.enabled = false;
        this.onSuppressed = onSuppressed;
        this.onStateChanged = onStateChanged;
        this.guard = null;
        this.guardedTarget = null;
        this.observer = null;
        this.watchdog = null;
    }
    setEnabled(enabled) {
        this.configure(Boolean(enabled), this.blockedLevels);
    }
    setBlockedLevels(levels) {
        this.configure(this.enabled, levels);
    }
    configure(enabled, levels) {
        this.stopWatchdog();
        this.stopObserver();
        this.restoreGuard();
        document.getElementById(RUNTIME_STYLE_ID)?.remove();
        this.enabled = Boolean(enabled);
        this.blockedLevels = { ...levels };
        if (this.isEffective()) {
            this.ensureRuntimeStyle();
            this.patchCurrentToastr();
            this.startObserver();
            this.removeBlockedToasts();
            this.startWatchdog();
        }
        this.onStateChanged();
    }
    isEffective() {
        return this.enabled && getBlockedMethods(this.blockedLevels).length > 0;
    }
    ensureRuntimeStyle() {
        let style = document.getElementById(RUNTIME_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = RUNTIME_STYLE_ID;
            document.head.append(style);
        }
        const rules = buildManagedRules(this.blockedLevels);
        if (style.textContent !== rules)
            style.textContent = rules;
    }
    patchCurrentToastr() {
        const target = globalThis.toastr;
        if (!target || target === this.guardedTarget)
            return;
        this.restoreGuard();
        this.guardedTarget = target;
        this.guard = guardToastrMethods(target, {
            methods: getBlockedMethods(this.blockedLevels),
            onSuppressed: data => this.onSuppressed(data),
            createResult: () => globalThis.jQuery?.() ?? undefined,
        });
        this.onStateChanged();
    }
    restoreGuard() {
        this.guard?.restore();
        this.guard = null;
        this.guardedTarget = null;
    }
    removeBlockedToasts() {
        for (const level of getBlockedMethods(this.blockedLevels)) {
            document.querySelectorAll(`#toast-container > .toast-${level}`).forEach(element => element.remove());
        }
    }
    startObserver() {
        if (this.observer || typeof MutationObserver !== 'function')
            return;
        this.observer = new MutationObserver(() => this.removeBlockedToasts());
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    stopObserver() {
        this.observer?.disconnect();
        this.observer = null;
    }
    startWatchdog() {
        if (this.watchdog)
            return;
        this.watchdog = setInterval(() => {
            if (!this.isEffective())
                return;
            this.ensureRuntimeStyle();
            this.patchCurrentToastr();
            this.removeBlockedToasts();
        }, 1000);
    }
    stopWatchdog() {
        if (this.watchdog)
            clearInterval(this.watchdog);
        this.watchdog = null;
    }
    getStatus() {
        return {
            enabled: this.enabled,
            blockedMethods: getBlockedMethods(this.blockedLevels),
            guardedMethods: this.guard?.guardedCount ?? 0,
            observingDom: Boolean(this.observer),
            runtimeStyle: Boolean(document.getElementById(RUNTIME_STYLE_ID)),
        };
    }
}
//# sourceMappingURL=runtime.js.map