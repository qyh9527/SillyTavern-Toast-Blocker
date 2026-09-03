import { DEFAULT_BLOCKED_LEVELS, TOAST_METHODS, buildManagedRules, getBlockedMethods, guardToastrMethods, } from './core.js';
import { LightweightToastRenderer, guardToastrAuxiliaryMethods, } from './renderer.js';
const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';
export class ToastRuntimeBlocker {
    enabled = false;
    blockedLevels = { ...DEFAULT_BLOCKED_LEVELS };
    onSuppressed;
    onStateChanged;
    redrawEnabled = false;
    redrawMaxVisible = 6;
    guard = null;
    auxiliaryGuard = null;
    guardedTarget = null;
    observer = null;
    watchdog = null;
    renderer;
    constructor({ onSuppressed = () => { }, onRedrawn = () => { }, onStateChanged = () => { } } = {}) {
        this.enabled = false;
        this.onSuppressed = onSuppressed;
        this.onStateChanged = onStateChanged;
        this.renderer = new LightweightToastRenderer({
            onError: error => console.error('[qyh-toast-blocker] redraw failed', error),
            onRendered: onRedrawn,
            onStateChanged,
        });
        this.guard = null;
        this.guardedTarget = null;
        this.observer = null;
        this.watchdog = null;
    }
    setEnabled(enabled) {
        this.configure({
            blockerEnabled: Boolean(enabled),
            blockedLevels: this.blockedLevels,
            redrawEnabled: this.redrawEnabled,
            redrawMaxVisible: this.redrawMaxVisible,
        });
    }
    setBlockedLevels(levels) {
        this.configure({
            blockerEnabled: this.enabled,
            blockedLevels: levels,
            redrawEnabled: this.redrawEnabled,
            redrawMaxVisible: this.redrawMaxVisible,
        });
    }
    configure({ blockerEnabled, blockedLevels, redrawEnabled, redrawMaxVisible }) {
        this.stopWatchdog();
        this.stopObserver();
        this.restoreGuard();
        document.getElementById(RUNTIME_STYLE_ID)?.remove();
        this.enabled = Boolean(blockerEnabled);
        this.blockedLevels = { ...blockedLevels };
        this.redrawEnabled = Boolean(redrawEnabled);
        this.redrawMaxVisible = redrawMaxVisible;
        this.renderer.configure(this.redrawEnabled, this.redrawMaxVisible);
        if (this.isBlockerEffective()) {
            this.ensureRuntimeStyle();
            this.startObserver();
            this.removeBlockedToasts();
        }
        if (this.isEffective()) {
            this.patchCurrentToastr();
            this.startWatchdog();
        }
        this.onStateChanged();
    }
    isEffective() {
        return this.isBlockerEffective() || this.redrawEnabled;
    }
    isBlockerEffective() {
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
        const blocked = this.enabled ? getBlockedMethods(this.blockedLevels) : [];
        this.guard = guardToastrMethods(target, {
            methods: this.redrawEnabled ? TOAST_METHODS : blocked,
            handleCall: invocation => {
                if (blocked.includes(invocation.level)) {
                    this.onSuppressed(invocation);
                    return globalThis.jQuery?.() ?? undefined;
                }
                if (this.redrawEnabled) {
                    return this.renderer.show(invocation.level, invocation.args, invocation.invokeOriginal, target.options);
                }
                return invocation.invokeOriginal();
            },
        });
        this.auxiliaryGuard = this.redrawEnabled ? guardToastrAuxiliaryMethods(target, this.renderer) : null;
        this.onStateChanged();
    }
    restoreGuard() {
        this.auxiliaryGuard?.restore();
        this.auxiliaryGuard = null;
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
            if (this.isBlockerEffective())
                this.ensureRuntimeStyle();
            this.patchCurrentToastr();
            if (this.isBlockerEffective())
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
            redrawEnabled: this.redrawEnabled,
            blockedMethods: this.enabled ? getBlockedMethods(this.blockedLevels) : [],
            guardedMethods: this.guard?.guardedCount ?? 0,
            auxiliaryMethods: this.auxiliaryGuard?.guardedCount ?? 0,
            observingDom: Boolean(this.observer),
            runtimeStyle: Boolean(document.getElementById(RUNTIME_STYLE_ID)),
            redraw: this.renderer.getStats(),
        };
    }
}
//# sourceMappingURL=runtime.js.map