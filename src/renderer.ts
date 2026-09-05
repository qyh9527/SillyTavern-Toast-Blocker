import { TOAST_METHODS, normalizeMaxVisible, type ToastLevel } from './core.js';

const CONTAINER_CLASS = 'qyh-toast-redraw-container';
const TOAST_ATTRIBUTE = 'data-qyh-redraw-toast';
const ADOPTED_ATTRIBUTE = 'data-qyh-adopted-toast';
const MAX_PER_FRAME = 12;
const MAX_PENDING = 100;
const DUPLICATE_WINDOW_MS = 1000;
const FRAME_BUDGET_MS = 1000 / 60;

type AnyFunction = (...args: unknown[]) => unknown;

interface ToastIconClasses {
  success: string;
  info: string;
  warning: string;
  error: string;
}

interface RedrawOptions extends Record<string, unknown> {
  tapToDismiss: boolean;
  toastClass: string;
  showDuration: number;
  hideDuration: number;
  onShown?: AnyFunction;
  onHidden?: AnyFunction;
  closeDuration: number | false;
  closeOnHover: boolean;
  extendedTimeOut: number;
  timeOut: number;
  titleClass: string;
  messageClass: string;
  escapeHtml: boolean;
  closeButton: boolean;
  closeClass: string;
  newestOnTop: boolean;
  preventDuplicates: boolean;
  progressBar: boolean;
  progressClass: string;
  rtl: boolean;
  target: unknown;
  positionClass: string;
  iconClasses: ToastIconClasses;
  onclick?: AnyFunction;
  onCloseClick?: AnyFunction;
}

interface ToastMap {
  type: ToastLevel;
  iconClass: string;
  message: unknown;
  title: unknown;
  optionsOverride: unknown;
}

interface ToastResponse {
  toastId: number;
  state: 'visible' | 'hidden';
  startTime: Date;
  endTime?: Date;
  options: RedrawOptions;
  map: ToastMap;
}

interface RenderRequest {
  element: HTMLElement;
  fallback: () => unknown;
  handle: unknown;
  options: RedrawOptions;
  response: ToastResponse;
  target: Element;
  cancelled: boolean;
  duplicateCount: number;
  duplicateKey: string | null;
  lastDuplicateAt: number;
  shownCallbacks: unknown[];
  hiddenCallbacks: unknown[];
}

interface ActiveToast {
  element: HTMLElement;
  handle: unknown;
  target: Element;
  hideTimer: ReturnType<typeof setTimeout> | null;
  options: RedrawOptions;
  progressAnimation: Animation | null;
  response: ToastResponse;
  duplicateCount: number;
  duplicateKey: string | null;
  lastDuplicateAt: number;
  shownCallbacks: unknown[];
  hiddenCallbacks: unknown[];
  timerDeadline: number | null;
  remainingTime: number;
  timerAction: 'dismiss' | null;
  hoverPaused: boolean;
  visibilityPaused: boolean;
}

interface RendererConfiguration {
  aggregateDuplicates?: boolean;
  diagnosticsEnabled?: boolean;
}

interface RendererCallbacks {
  onError?: (error: unknown) => void;
  onRendered?: () => void;
  onStateChanged?: () => void;
}

export interface RedrawStats {
  enabled: boolean;
  active: number;
  adoptedActive: number;
  pending: number;
  rendered: number;
  evicted: number;
  fallbacks: number;
  maxVisible: number;
  aggregated: number;
  pendingPeak: number;
  visibilityPauses: number;
  pausedForVisibility: number;
  diagnosticsEnabled: boolean;
  frameSamples: number;
  averageBatchMs: number;
  maxBatchMs: number;
  overBudgetBatches: number;
  observedLongFrames: number;
  maxObservedLongFrameMs: number;
  observerType: 'long-animation-frame' | 'longtask' | null;
}

const DEFAULT_OPTIONS: RedrawOptions = {
  tapToDismiss: true,
  toastClass: 'toast',
  showDuration: 250,
  hideDuration: 250,
  closeDuration: false,
  closeOnHover: true,
  extendedTimeOut: 1000,
  timeOut: 5000,
  titleClass: 'toast-title',
  messageClass: 'toast-message',
  escapeHtml: false,
  closeButton: false,
  closeClass: 'toast-close-button',
  newestOnTop: true,
  preventDuplicates: false,
  progressBar: false,
  progressClass: 'toast-progress',
  rtl: false,
  target: 'body',
  positionClass: 'toast-top-right',
  iconClasses: {
    success: 'toast-success',
    info: 'toast-info',
    warning: 'toast-warning',
    error: 'toast-error',
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function mergeOptions(globalOptions: unknown, override: unknown): RedrawOptions {
  const global = asRecord(globalOptions);
  const local = asRecord(override);
  const iconClasses = {
    ...DEFAULT_OPTIONS.iconClasses,
    ...asRecord(global.iconClasses),
    ...asRecord(local.iconClasses),
  } as ToastIconClasses;
  const merged = { ...DEFAULT_OPTIONS, ...global, ...local, iconClasses } as RedrawOptions;
  merged.showDuration = finiteNumber(merged.showDuration, DEFAULT_OPTIONS.showDuration);
  merged.hideDuration = finiteNumber(merged.hideDuration, DEFAULT_OPTIONS.hideDuration);
  merged.extendedTimeOut = finiteNumber(merged.extendedTimeOut, DEFAULT_OPTIONS.extendedTimeOut);
  merged.timeOut = finiteNumber(merged.timeOut, DEFAULT_OPTIONS.timeOut);
  merged.closeDuration = merged.closeDuration === false
    ? false
    : finiteNumber(merged.closeDuration, merged.hideDuration);
  return merged;
}

function isElement(value: unknown): value is Element {
  return Boolean(value && typeof value === 'object' && (value as Node).nodeType === 1);
}

function safelyCall(callback: unknown, onError: (error: unknown) => void, ...args: unknown[]): void {
  if (typeof callback !== 'function') return;
  try {
    const result = Reflect.apply(callback, undefined, args);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(result).catch(onError);
    }
  } catch (error) {
    onError(error);
  }
}

export class LightweightToastRenderer {
  enabled = false;
  maxVisible = 6;
  aggregateDuplicates = true;
  diagnosticsEnabled = false;
  private active = new Map<HTMLElement, ActiveToast>();
  private adopted = new Map<HTMLElement, { dismiss: (element: HTMLElement) => void; click: () => void }>();
  private visibleOrder = new Set<HTMLElement>();
  private containerObserver: MutationObserver | null = null;
  private observedContainers = new Set<HTMLElement>();
  private containers = new WeakMap<Element, Map<string, HTMLElement>>();
  private evicted = 0;
  private fallbacks = 0;
  private frameId: number | null = null;
  private nextToastId = 0;
  private pending: RenderRequest[] = [];
  private previousMessage: unknown;
  private rendered = 0;
  private aggregated = 0;
  private pendingPeak = 0;
  private visibilityPauses = 0;
  private frameSamples = 0;
  private totalBatchMs = 0;
  private maxBatchMs = 0;
  private overBudgetBatches = 0;
  private observedLongFrames = 0;
  private maxObservedLongFrameMs = 0;
  private performanceObserver: PerformanceObserver | null = null;
  private observerType: 'long-animation-frame' | 'longtask' | null = null;
  private visibilityTracking = false;
  private readonly onError: (error: unknown) => void;
  private readonly onRendered: () => void;
  private readonly onStateChanged: () => void;
  private readonly handleVisibilityChange = (): void => this.syncVisibilityTimers();

  constructor({ onError = () => {}, onRendered = () => {}, onStateChanged = () => {} }: RendererCallbacks = {}) {
    this.onError = onError;
    this.onRendered = onRendered;
    this.onStateChanged = onStateChanged;
  }

  configure(enabled: boolean, maxVisible: number, {
    aggregateDuplicates = true,
    diagnosticsEnabled = false,
  }: RendererConfiguration = {}): void {
    const nextEnabled = Boolean(enabled);
    this.maxVisible = normalizeMaxVisible(maxVisible);
    if (this.enabled && !nextEnabled) this.stop();
    this.enabled = nextEnabled;
    this.aggregateDuplicates = Boolean(aggregateDuplicates);
    this.diagnosticsEnabled = Boolean(diagnosticsEnabled);
    if (this.enabled) {
      this.startVisibilityTracking();
      this.configurePerformanceObserver();
      this.enforceVisibleLimit();
    } else {
      this.stopPerformanceObserver();
    }
    this.onStateChanged();
  }

  show(
    level: ToastLevel,
    args: unknown[],
    fallback: () => unknown,
    globalOptions: unknown,
  ): unknown {
    if (!this.enabled) return fallback();
    try {
      const [message, title, override] = args;
      const options = mergeOptions(globalOptions, override);
      if (options.preventDuplicates && message === this.previousMessage) return undefined;
      const target = this.resolveTarget(options.target);
      if (!target) return this.fallback(fallback);
      const now = Date.now();
      const duplicateKey = this.aggregateDuplicates && !options.preventDuplicates
        ? this.createDuplicateKey(level, message, title, options, override)
        : null;
      if (duplicateKey) {
        const duplicate = this.findDuplicate(duplicateKey, target, options.positionClass, now);
        if (duplicate) {
          this.aggregateDuplicate(duplicate, options, now);
          return duplicate.handle;
        }
      }
      this.previousMessage = message;

      const element = document.createElement('div');
      const iconClass = String(asRecord(override).iconClass ?? options.iconClasses[level] ?? `toast-${level}`);
      const map: ToastMap = { type: level, iconClass, message, title, optionsOverride: override };
      const response: ToastResponse = {
        toastId: ++this.nextToastId,
        state: 'visible',
        startTime: new Date(),
        options,
        map,
      };
      element.setAttribute(TOAST_ATTRIBUTE, String(response.toastId));
      const handle = this.createHandle(element);
      this.pending.push({
        element,
        fallback,
        handle,
        options,
        response,
        target,
        cancelled: false,
        duplicateCount: 1,
        duplicateKey,
        lastDuplicateAt: now,
        shownCallbacks: [options.onShown],
        hiddenCallbacks: [options.onHidden],
      });
      this.pendingPeak = Math.max(this.pendingPeak, this.pending.length);
      if (this.pending.length > MAX_PENDING) {
        const overflow = this.pending.shift();
        if (overflow) {
          overflow.cancelled = true;
          this.finishPending(overflow, true);
        }
      }
      this.scheduleBatch();
      this.onStateChanged();
      return handle;
    } catch (error) {
      this.onError(error);
      return this.fallback(fallback);
    }
  }

  ownsHandle(handle: unknown): boolean {
    return this.elementsFromHandle(handle).some(element => element.hasAttribute(TOAST_ATTRIBUTE) || this.adopted.has(element));
  }

  /**
   * 接管在重绘器加载前已经由原生 Toastr 创建的节点。直接移动节点可保留其
   * 链接、按钮和已绑定事件；随后补上统一外观与整卡点击关闭能力。
   */
  adoptNativeToasts(
    elements: Iterable<Element>,
    globalOptions: unknown,
    dismiss: (element: HTMLElement) => void,
  ): number {
    if (!this.enabled) return 0;
    const options = mergeOptions(globalOptions, {});
    const target = this.resolveTarget(options.target);
    if (!target) return 0;
    const adopted: HTMLElement[] = [];
    for (const candidate of elements) {
      if (!isElement(candidate) || candidate.hasAttribute(ADOPTED_ATTRIBUTE)) continue;
      const element = candidate as HTMLElement;
      const level = TOAST_METHODS.find(type => (
        element.classList.contains(`toast-${type}`)
        || element.classList.contains(options.iconClasses[type])
      )) ?? 'info';
      element.setAttribute(ADOPTED_ATTRIBUTE, level);
      element.classList.add('qyh-toast-redraw', `qyh-toast-redraw--${level}`, 'interactable');
      element.classList.remove('toast-non-interactable');
      element.setAttribute('title', '点击关闭');
      element.setAttribute('role', level === 'error' || level === 'warning' ? 'alert' : 'status');
      element.setAttribute('aria-atomic', 'true');
      element.style.setProperty('--qyh-redraw-show-duration', `${options.showDuration}ms`);
      element.style.setProperty('--qyh-redraw-hide-duration', `${options.hideDuration}ms`);
      const click = () => {
        setTimeout(() => this.dismissElement(element, true, true, false), 0);
      };
      element.addEventListener('click', click);
      this.adopted.set(element, { dismiss, click });
      adopted.push(element);
    }
    if (adopted.length === 0) return 0;
    const container = this.getContainer(target, options.positionClass);
    // 原生容器默认新通知在前；统一按最旧到最新登记淘汰顺序。
    for (const element of options.newestOnTop ? [...adopted].reverse() : adopted) this.visibleOrder.add(element);
    const fragment = this.toFragment(adopted);
    if (options.newestOnTop) container.prepend(fragment);
    else container.append(fragment);
    this.rendered += adopted.length;
    this.enforceVisibleLimit();
    this.onRendered();
    this.onStateChanged();
    return adopted.length;
  }

  clear(handle: unknown, { force = false, immediate = false } = {}): boolean {
    const elements = this.elementsFromHandle(handle).filter(element => element.hasAttribute(TOAST_ATTRIBUTE) || this.adopted.has(element));
    if (elements.length === 0) return false;
    for (const element of elements) this.dismissElement(element, force, immediate, false);
    return true;
  }

  clearAll(immediate = false): void {
    for (const request of [...this.pending]) this.dismissElement(request.element, true, true, false);
    for (const element of [...this.visibleOrder]) this.dismissElement(element, true, immediate, false);
  }

  stop(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.clearAll(true);
    this.pending.length = 0;
    this.containerObserver?.disconnect();
    this.containerObserver = null;
    this.observedContainers.clear();
    this.enabled = false;
    this.previousMessage = undefined;
    this.stopVisibilityTracking();
    this.stopPerformanceObserver();
  }

  getStats(): RedrawStats {
    const pausedForVisibility = [...this.active.values()].filter(state => state.visibilityPaused).length;
    return {
      enabled: this.enabled,
      active: this.active.size + this.adopted.size,
      adoptedActive: this.adopted.size,
      pending: this.pending.length,
      rendered: this.rendered,
      evicted: this.evicted,
      fallbacks: this.fallbacks,
      maxVisible: this.maxVisible,
      aggregated: this.aggregated,
      pendingPeak: this.pendingPeak,
      visibilityPauses: this.visibilityPauses,
      pausedForVisibility,
      diagnosticsEnabled: this.diagnosticsEnabled,
      frameSamples: this.frameSamples,
      averageBatchMs: this.frameSamples > 0 ? this.totalBatchMs / this.frameSamples : 0,
      maxBatchMs: this.maxBatchMs,
      overBudgetBatches: this.overBudgetBatches,
      observedLongFrames: this.observedLongFrames,
      maxObservedLongFrameMs: this.maxObservedLongFrameMs,
      observerType: this.observerType,
    };
  }

  resetDiagnostics(): void {
    this.rendered = 0;
    this.evicted = 0;
    this.fallbacks = 0;
    this.aggregated = 0;
    this.pendingPeak = this.pending.length;
    this.visibilityPauses = 0;
    this.frameSamples = 0;
    this.totalBatchMs = 0;
    this.maxBatchMs = 0;
    this.overBudgetBatches = 0;
    this.observedLongFrames = 0;
    this.maxObservedLongFrameMs = 0;
    this.onStateChanged();
  }

  private createDuplicateKey(
    level: ToastLevel,
    message: unknown,
    title: unknown,
    options: RedrawOptions,
    override: unknown,
  ): string | null {
    if (options.onclick || options.onCloseClick) return null;
    const serialize = (value: unknown): string | null => {
      if (value === null) return 'null';
      if (value === undefined) return 'undefined';
      if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
        const text = String(value);
        return `${typeof value}:${text.length}:${text}`;
      }
      return null;
    };
    const messageKey = serialize(message);
    const titleKey = serialize(title);
    const iconClass = String(asRecord(override).iconClass ?? options.iconClasses[level] ?? '');
    return messageKey !== null && titleKey !== null
      ? [
        level,
        titleKey,
        messageKey,
        iconClass,
        options.toastClass,
        options.escapeHtml ? 'escape' : 'html',
        options.closeButton ? 'close' : 'no-close',
        options.tapToDismiss ? 'tap' : 'no-tap',
        options.closeOnHover ? 'hover' : 'no-hover',
        options.progressBar ? 'progress' : 'no-progress',
        options.newestOnTop ? 'newest' : 'oldest',
        String(options.showDuration),
        String(options.hideDuration),
        String(options.closeDuration),
        String(options.timeOut),
        String(options.extendedTimeOut),
        options.titleClass,
        options.messageClass,
        options.rtl ? 'rtl' : 'ltr',
      ].join('|')
      : null;
  }

  private findDuplicate(
    key: string,
    target: Element,
    positionClass: string,
    now: number,
  ): RenderRequest | ActiveToast | null {
    const matches = (candidate: RenderRequest | ActiveToast): boolean => (
      candidate.duplicateKey === key
      && candidate.target === target
      && candidate.options.positionClass === positionClass
      && now - candidate.lastDuplicateAt <= DUPLICATE_WINDOW_MS
    );
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const candidate = this.pending[index];
      if (candidate && !candidate.cancelled && matches(candidate)) return candidate;
    }
    const active = [...this.active.values()];
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const candidate = active[index];
      if (candidate && matches(candidate)) return candidate;
    }
    return null;
  }

  private aggregateDuplicate(candidate: RenderRequest | ActiveToast, options: RedrawOptions, now: number): void {
    candidate.duplicateCount += 1;
    candidate.lastDuplicateAt = now;
    candidate.shownCallbacks.push(options.onShown);
    candidate.hiddenCallbacks.push(options.onHidden);
    this.aggregated += 1;
    this.updateDuplicateBadge(candidate.element, candidate.duplicateCount);

    const active = this.active.get(candidate.element);
    if (active) {
      safelyCall(options.onShown, this.onError);
      if (!active.hoverPaused) {
        const duration = active.options.timeOut;
        this.restartProgress(active, duration);
        this.scheduleDismiss(active, duration);
      }
    }
    this.onStateChanged();
  }

  private updateDuplicateBadge(element: HTMLElement, count: number): void {
    let badge = element.querySelector<HTMLElement>('.qyh-toast-redraw-count');
    if (count <= 1) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'qyh-toast-redraw-count';
      element.append(badge);
    }
    badge.textContent = `×${count}`;
    badge.setAttribute('aria-label', `重复 ${count} 次`);
  }

  private fallback(callback: () => unknown): unknown {
    this.fallbacks += 1;
    this.onStateChanged();
    try {
      return callback();
    } catch (error) {
      this.onError(error);
      return undefined;
    }
  }

  private resolveTarget(target: unknown): Element | null {
    if (isElement(target)) return target;
    if (typeof target === 'string') {
      try {
        return document.querySelector(target);
      } catch {
        return null;
      }
    }
    return document.body;
  }

  private createHandle(element: HTMLElement): unknown {
    try {
      return typeof globalThis.jQuery === 'function' ? globalThis.jQuery(element) : element;
    } catch {
      return element;
    }
  }

  private elementsFromHandle(handle: unknown): HTMLElement[] {
    if (isElement(handle)) return [handle as HTMLElement];
    if (!handle || typeof handle !== 'object') return [];
    const collection = handle as ArrayLike<unknown>;
    const length = Number(collection.length);
    if (!Number.isFinite(length) || length < 1) return [];
    const elements: HTMLElement[] = [];
    for (let index = 0; index < Math.min(length, 100); index += 1) {
      if (isElement(collection[index])) elements.push(collection[index] as HTMLElement);
    }
    return elements;
  }

  private scheduleBatch(): void {
    if (this.frameId !== null) return;
    const enqueue = typeof globalThis.queueMicrotask === 'function'
      ? globalThis.queueMicrotask.bind(globalThis)
      : (callback: VoidFunction) => void Promise.resolve().then(callback);
    enqueue(() => {
      if (this.frameId !== null || this.pending.length === 0 || !this.enabled) return;
      this.frameId = this.requestFrame(() => this.flushBatch());
    });
  }

  private flushBatch(): void {
    const startedAt = this.now();
    this.frameId = null;
    if (!this.enabled) return;
    const batch = this.pending.splice(0, MAX_PER_FRAME);
    const prepared: Array<{ request: RenderRequest; container: HTMLElement }> = [];
    for (const request of batch) {
      if (request.cancelled) continue;
      try {
        this.populateElement(request);
        const container = this.getContainer(request.target, request.options.positionClass);
        prepared.push({ request, container });
      } catch (error) {
        this.onError(error);
        request.element.remove();
        this.fallback(request.fallback);
      }
    }

    const groups = new Map<HTMLElement, { append: HTMLElement[]; prepend: HTMLElement[] }>();
    for (const { request, container } of prepared) {
      const group = groups.get(container) ?? { append: [], prepend: [] };
      (request.options.newestOnTop ? group.prepend : group.append).push(request.element);
      groups.set(container, group);
    }
    for (const [container, group] of groups) {
      if (group.append.length > 0) container.append(this.toFragment(group.append));
      if (group.prepend.length > 0) container.prepend(this.toFragment(group.prepend.reverse()));
    }
    for (const { request } of prepared) this.activate(request);
    this.enforceVisibleLimit();
    if (this.pending.length > 0) this.frameId = this.requestFrame(() => this.flushBatch());
    if (this.diagnosticsEnabled) {
      const duration = Math.max(0, this.now() - startedAt);
      this.frameSamples += 1;
      this.totalBatchMs += duration;
      this.maxBatchMs = Math.max(this.maxBatchMs, duration);
      if (duration > FRAME_BUDGET_MS) this.overBudgetBatches += 1;
    }
    this.onStateChanged();
  }

  private toFragment(elements: HTMLElement[]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    fragment.append(...elements);
    return fragment;
  }

  private getContainer(target: Element, positionClass: string): HTMLElement {
    const key = String(positionClass || DEFAULT_OPTIONS.positionClass);
    let targetContainers = this.containers.get(target);
    if (!targetContainers) {
      targetContainers = new Map();
      this.containers.set(target, targetContainers);
    }
    let container = targetContainers.get(key);
    if (!container?.isConnected) {
      container = document.createElement('div');
      container.className = `${CONTAINER_CLASS} ${key}`;
      container.setAttribute('aria-relevant', 'additions');
      if (target !== document.body) container.classList.add('qyh-toast-redraw-container--targeted');
      target.append(container);
      targetContainers.set(key, container);
      this.observedContainers.add(container);
      if (typeof MutationObserver === 'function') {
        this.containerObserver ??= new MutationObserver(() => this.pruneDetachedToasts());
        this.containerObserver.observe(container, { childList: true });
      }
    }
    return container;
  }

  private populateElement(request: RenderRequest): void {
    const { element, options, response } = request;
    const { map } = response;
    element.className = `${options.toastClass} qyh-toast-redraw qyh-toast-redraw--${map.type} ${map.iconClass}`;
    element.classList.toggle('rtl', Boolean(options.rtl));
    element.classList.add('interactable');
    element.classList.remove('toast-non-interactable');
    element.setAttribute('title', '点击关闭');
    element.setAttribute('role', map.type === 'error' || map.type === 'warning' ? 'alert' : 'status');
    element.setAttribute('aria-atomic', 'true');
    element.style.setProperty('--qyh-redraw-show-duration', `${options.showDuration}ms`);
    element.style.setProperty('--qyh-redraw-hide-duration', `${options.hideDuration}ms`);

    if (options.closeButton) {
      element.classList.add('qyh-toast-redraw--has-close');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = options.closeClass;
      close.setAttribute('aria-label', '关闭通知');
      close.textContent = '×';
      close.addEventListener('click', event => {
        event.stopPropagation();
        safelyCall(options.onCloseClick, this.onError, event);
        this.dismissElement(element, true, false, true);
      });
      element.append(close);
    }
    if (map.title !== undefined && map.title !== null && map.title !== '') {
      element.append(this.createContent(options.titleClass, map.title, options.escapeHtml));
    }
    if (map.message !== undefined && map.message !== null && map.message !== '') {
      element.append(this.createContent(options.messageClass, map.message, options.escapeHtml));
    }
    if (options.progressBar && options.timeOut > 0) {
      const progress = document.createElement('div');
      progress.className = `${options.progressClass} qyh-toast-redraw-progress`;
      element.prepend(progress);
    }
    this.updateDuplicateBadge(element, request.duplicateCount);
  }

  private createContent(className: string, value: unknown, escapeHtml: boolean): HTMLElement {
    const content = document.createElement('div');
    content.className = String(className);
    if (escapeHtml) content.textContent = String(value);
    else content.innerHTML = String(value);
    return content;
  }

  private activate(request: RenderRequest): void {
    const { element, options, response } = request;
    const state: ActiveToast = {
      element,
      handle: request.handle,
      target: request.target,
      hideTimer: null,
      options,
      progressAnimation: null,
      response,
      duplicateCount: request.duplicateCount,
      duplicateKey: request.duplicateKey,
      lastDuplicateAt: request.lastDuplicateAt,
      shownCallbacks: request.shownCallbacks,
      hiddenCallbacks: request.hiddenCallbacks,
      timerDeadline: null,
      remainingTime: 0,
      timerAction: null,
      hoverPaused: false,
      visibilityPaused: false,
    };
    this.active.set(element, state);
    this.visibleOrder.add(element);
    this.rendered += 1;
    element.classList.add('qyh-toast-redraw--entering');
    element.addEventListener('click', event => {
      if (options.onclick) safelyCall(options.onclick, this.onError, event);
      this.dismissElement(element, true, false, false);
    });
    if (options.closeOnHover) {
      element.addEventListener('mouseenter', () => this.pause(state));
      element.addEventListener('mouseleave', () => this.resume(state));
    }
    const progress = element.querySelector<HTMLElement>('.qyh-toast-redraw-progress');
    if (progress && typeof progress.animate === 'function') {
      state.progressAnimation = progress.animate(
        [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: options.timeOut, easing: 'linear', fill: 'forwards' },
      );
    }
    this.scheduleDismiss(state, options.timeOut);
    for (const callback of state.shownCallbacks) safelyCall(callback, this.onError);
    this.onRendered();
  }

  private scheduleDismiss(state: ActiveToast, duration: number): void {
    this.clearDismissTimer(state);
    state.remainingTime = Math.max(0, duration);
    state.timerAction = duration > 0 ? 'dismiss' : null;
    if (!state.timerAction) return;
    if (this.isDocumentHidden()) {
      if (!state.visibilityPaused) this.visibilityPauses += 1;
      state.visibilityPaused = true;
      state.progressAnimation?.pause();
      return;
    }
    this.armDismissTimer(state);
  }

  private pause(state: ActiveToast): void {
    state.hoverPaused = true;
    this.clearDismissTimer(state);
    state.timerAction = null;
    state.remainingTime = 0;
    state.progressAnimation?.pause();
  }

  private resume(state: ActiveToast): void {
    if (!this.active.has(state.element)) return;
    state.hoverPaused = false;
    const duration = state.options.extendedTimeOut || state.options.timeOut;
    this.restartProgress(state, duration);
    this.scheduleDismiss(state, duration);
  }

  private restartProgress(state: ActiveToast, duration: number): void {
    state.progressAnimation?.cancel();
    state.progressAnimation = null;
    const progress = state.element.querySelector<HTMLElement>('.qyh-toast-redraw-progress');
    if (progress && duration > 0 && typeof progress.animate === 'function') {
      state.progressAnimation = progress.animate(
        [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration, easing: 'linear', fill: 'forwards' },
      );
      if (this.isDocumentHidden()) state.progressAnimation.pause();
    }
  }

  private clearDismissTimer(state: ActiveToast): void {
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = null;
    state.timerDeadline = null;
  }

  private armDismissTimer(state: ActiveToast): void {
    if (state.timerAction !== 'dismiss' || state.hoverPaused || state.visibilityPaused) return;
    const duration = Math.max(0, state.remainingTime);
    state.timerDeadline = Date.now() + duration;
    state.hideTimer = setTimeout(() => {
      state.hideTimer = null;
      state.timerDeadline = null;
      state.remainingTime = 0;
      state.timerAction = null;
      this.dismissElement(state.element, false, false, false);
    }, duration);
  }

  private startVisibilityTracking(): void {
    if (this.visibilityTracking || typeof document.addEventListener !== 'function') return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityTracking = true;
  }

  private stopVisibilityTracking(): void {
    if (!this.visibilityTracking || typeof document.removeEventListener !== 'function') return;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityTracking = false;
  }

  private isDocumentHidden(): boolean {
    return document.visibilityState === 'hidden' || document.hidden === true;
  }

  private syncVisibilityTimers(): void {
    const hidden = this.isDocumentHidden();
    for (const state of this.active.values()) {
      if (hidden) {
        if (state.visibilityPaused || state.timerAction !== 'dismiss') continue;
        if (state.hideTimer && state.timerDeadline !== null) {
          state.remainingTime = Math.max(0, state.timerDeadline - Date.now());
        }
        this.clearDismissTimer(state);
        state.visibilityPaused = true;
        state.progressAnimation?.pause();
        this.visibilityPauses += 1;
        continue;
      }
      if (!state.visibilityPaused) continue;
      state.visibilityPaused = false;
      if (state.hoverPaused) continue;
      if (state.progressAnimation && typeof state.progressAnimation.play === 'function') {
        state.progressAnimation.play();
      }
      this.armDismissTimer(state);
    }
    this.onStateChanged();
  }

  private configurePerformanceObserver(): void {
    this.stopPerformanceObserver();
    if (!this.diagnosticsEnabled || typeof globalThis.PerformanceObserver !== 'function') return;
    const supported = globalThis.PerformanceObserver.supportedEntryTypes ?? [];
    const type = supported.includes('long-animation-frame')
      ? 'long-animation-frame'
      : supported.includes('longtask')
        ? 'longtask'
        : null;
    if (!type) return;
    try {
      this.observerType = type;
      this.performanceObserver = new globalThis.PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          this.observedLongFrames += 1;
          this.maxObservedLongFrameMs = Math.max(this.maxObservedLongFrameMs, entry.duration);
        }
        this.onStateChanged();
      });
      this.performanceObserver.observe({ type, buffered: true });
    } catch {
      this.stopPerformanceObserver();
    }
  }

  private stopPerformanceObserver(): void {
    this.performanceObserver?.disconnect();
    this.performanceObserver = null;
    this.observerType = null;
  }

  private now(): number {
    return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
  }

  private dismissElement(element: HTMLElement, force: boolean, immediate: boolean, close: boolean): void {
    const native = this.adopted.get(element);
    if (native) {
      if (!force && document.activeElement && element.contains(document.activeElement)) return;
      // 先解除归属，再调用宿主 remove，避免辅助方法守卫递归。
      this.releaseAdopted(element);
      try { native.dismiss(element); } catch (error) { this.onError(error); }
      const container = element.parentElement;
      element.remove();
      this.removeEmptyContainer(container);
      this.onStateChanged();
      return;
    }
    const pendingIndex = this.pending.findIndex(request => request.element === element);
    if (pendingIndex >= 0) {
      const [request] = this.pending.splice(pendingIndex, 1);
      if (request) {
        request.cancelled = true;
        this.finishPending(request, false);
      }
      return;
    }
    const state = this.active.get(element);
    if (!state) return;
    if (!force && document.activeElement && element.contains(document.activeElement)) return;
    this.clearDismissTimer(state);
    state.timerAction = null;
    state.remainingTime = 0;
    state.visibilityPaused = false;
    state.progressAnimation?.cancel();
    if (immediate) {
      this.finishActive(state);
      return;
    }
    const duration = close && state.options.closeDuration !== false
      ? state.options.closeDuration
      : state.options.hideDuration;
    element.style.setProperty('--qyh-redraw-hide-duration', `${duration}ms`);
    element.classList.add('qyh-toast-redraw--leaving');
    state.hideTimer = setTimeout(() => this.finishActive(state), duration);
  }

  private finishPending(request: RenderRequest, evicted: boolean): void {
    request.element.removeAttribute(TOAST_ATTRIBUTE);
    request.element.remove();
    request.response.state = 'hidden';
    request.response.endTime = new Date();
    for (const callback of request.hiddenCallbacks) safelyCall(callback, this.onError);
    if (evicted) this.evicted += 1;
    this.resetPreviousMessageIfEmpty();
    this.onStateChanged();
  }

  private finishActive(state: ActiveToast): void {
    if (!this.active.delete(state.element)) return;
    this.visibleOrder.delete(state.element);
    this.clearDismissTimer(state);
    state.progressAnimation?.cancel();
    const container = state.element.parentElement;
    state.element.removeAttribute(TOAST_ATTRIBUTE);
    state.element.remove();
    this.removeEmptyContainer(container);
    state.response.state = 'hidden';
    state.response.endTime = new Date();
    for (const callback of state.hiddenCallbacks) safelyCall(callback, this.onError);
    this.resetPreviousMessageIfEmpty();
    this.onStateChanged();
  }

  private releaseAdopted(element: HTMLElement): void {
    const native = this.adopted.get(element);
    if (!native) return;
    element.removeEventListener?.('click', native.click);
    element.removeAttribute(ADOPTED_ATTRIBUTE);
    this.adopted.delete(element);
    this.visibleOrder.delete(element);
  }

  private removeEmptyContainer(container: HTMLElement | null): void {
    if (!container?.classList.contains(CONTAINER_CLASS) || container.childElementCount !== 0) return;
    container.remove();
  }

  /** 定向观察器及时回收原生计时器移除的节点；看门狗处理整个目标被卸载的情况。 */
  pruneDetachedToasts(): void {
    let changed = false;
    for (const element of [...this.adopted.keys()]) {
      if (element.isConnected) continue;
      this.releaseAdopted(element);
      changed = true;
    }
    for (const state of [...this.active.values()]) {
      if (!state.element.isConnected) { this.finishActive(state); changed = true; }
    }
    let reconnect = false;
    for (const container of this.observedContainers) {
      this.removeEmptyContainer(container);
      if (!container.isConnected) { this.observedContainers.delete(container); reconnect = true; }
    }
    if (reconnect) {
      this.containerObserver?.disconnect();
      for (const container of this.observedContainers) this.containerObserver?.observe(container, { childList: true });
    }
    if (changed) this.onStateChanged();
  }

  private enforceVisibleLimit(): void {
    this.pruneDetachedToasts();
    while (this.visibleOrder.size > this.maxVisible) {
      const oldest = this.visibleOrder.values().next().value;
      if (!oldest) break;
      this.evicted += 1;
      this.dismissElement(oldest, true, true, false);
    }
  }

  private resetPreviousMessageIfEmpty(): void {
    if (this.active.size === 0 && this.pending.length === 0) this.previousMessage = undefined;
  }

  private requestFrame(callback: FrameRequestCallback): number {
    if (typeof globalThis.requestAnimationFrame === 'function') return globalThis.requestAnimationFrame(callback);
    return setTimeout(() => callback(performance.now()), 16) as unknown as number;
  }

  private cancelFrame(id: number): void {
    if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(id);
    else clearTimeout(id);
  }
}

export interface ToastrAuxiliaryGuard {
  guardedCount: number;
  restore(): void;
}

export function guardToastrAuxiliaryMethods(
  target: Record<string, unknown>,
  renderer: LightweightToastRenderer,
): ToastrAuxiliaryGuard {
  const records: Array<{
    descriptor: PropertyDescriptor | undefined;
    getUnderlying: () => unknown;
    method: 'clear' | 'remove';
  }> = [];
  for (const method of ['clear', 'remove'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    if (descriptor && descriptor.configurable === false) continue;
    let underlying: unknown = target[method];
    const guarded = function (this: unknown, ...args: unknown[]) {
      const [handle, clearOptions] = args;
      const options = asRecord(clearOptions);
      if (handle !== undefined && renderer.ownsHandle(handle)) {
        renderer.clear(handle, { force: Boolean(options.force), immediate: method === 'remove' });
        return undefined;
      }
      if (handle === undefined) renderer.clearAll(method === 'remove');
      return typeof underlying === 'function'
        ? Reflect.apply(underlying as AnyFunction, this, args)
        : undefined;
    };
    try {
      Object.defineProperty(target, method, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: () => guarded,
        set: value => {
          if (value !== guarded) underlying = value;
        },
      });
      records.push({ descriptor, getUnderlying: () => underlying, method });
    } catch {
      // 单条 Toast 仍可自动消失，只有外部 clear/remove 兼容层会缺失。
    }
  }
  return {
    guardedCount: records.length,
    restore() {
      for (const record of records) {
        const value = record.getUnderlying();
        try {
          if (record.descriptor && 'value' in record.descriptor) {
            Object.defineProperty(target, record.method, { ...record.descriptor, value });
          } else {
            Object.defineProperty(target, record.method, {
              configurable: true,
              enumerable: record.descriptor?.enumerable ?? true,
              writable: true,
              value,
            });
          }
        } catch {
          try {
            target[record.method] = value;
          } catch {
            // 页面重载会恢复宿主原生对象。
          }
        }
      }
    },
  };
}
