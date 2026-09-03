import { type BlockedToastLevels, type SuppressedToast, type ToastLevel, type ToastrGuard } from './core.js';
import { LightweightToastRenderer, type RedrawStats, type ToastrAuxiliaryGuard } from './renderer.js';
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
export declare class ToastRuntimeBlocker {
    enabled: boolean;
    blockedLevels: BlockedToastLevels;
    onSuppressed: (toast: SuppressedToast) => void;
    onStateChanged: () => void;
    redrawEnabled: boolean;
    redrawMaxVisible: number;
    guard: ToastrGuard | null;
    auxiliaryGuard: ToastrAuxiliaryGuard | null;
    guardedTarget: Record<string, unknown> | null;
    observer: MutationObserver | null;
    watchdog: ReturnType<typeof setInterval> | null;
    renderer: LightweightToastRenderer;
    constructor({ onSuppressed, onRedrawn, onStateChanged }?: RuntimeCallbacks);
    setEnabled(enabled: boolean): void;
    setBlockedLevels(levels: BlockedToastLevels): void;
    configure({ blockerEnabled, blockedLevels, redrawEnabled, redrawMaxVisible }: RuntimeConfiguration): void;
    isEffective(): boolean;
    isBlockerEffective(): boolean;
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
