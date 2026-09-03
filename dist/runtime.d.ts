import { type BlockedToastLevels, type SuppressedToast, type ToastLevel, type ToastrGuard } from './core.js';
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
export declare class ToastRuntimeBlocker {
    enabled: boolean;
    blockedLevels: BlockedToastLevels;
    onSuppressed: (toast: SuppressedToast) => void;
    onStateChanged: () => void;
    guard: ToastrGuard | null;
    guardedTarget: Record<string, unknown> | null;
    observer: MutationObserver | null;
    watchdog: ReturnType<typeof setInterval> | null;
    constructor({ onSuppressed, onStateChanged }?: RuntimeCallbacks);
    setEnabled(enabled: boolean): void;
    setBlockedLevels(levels: BlockedToastLevels): void;
    configure(enabled: boolean, levels: BlockedToastLevels): void;
    isEffective(): boolean;
    ensureRuntimeStyle(): void;
    patchCurrentToastr(): void;
    restoreGuard(): void;
    removeBlockedToasts(): void;
    startObserver(): void;
    stopObserver(): void;
    startWatchdog(): void;
    stopWatchdog(): void;
    getStatus(): RuntimeStatus;
}
export {};
