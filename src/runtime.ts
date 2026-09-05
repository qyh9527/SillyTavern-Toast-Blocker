import {
  DEFAULT_BLOCKED_LEVELS,
  REDRAW_READY_CLASS,
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
const WATCHDOG_FAST_MS = 1000;
const WATCHDOG_SLOW_MS = 5000;
const WATCHDOG_FAST_TICKS = 8;

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
  redrawAggregateDuplicates: boolean;
  diagnosticsEnabled: boolean;
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
  redrawAggregateDuplicates = true;
  diagnosticsEnabled = false;
  guard: ToastrGuard | null = null;
  auxiliaryGuard: ToastrAuxiliaryGuard | null = null;
  guardedTarget: Record<string, unknown> | null = null;
  observer: MutationObserver | null = null;
  observedContainer: Element | null = null;
  watchdog: ReturnType<typeof setInterval> | null = null;
  watchdogFastTicks = 0;
  watchdogSlow = false;
  watchdogBootWindow = false;
  visibilityHandler: (() => void) | null = null;
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
      redrawAggregateDuplicates: this.redrawAggregateDuplicates,
      diagnosticsEnabled: this.diagnosticsEnabled,
    });
  }

  setBlockedLevels(levels: BlockedToastLevels): void {
    this.configure({
      blockerEnabled: this.enabled,
      blockedLevels: levels,
      redrawEnabled: this.redrawEnabled,
      redrawMaxVisible: this.redrawMaxVisible,
      redrawAggregateDuplicates: this.redrawAggregateDuplicates,
      diagnosticsEnabled: this.diagnosticsEnabled,
    });
  }

  configure({
    blockerEnabled,
    blockedLevels,
    redrawEnabled,
    redrawMaxVisible,
    redrawAggregateDuplicates,
    diagnosticsEnabled,
  }: RuntimeConfiguration): void {
    this.stopWatchdog();
    this.stopObserver();
    this.restoreGuard();
    document.getElementById(RUNTIME_STYLE_ID)?.remove();
    this.enabled = Boolean(blockerEnabled);
    this.blockedLevels = { ...blockedLevels };
    this.redrawEnabled = Boolean(redrawEnabled);
    this.redrawMaxVisible = redrawMaxVisible;
    this.redrawAggregateDuplicates = Boolean(redrawAggregateDuplicates);
    this.diagnosticsEnabled = Boolean(diagnosticsEnabled);
    this.renderer.configure(this.redrawEnabled, this.redrawMaxVisible, {
      aggregateDuplicates: this.redrawAggregateDuplicates,
      diagnosticsEnabled: this.diagnosticsEnabled,
    });
    if (this.isBlockerEffective()) {
      this.ensureRuntimeStyle();
      this.startObserver();
      this.removeBlockedToasts();
    }
    if (this.isEffective()) {
      this.patchCurrentToastr();
      if (this.redrawEnabled) this.adoptExistingNativeToasts();
      this.startWatchdog();
    }
    document.documentElement?.classList?.add(REDRAW_READY_CLASS);
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

  adoptExistingNativeToasts(): void {
    const target = this.guardedTarget;
    if (!this.redrawEnabled || !target) return;
    const elements = document.querySelectorAll('#toast-container > .toast');
    this.renderer.adoptNativeToasts(elements, target.options, element => {
      const remover = target.remove;
      const handle = typeof globalThis.jQuery === 'function' ? globalThis.jQuery(element) : element;
      if (typeof remover === 'function') Reflect.apply(remover, target, [handle]);
      else element.remove();
    });
  }

  removeBlockedToasts(): void {
    for (const level of getBlockedMethods(this.blockedLevels)) {
      document.querySelectorAll(`#toast-container > .toast-${level}`).forEach(element => element.remove());
    }
  }

  /** 看门狗是否处于整窗监听（启动等待容器阶段）。 */
  get bootObserving(): boolean {
    return Boolean(this.observer && this.watchdogBootWindow);
  }

  startObserver(): void {
    if (this.observer || typeof MutationObserver !== 'function') return;
    if (typeof document.querySelector !== 'function') return;
    this.observer = new MutationObserver(() => {
      if (this.watchdogBootWindow) this.retargetObserverToContainer();
      this.removeBlockedToasts();
    });
    const container = document.querySelector('#toast-container');
    this.observedContainer = container;
    this.watchdogBootWindow = !container;
    this.observer.observe(container ?? document.documentElement, {
      childList: true,
      subtree: !container,
    });
  }
  stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedContainer = null;
    this.watchdogBootWindow = false;
  }

  startWatchdog(): void {
    if (this.watchdog || this.visibilityHandler) return;
    this.watchdogFastTicks = 0;
    this.watchdogSlow = false;
    if (typeof document.addEventListener === 'function') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          // 回到前台：先立即检查，再恢复周期巡检。
          if (!this.watchdog && this.visibilityHandler) {
            this.watchdog = setInterval(() => this.runWatchdogTick(), this.watchdogSlow ? WATCHDOG_SLOW_MS : WATCHDOG_FAST_MS);
          }
          this.runWatchdogTick();
        } else {
          // 进入后台：暂停定时器，浏览器本就节流后台计时器。
          this.stopWatchdogTimer();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (document.visibilityState !== 'hidden') {
      this.watchdog = setInterval(() => this.runWatchdogTick(), WATCHDOG_FAST_MS);
    }
  }

  runWatchdogTick(): void {
    if (!this.isEffective()) return;
    if (this.observer && this.observedContainer && !this.observedContainer.isConnected) {
      this.stopObserver();
      this.startObserver();
    }
    if (this.watchdogBootWindow) this.retargetObserverToContainer();
    if (this.isBlockerEffective()) this.ensureRuntimeStyle();
    this.patchCurrentToastr();
    if (this.isBlockerEffective()) this.removeBlockedToasts();
    if (this.redrawEnabled) {
      this.renderer.pruneDetachedToasts();
      this.adoptExistingNativeToasts();
    }
    this.watchdogFastTicks += 1;
    if (!this.watchdogSlow && this.watchdogFastTicks >= WATCHDOG_FAST_TICKS) {
      // 启动阶段的密集检查结束后退避到低频巡检，降低常驻唤醒开销。
      this.watchdogSlow = true;
      this.stopWatchdogTimer();
      this.watchdog = setInterval(() => this.runWatchdogTick(), WATCHDOG_SLOW_MS);
    }
  }

  /** 启动等待期内若容器已出现，把整窗监听收敛为容器定向监听。 */
  private retargetObserverToContainer(): void {
    const found = typeof document.querySelector === 'function'
      ? document.querySelector('#toast-container')
      : null;
    if (!found || !this.observer) return;
    this.observer.disconnect();
    this.observer.observe(found, { childList: true });
    this.observedContainer = found;
    this.watchdogBootWindow = false;
  }

  private stopWatchdogTimer(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  stopWatchdog(): void {
    this.stopWatchdogTimer();
    if (this.visibilityHandler && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    this.visibilityHandler = null;
  }

  resetDiagnostics(): void {
    this.renderer.resetDiagnostics();
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
