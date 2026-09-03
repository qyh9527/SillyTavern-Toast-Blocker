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
