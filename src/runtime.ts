import {
  DEFAULT_BLOCKED_LEVELS,
  TOAST_METHODS,
  buildManagedRules,
  getBlockedMethods,
  guardToastrMethods,
  type BlockedToastLevels,
  type SuppressedToast,
  type ToastLevel,
  type ToastrGuard,
} from './core.js';
import {
  LightweightToastRenderer,
  guardToastrAuxiliaryMethods,
  type RedrawStats,
  type ToastrAuxiliaryGuard,
} from './renderer.js';

const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';

interface RuntimeCallbacks {
  onSuppressed?: (toast: SuppressedToast) => void;
  onRedrawn?: () => void;
  onStateChanged?: () => void;
}

export interface RuntimeConfiguration {
  blockerEnabled: boolean;
  blockedLevels: BlockedToastLevels;
  redrawEnabled: boolean;
  redrawMaxVisible: number;
}

export interface RuntimeStatus {
  enabled: boolean;
  redrawEnabled: boolean;
  blockedMethods: ToastLevel[];
  guardedMethods: number;
  auxiliaryMethods: number;
  observingDom: boolean;
  runtimeStyle: boolean;
  redraw: RedrawStats;
}

export class ToastRuntimeBlocker {
  enabled = false;
  blockedLevels: BlockedToastLevels = { ...DEFAULT_BLOCKED_LEVELS };
  onSuppressed: (toast: SuppressedToast) => void;
  onStateChanged: () => void;
  redrawEnabled = false;
  redrawMaxVisible = 6;
  guard: ToastrGuard | null = null;
  auxiliaryGuard: ToastrAuxiliaryGuard | null = null;
  guardedTarget: Record<string, unknown> | null = null;
  observer: MutationObserver | null = null;
  watchdog: ReturnType<typeof setInterval> | null = null;
  renderer: LightweightToastRenderer;

  constructor({ onSuppressed = () => {}, onRedrawn = () => {}, onStateChanged = () => {} }: RuntimeCallbacks = {}) {
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

  setEnabled(enabled: boolean): void {
    this.configure({
      blockerEnabled: Boolean(enabled),
      blockedLevels: this.blockedLevels,
      redrawEnabled: this.redrawEnabled,
      redrawMaxVisible: this.redrawMaxVisible,
    });
  }

  setBlockedLevels(levels: BlockedToastLevels): void {
    this.configure({
      blockerEnabled: this.enabled,
      blockedLevels: levels,
      redrawEnabled: this.redrawEnabled,
      redrawMaxVisible: this.redrawMaxVisible,
    });
  }

  configure({ blockerEnabled, blockedLevels, redrawEnabled, redrawMaxVisible }: RuntimeConfiguration): void {
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

  isEffective(): boolean {
    return this.isBlockerEffective() || this.redrawEnabled;
  }

  isBlockerEffective(): boolean {
    return this.enabled && getBlockedMethods(this.blockedLevels).length > 0;
  }

  ensureRuntimeStyle(): void {
    let style = document.getElementById(RUNTIME_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = RUNTIME_STYLE_ID;
      document.head.append(style);
    }
    const rules = buildManagedRules(this.blockedLevels);
    if (style.textContent !== rules) style.textContent = rules;
  }

  patchCurrentToastr(): void {
    const target = globalThis.toastr as Record<string, unknown> | undefined;
    if (!target || target === this.guardedTarget) return;
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
          return this.renderer.show(
            invocation.level,
            invocation.args,
            invocation.invokeOriginal,
            target.options,
          );
        }
        return invocation.invokeOriginal();
      },
    });
    this.auxiliaryGuard = this.redrawEnabled ? guardToastrAuxiliaryMethods(target, this.renderer) : null;
    this.onStateChanged();
  }

  restoreGuard(): void {
    this.auxiliaryGuard?.restore();
    this.auxiliaryGuard = null;
    this.guard?.restore();
    this.guard = null;
    this.guardedTarget = null;
  }

  removeBlockedToasts(): void {
    for (const level of getBlockedMethods(this.blockedLevels)) {
      document.querySelectorAll(`#toast-container > .toast-${level}`).forEach(element => element.remove());
    }
  }

  startObserver(): void {
    if (this.observer || typeof MutationObserver !== 'function') return;
    this.observer = new MutationObserver(() => this.removeBlockedToasts());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (!this.isEffective()) return;
      if (this.isBlockerEffective()) this.ensureRuntimeStyle();
      this.patchCurrentToastr();
      if (this.isBlockerEffective()) this.removeBlockedToasts();
    }, 1000);
  }

  stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  getStatus(): RuntimeStatus {
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
