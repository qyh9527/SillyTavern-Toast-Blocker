export declare const SETTINGS_KEY = "qyh_toast_blocker";
export declare const BLOCK_START = "/* SillyTavern Toast Blocker: managed start */";
export declare const BLOCK_END = "/* SillyTavern Toast Blocker: managed end */";
export declare const REDRAW_READY_CLASS = "qyh-toast-redraw-ready";
export declare const TOAST_METHODS: readonly ["success", "info", "warning", "error"];
export type ToastLevel = (typeof TOAST_METHODS)[number];
export type BlockedToastLevels = Record<ToastLevel, boolean>;
export interface ToastBlockerSettings {
    enabled: boolean;
    blockedLevels: BlockedToastLevels;
    redrawEnabled: boolean;
    redrawMaxVisible: number;
    logSuppressed: boolean;
    schemaVersion: 3;
}
export interface SuppressedToast {
    level: ToastLevel;
    args: unknown[];
}
export declare const DEFAULT_BLOCKED_LEVELS: Readonly<BlockedToastLevels>;
export declare function normalizeSettings(value: unknown): ToastBlockerSettings;
export declare function normalizeMaxVisible(value: unknown): number;
export declare function getBlockedMethods(levels: BlockedToastLevels): ToastLevel[];
export declare function buildManagedRules(levels: BlockedToastLevels, hideNativeUntilRedrawReady?: boolean): string;
export declare function hasManagedCss(css: unknown): boolean;
export declare function stripManagedCss(css: unknown): string;
export declare function updateManagedCss(css: unknown, enabled: boolean, levels?: BlockedToastLevels, hideNativeUntilRedrawReady?: boolean): string;
/**
 * 用 accessor 守卫 toastr 的四个展示方法。后加载脚本即便重新赋值方法，getter
 * 仍返回屏蔽函数；关闭后则恢复最近一次被赋入的真实实现。
 */
export interface ToastrGuard {
    guardedCount: number;
    restore(): void;
}
interface GuardOptions {
    methods?: readonly ToastLevel[];
    handleCall?: (invocation: ToastInvocation) => unknown;
    onSuppressed?: (toast: SuppressedToast) => void;
    createResult?: (level: ToastLevel, args: unknown[]) => unknown;
}
export interface ToastInvocation extends SuppressedToast {
    thisArg: unknown;
    invokeOriginal(): unknown;
}
export declare function guardToastrMethods(target: Record<string, unknown> | null | undefined, { methods, handleCall, onSuppressed, createResult, }?: GuardOptions): ToastrGuard | null;
export {};
