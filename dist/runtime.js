import { MANAGED_RULES, guardToastrMethods } from './core.js';
const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';
export class ToastRuntimeBlocker {
    enabled = false;
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
        this.enabled = Boolean(enabled);
        if (this.enabled) {
            this.ensureRuntimeStyle();
            this.patchCurrentToastr();
            this.startObserver();
            this.removeExistingContainers();
            this.startWatchdog();
        }
        else {
            this.stopWatchdog();
            this.stopObserver();
            this.restoreGuard();
            document.getElementById(RUNTIME_STYLE_ID)?.remove();
        }
        this.onStateChanged();
    }
    ensureRuntimeStyle() {
        let style = document.getElementById(RUNTIME_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = RUNTIME_STYLE_ID;
            document.head.append(style);
        }
        if (style.textContent !== MANAGED_RULES)
            style.textContent = MANAGED_RULES;
    }
    patchCurrentToastr() {
        const target = globalThis.toastr;
        if (!target || target === this.guardedTarget)
            return;
        this.restoreGuard();
        this.guardedTarget = target;
        this.guard = guardToastrMethods(target, {
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
    removeExistingContainers() {
        document.querySelectorAll('#toast-container').forEach(element => element.remove());
    }
    startObserver() {
        if (this.observer || typeof MutationObserver !== 'function')
            return;
        this.observer = new MutationObserver(() => this.removeExistingContainers());
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
            if (!this.enabled)
                return;
            this.ensureRuntimeStyle();
            this.patchCurrentToastr();
            this.removeExistingContainers();
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
            guardedMethods: this.guard?.guardedCount ?? 0,
            observingDom: Boolean(this.observer),
            runtimeStyle: Boolean(document.getElementById(RUNTIME_STYLE_ID)),
        };
    }
}
//# sourceMappingURL=runtime.js.map