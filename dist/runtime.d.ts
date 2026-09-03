import { type SuppressedToast, type ToastrGuard } from './core.js';
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
export declare class ToastRuntimeBlocker {
    enabled: boolean;
    onSuppressed: (toast: SuppressedToast) => void;
    onStateChanged: () => void;
    guard: ToastrGuard | null;
    guardedTarget: Record<string, unknown> | null;
    observer: MutationObserver | null;
    watchdog: ReturnType<typeof setInterval> | null;
    constructor({ onSuppressed, onStateChanged }?: RuntimeCallbacks);
    setEnabled(enabled: boolean): void;
    ensureRuntimeStyle(): void;
    patchCurrentToastr(): void;
    restoreGuard(): void;
    removeExistingContainers(): void;
    startObserver(): void;
    stopObserver(): void;
    startWatchdog(): void;
    stopWatchdog(): void;
    getStatus(): RuntimeStatus;
}
export {};
