import { MANAGED_RULES, guardToastrMethods, type SuppressedToast, type ToastrGuard } from './core.js';

const RUNTIME_STYLE_ID = 'qyh-toast-blocker-runtime-style';

interface RuntimeCallbacks {
  onSuppressed?: (toast: SuppressedToast) => void;
  onStateChanged?: () => void;
}

export interface RuntimeStatus {
  enabled: boolean;
  guardedMethods: number;
  observingDom: boolean;
  runtimeStyle: boolean;
}

export class ToastRuntimeBlocker {
  enabled = false;
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
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      this.ensureRuntimeStyle();
      this.patchCurrentToastr();
      this.startObserver();
      this.removeExistingContainers();
      this.startWatchdog();
    } else {
      this.stopWatchdog();
      this.stopObserver();
      this.restoreGuard();
      document.getElementById(RUNTIME_STYLE_ID)?.remove();
    }
    this.onStateChanged();
  }

  ensureRuntimeStyle(): void {
    let style = document.getElementById(RUNTIME_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = RUNTIME_STYLE_ID;
      document.head.append(style);
    }
    if (style.textContent !== MANAGED_RULES) style.textContent = MANAGED_RULES;
  }

  patchCurrentToastr(): void {
    const target = globalThis.toastr as Record<string, unknown> | undefined;
    if (!target || target === this.guardedTarget) return;
    this.restoreGuard();
    this.guardedTarget = target;
    this.guard = guardToastrMethods(target, {
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

  removeExistingContainers(): void {
    document.querySelectorAll('#toast-container').forEach(element => element.remove());
  }

  startObserver(): void {
    if (this.observer || typeof MutationObserver !== 'function') return;
    this.observer = new MutationObserver(() => this.removeExistingContainers());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (!this.enabled) return;
      this.ensureRuntimeStyle();
      this.patchCurrentToastr();
      this.removeExistingContainers();
    }, 1000);
  }

  stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  getStatus(): RuntimeStatus {
    return {
      enabled: this.enabled,
      guardedMethods: this.guard?.guardedCount ?? 0,
      observingDom: Boolean(this.observer),
      runtimeStyle: Boolean(document.getElementById(RUNTIME_STYLE_ID)),
    };
  }
}
