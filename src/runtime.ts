import {
  DEFAULT_BLOCKED_LEVELS,
  buildManagedRules,
  getBlockedMethods,
  guardToastrMethods,
  type BlockedToastLevels,
  type SuppressedToast,
  type ToastLevel,
  type ToastrGuard,
} from './core.js';

const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';

interface RuntimeCallbacks {
  onSuppressed?: (toast: SuppressedToast) => void;
  onStateChanged?: () => void;
}

export interface RuntimeStatus {
  enabled: boolean;
  blockedMethods: ToastLevel[];
  guardedMethods: number;
  observingDom: boolean;
  runtimeStyle: boolean;
}

export class ToastRuntimeBlocker {
  enabled = false;
  blockedLevels: BlockedToastLevels = { ...DEFAULT_BLOCKED_LEVELS };
  onSuppressed: (toast: SuppressedToast) => void;
  onStateChanged: () => void;
  guard: ToastrGuard | null = null;
  guardedTarget: Record<string, unknown> | null = null;
  observer: MutationObserver | null = null;
  watchdog: ReturnType<typeof setInterval> | null = null;

  constructor({ onSuppressed = () => {}, onStateChanged = () => {} }: RuntimeCallbacks = {}) {
    this.enabled = false;
    this.onSuppressed = onSuppressed;
    this.onStateChanged = onStateChanged;
    this.guard = null;
    this.guardedTarget = null;
    this.observer = null;
    this.watchdog = null;
  }

  setEnabled(enabled: boolean): void {
    this.configure(Boolean(enabled), this.blockedLevels);
  }

  setBlockedLevels(levels: BlockedToastLevels): void {
    this.configure(this.enabled, levels);
  }

  configure(enabled: boolean, levels: BlockedToastLevels): void {
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

  isEffective(): boolean {
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
    this.guard = guardToastrMethods(target, {
      methods: getBlockedMethods(this.blockedLevels),
      onSuppressed: data => this.onSuppressed(data),
      createResult: () => globalThis.jQuery?.() ?? undefined,
    });
    this.onStateChanged();
  }

  restoreGuard(): void {
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
      this.ensureRuntimeStyle();
      this.patchCurrentToastr();
      this.removeBlockedToasts();
    }, 1000);
  }

  stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  getStatus(): RuntimeStatus {
    return {
      enabled: this.enabled,
      blockedMethods: getBlockedMethods(this.blockedLevels),
      guardedMethods: this.guard?.guardedCount ?? 0,
      observingDom: Boolean(this.observer),
      runtimeStyle: Boolean(document.getElementById(RUNTIME_STYLE_ID)),
    };
  }
}
