import { type ToastLevel } from './core.js';
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
export declare class LightweightToastRenderer {
    enabled: boolean;
    maxVisible: number;
    aggregateDuplicates: boolean;
    diagnosticsEnabled: boolean;
    private active;
    private adopted;
    private visibleOrder;
    private containerObserver;
    private observedContainers;
    private containers;
    private evicted;
    private fallbacks;
    private frameId;
    private nextToastId;
    private pending;
    private previousMessage;
    private rendered;
    private aggregated;
    private pendingPeak;
    private visibilityPauses;
    private frameSamples;
    private totalBatchMs;
    private maxBatchMs;
    private overBudgetBatches;
    private observedLongFrames;
    private maxObservedLongFrameMs;
    private performanceObserver;
    private observerType;
    private longFrameNotifyTimer;
    private visibilityTracking;
    private readonly onError;
    private readonly onRendered;
    private readonly onStateChanged;
    private readonly handleVisibilityChange;
    constructor({ onError, onRendered, onStateChanged }?: RendererCallbacks);
    configure(enabled: boolean, maxVisible: number, { aggregateDuplicates, diagnosticsEnabled, }?: RendererConfiguration): void;
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
    resetDiagnostics(): void;
    private createDuplicateKey;
    private findDuplicate;
    private aggregateDuplicate;
    private updateDuplicateBadge;
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
    private restartProgress;
    private clearDismissTimer;
    private armDismissTimer;
    private startVisibilityTracking;
    private stopVisibilityTracking;
    private isDocumentHidden;
    private syncVisibilityTimers;
    private configurePerformanceObserver;
    /** 突发的上百条长帧在冷却窗口内只触发一次 UI 更新；计数本身每条都入账。 */
    private scheduleLongFrameNotify;
    private stopPerformanceObserver;
    private now;
    private dismissElement;
    private finishPending;
    private finishActive;
    private releaseAdopted;
    private removeEmptyContainer;
    /** 定向观察器及时回收原生计时器移除的节点；看门狗处理整个目标被卸载的情况。 */
    pruneDetachedToasts(): void;
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
