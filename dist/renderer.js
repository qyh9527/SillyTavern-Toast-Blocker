import { normalizeMaxVisible } from './core.js';
const CONTAINER_CLASS = 'qyh-toast-redraw-container';
const TOAST_ATTRIBUTE = 'data-qyh-redraw-toast';
const MAX_PER_FRAME = 12;
const MAX_PENDING = 100;
const DEFAULT_OPTIONS = {
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
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function finiteNumber(value, fallback) {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
}
function mergeOptions(globalOptions, override) {
    const global = asRecord(globalOptions);
    const local = asRecord(override);
    const iconClasses = {
        ...DEFAULT_OPTIONS.iconClasses,
        ...asRecord(global.iconClasses),
        ...asRecord(local.iconClasses),
    };
    const merged = { ...DEFAULT_OPTIONS, ...global, ...local, iconClasses };
    merged.showDuration = finiteNumber(merged.showDuration, DEFAULT_OPTIONS.showDuration);
    merged.hideDuration = finiteNumber(merged.hideDuration, DEFAULT_OPTIONS.hideDuration);
    merged.extendedTimeOut = finiteNumber(merged.extendedTimeOut, DEFAULT_OPTIONS.extendedTimeOut);
    merged.timeOut = finiteNumber(merged.timeOut, DEFAULT_OPTIONS.timeOut);
    merged.closeDuration = merged.closeDuration === false
        ? false
        : finiteNumber(merged.closeDuration, merged.hideDuration);
    return merged;
}
function isElement(value) {
    return Boolean(value && typeof value === 'object' && value.nodeType === 1);
}
function safelyCall(callback, onError, ...args) {
    if (typeof callback !== 'function')
        return;
    try {
        const result = Reflect.apply(callback, undefined, args);
        if (result && typeof result.then === 'function') {
            void Promise.resolve(result).catch(onError);
        }
    }
    catch (error) {
        onError(error);
    }
}
export class LightweightToastRenderer {
    enabled = false;
    maxVisible = 6;
    active = new Map();
    containers = new WeakMap();
    evicted = 0;
    fallbacks = 0;
    frameId = null;
    nextToastId = 0;
    pending = [];
    previousMessage;
    rendered = 0;
    onError;
    onRendered;
    onStateChanged;
    constructor({ onError = () => { }, onRendered = () => { }, onStateChanged = () => { } } = {}) {
        this.onError = onError;
        this.onRendered = onRendered;
        this.onStateChanged = onStateChanged;
    }
    configure(enabled, maxVisible) {
        const nextEnabled = Boolean(enabled);
        this.maxVisible = normalizeMaxVisible(maxVisible);
        if (this.enabled && !nextEnabled)
            this.stop();
        this.enabled = nextEnabled;
        if (this.enabled)
            this.enforceVisibleLimit();
        this.onStateChanged();
    }
    show(level, args, fallback, globalOptions) {
        if (!this.enabled)
            return fallback();
        try {
            const [message, title, override] = args;
            const options = mergeOptions(globalOptions, override);
            if (options.preventDuplicates && message === this.previousMessage)
                return undefined;
            const target = this.resolveTarget(options.target);
            if (!target)
                return this.fallback(fallback);
            this.previousMessage = message;
            const element = document.createElement('div');
            const iconClass = String(asRecord(override).iconClass ?? options.iconClasses[level] ?? `toast-${level}`);
            const map = { type: level, iconClass, message, title, optionsOverride: override };
            const response = {
                toastId: ++this.nextToastId,
                state: 'visible',
                startTime: new Date(),
                options,
                map,
            };
            element.setAttribute(TOAST_ATTRIBUTE, String(response.toastId));
            const handle = this.createHandle(element);
            this.pending.push({ element, fallback, handle, options, response, target, cancelled: false });
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
        }
        catch (error) {
            this.onError(error);
            return this.fallback(fallback);
        }
    }
    ownsHandle(handle) {
        return this.elementsFromHandle(handle).some(element => element.hasAttribute(TOAST_ATTRIBUTE));
    }
    clear(handle, { force = false, immediate = false } = {}) {
        const elements = this.elementsFromHandle(handle).filter(element => element.hasAttribute(TOAST_ATTRIBUTE));
        if (elements.length === 0)
            return false;
        for (const element of elements)
            this.dismissElement(element, force, immediate, false);
        return true;
    }
    clearAll(immediate = false) {
        for (const request of [...this.pending])
            this.dismissElement(request.element, true, true, false);
        for (const element of [...this.active.keys()])
            this.dismissElement(element, true, immediate, false);
    }
    stop() {
        if (this.frameId !== null)
            this.cancelFrame(this.frameId);
        this.frameId = null;
        this.clearAll(true);
        this.pending.length = 0;
        this.enabled = false;
        this.previousMessage = undefined;
    }
    getStats() {
        return {
            enabled: this.enabled,
            active: this.active.size,
            pending: this.pending.length,
            rendered: this.rendered,
            evicted: this.evicted,
            fallbacks: this.fallbacks,
            maxVisible: this.maxVisible,
        };
    }
    fallback(callback) {
        this.fallbacks += 1;
        this.onStateChanged();
        try {
            return callback();
        }
        catch (error) {
            this.onError(error);
            return undefined;
        }
    }
    resolveTarget(target) {
        if (isElement(target))
            return target;
        if (typeof target === 'string') {
            try {
                return document.querySelector(target);
            }
            catch {
                return null;
            }
        }
        return document.body;
    }
    createHandle(element) {
        try {
            return typeof globalThis.jQuery === 'function' ? globalThis.jQuery(element) : element;
        }
        catch {
            return element;
        }
    }
    elementsFromHandle(handle) {
        if (isElement(handle))
            return [handle];
        if (!handle || typeof handle !== 'object')
            return [];
        const collection = handle;
        const length = Number(collection.length);
        if (!Number.isFinite(length) || length < 1)
            return [];
        const elements = [];
        for (let index = 0; index < Math.min(length, 100); index += 1) {
            if (isElement(collection[index]))
                elements.push(collection[index]);
        }
        return elements;
    }
    scheduleBatch() {
        if (this.frameId !== null)
            return;
        const enqueue = typeof globalThis.queueMicrotask === 'function'
            ? globalThis.queueMicrotask.bind(globalThis)
            : (callback) => void Promise.resolve().then(callback);
        enqueue(() => {
            if (this.frameId !== null || this.pending.length === 0 || !this.enabled)
                return;
            this.frameId = this.requestFrame(() => this.flushBatch());
        });
    }
    flushBatch() {
        this.frameId = null;
        if (!this.enabled)
            return;
        const batch = this.pending.splice(0, MAX_PER_FRAME);
        const prepared = [];
        for (const request of batch) {
            if (request.cancelled)
                continue;
            try {
                this.populateElement(request);
                const container = this.getContainer(request.target, request.options.positionClass);
                prepared.push({ request, container });
            }
            catch (error) {
                this.onError(error);
                request.element.remove();
                this.fallback(request.fallback);
            }
        }
        const groups = new Map();
        for (const { request, container } of prepared) {
            const group = groups.get(container) ?? { append: [], prepend: [] };
            (request.options.newestOnTop ? group.prepend : group.append).push(request.element);
            groups.set(container, group);
        }
        for (const [container, group] of groups) {
            if (group.append.length > 0)
                container.append(this.toFragment(group.append));
            if (group.prepend.length > 0)
                container.prepend(this.toFragment(group.prepend.reverse()));
        }
        for (const { request } of prepared)
            this.activate(request);
        this.enforceVisibleLimit();
        if (this.pending.length > 0)
            this.frameId = this.requestFrame(() => this.flushBatch());
        this.onStateChanged();
    }
    toFragment(elements) {
        const fragment = document.createDocumentFragment();
        fragment.append(...elements);
        return fragment;
    }
    getContainer(target, positionClass) {
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
            if (target !== document.body)
                container.classList.add('qyh-toast-redraw-container--targeted');
            target.append(container);
            targetContainers.set(key, container);
        }
        return container;
    }
    populateElement(request) {
        const { element, options, response } = request;
        const { map } = response;
        element.className = `${options.toastClass} qyh-toast-redraw qyh-toast-redraw--${map.type} ${map.iconClass}`;
        element.classList.toggle('rtl', Boolean(options.rtl));
        element.classList.toggle('interactable', options.tapToDismiss !== false);
        element.classList.toggle('toast-non-interactable', options.tapToDismiss === false);
        element.setAttribute('role', map.type === 'error' || map.type === 'warning' ? 'alert' : 'status');
        element.setAttribute('aria-atomic', 'true');
        element.style.setProperty('--qyh-redraw-show-duration', `${options.showDuration}ms`);
        element.style.setProperty('--qyh-redraw-hide-duration', `${options.hideDuration}ms`);
        if (options.closeButton) {
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
    }
    createContent(className, value, escapeHtml) {
        const content = document.createElement('div');
        content.className = String(className);
        if (escapeHtml)
            content.textContent = String(value);
        else
            content.innerHTML = String(value);
        return content;
    }
    activate(request) {
        const { element, options, response } = request;
        const state = {
            element,
            hideTimer: null,
            options,
            progressAnimation: null,
            response,
        };
        this.active.set(element, state);
        this.rendered += 1;
        element.classList.add('qyh-toast-redraw--entering');
        element.addEventListener('click', event => {
            if (options.onclick)
                safelyCall(options.onclick, this.onError, event);
            if (options.onclick || options.tapToDismiss !== false)
                this.dismissElement(element, false, false, false);
        });
        if (options.closeOnHover) {
            element.addEventListener('mouseenter', () => this.pause(state));
            element.addEventListener('mouseleave', () => this.resume(state));
        }
        const progress = element.querySelector('.qyh-toast-redraw-progress');
        if (progress && typeof progress.animate === 'function') {
            state.progressAnimation = progress.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: options.timeOut, easing: 'linear', fill: 'forwards' });
        }
        this.scheduleDismiss(state, options.timeOut);
        safelyCall(options.onShown, this.onError);
        this.onRendered();
    }
    scheduleDismiss(state, duration) {
        if (state.hideTimer)
            clearTimeout(state.hideTimer);
        state.hideTimer = duration > 0
            ? setTimeout(() => this.dismissElement(state.element, false, false, false), duration)
            : null;
    }
    pause(state) {
        if (state.hideTimer)
            clearTimeout(state.hideTimer);
        state.hideTimer = null;
        state.progressAnimation?.pause();
    }
    resume(state) {
        if (!this.active.has(state.element))
            return;
        const duration = state.options.extendedTimeOut || state.options.timeOut;
        state.progressAnimation?.cancel();
        const progress = state.element.querySelector('.qyh-toast-redraw-progress');
        if (progress && duration > 0 && typeof progress.animate === 'function') {
            state.progressAnimation = progress.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: 'linear', fill: 'forwards' });
        }
        this.scheduleDismiss(state, duration);
    }
    dismissElement(element, force, immediate, close) {
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
        if (!state)
            return;
        if (!force && document.activeElement && element.contains(document.activeElement))
            return;
        if (state.hideTimer)
            clearTimeout(state.hideTimer);
        state.hideTimer = null;
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
    finishPending(request, evicted) {
        request.element.removeAttribute(TOAST_ATTRIBUTE);
        request.element.remove();
        request.response.state = 'hidden';
        request.response.endTime = new Date();
        safelyCall(request.options.onHidden, this.onError);
        if (evicted)
            this.evicted += 1;
        this.resetPreviousMessageIfEmpty();
        this.onStateChanged();
    }
    finishActive(state) {
        if (!this.active.delete(state.element))
            return;
        if (state.hideTimer)
            clearTimeout(state.hideTimer);
        state.progressAnimation?.cancel();
        const container = state.element.parentElement;
        state.element.removeAttribute(TOAST_ATTRIBUTE);
        state.element.remove();
        if (container?.classList.contains(CONTAINER_CLASS) && container.childElementCount === 0)
            container.remove();
        state.response.state = 'hidden';
        state.response.endTime = new Date();
        safelyCall(state.options.onHidden, this.onError);
        this.resetPreviousMessageIfEmpty();
        this.onStateChanged();
    }
    enforceVisibleLimit() {
        while (this.active.size > this.maxVisible) {
            const oldest = this.active.values().next().value;
            if (!oldest)
                break;
            this.evicted += 1;
            this.dismissElement(oldest.element, true, true, false);
        }
    }
    resetPreviousMessageIfEmpty() {
        if (this.active.size === 0 && this.pending.length === 0)
            this.previousMessage = undefined;
    }
    requestFrame(callback) {
        if (typeof globalThis.requestAnimationFrame === 'function')
            return globalThis.requestAnimationFrame(callback);
        return setTimeout(() => callback(performance.now()), 16);
    }
    cancelFrame(id) {
        if (typeof globalThis.cancelAnimationFrame === 'function')
            globalThis.cancelAnimationFrame(id);
        else
            clearTimeout(id);
    }
}
export function guardToastrAuxiliaryMethods(target, renderer) {
    const records = [];
    for (const method of ['clear', 'remove']) {
        const descriptor = Object.getOwnPropertyDescriptor(target, method);
        if (descriptor && descriptor.configurable === false)
            continue;
        let underlying = target[method];
        const guarded = function (...args) {
            const [handle, clearOptions] = args;
            const options = asRecord(clearOptions);
            if (handle !== undefined && renderer.ownsHandle(handle)) {
                renderer.clear(handle, { force: Boolean(options.force), immediate: method === 'remove' });
                return undefined;
            }
            if (handle === undefined)
                renderer.clearAll(method === 'remove');
            return typeof underlying === 'function'
                ? Reflect.apply(underlying, this, args)
                : undefined;
        };
        try {
            Object.defineProperty(target, method, {
                configurable: true,
                enumerable: descriptor?.enumerable ?? true,
                get: () => guarded,
                set: value => {
                    if (value !== guarded)
                        underlying = value;
                },
            });
            records.push({ descriptor, getUnderlying: () => underlying, method });
        }
        catch {
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
                    }
                    else {
                        Object.defineProperty(target, record.method, {
                            configurable: true,
                            enumerable: record.descriptor?.enumerable ?? true,
                            writable: true,
                            value,
                        });
                    }
                }
                catch {
                    try {
                        target[record.method] = value;
                    }
                    catch {
                        // 页面重载会恢复宿主原生对象。
                    }
                }
            }
        },
    };
}
//# sourceMappingURL=renderer.js.map