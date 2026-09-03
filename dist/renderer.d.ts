import { type ToastLevel } from './core.js';
interface RendererCallbacks {
    onError?: (error: unknown) => void;
    onRendered?: () => void;
    onStateChanged?: () => void;
}
export interface RedrawStats {
    enabled: boolean;
    active: number;
    pending: number;
    rendered: number;
    evicted: number;
    fallbacks: number;
    maxVisible: number;
}
export declare class LightweightToastRenderer {
    enabled: boolean;
    maxVisible: number;
    private active;
    private containers;
    private evicted;
    private fallbacks;
    private frameId;
    private nextToastId;
    private pending;
    private previousMessage;
    private rendered;
    private readonly onError;
    private readonly onRendered;
    private readonly onStateChanged;
    constructor({ onError, onRendered, onStateChanged }?: RendererCallbacks);
    configure(enabled: boolean, maxVisible: number): void;
    show(level: ToastLevel, args: unknown[], fallback: () => unknown, globalOptions: unknown): unknown;
    ownsHandle(handle: unknown): boolean;
    /**
     * 接管在重绘器加载前已经由原生 Toastr 创建的节点。直接移动节点可保留其
     * 链接、按钮和已绑定事件；随后补上统一外观与整卡点击关闭能力。
     */
    adoptNativeToasts(elements: Iterable<Element>, globalOptions: unknown, dismiss: (element: HTMLElement) => void): number;
    clear(handle: unknown, { force, immediate }?: {
        force?: boolean | undefined;
        immediate?: boolean | undefined;
    }): boolean;
    clearAll(immediate?: boolean): void;
    stop(): void;
    getStats(): RedrawStats;
    private fallback;
    private resolveTarget;
    private createHandle;
    private elementsFromHandle;
    private scheduleBatch;
    private flushBatch;
    private toFragment;
    private getContainer;
    private populateElement;
    private createContent;
    private activate;
    private scheduleDismiss;
    private pause;
    private resume;
    private dismissElement;
    private finishPending;
    private finishActive;
    private enforceVisibleLimit;
    private resetPreviousMessageIfEmpty;
    private requestFrame;
    private cancelFrame;
}
export interface ToastrAuxiliaryGuard {
    guardedCount: number;
    restore(): void;
}
export declare function guardToastrAuxiliaryMethods(target: Record<string, unknown>, renderer: LightweightToastRenderer): ToastrAuxiliaryGuard;
export {};
