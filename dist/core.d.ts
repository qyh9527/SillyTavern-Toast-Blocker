export declare const SETTINGS_KEY = "qyh_toast_blocker";
export declare const BLOCK_START = "/* SillyTavern Toast Blocker: managed start */";
export declare const BLOCK_END = "/* SillyTavern Toast Blocker: managed end */";
export declare const TOAST_METHODS: readonly ["success", "info", "warning", "error"];
export type ToastLevel = (typeof TOAST_METHODS)[number];
export interface ToastBlockerSettings {
    enabled: boolean;
    logSuppressed: boolean;
    schemaVersion: 1;
}
export interface SuppressedToast {
    level: ToastLevel;
    args: unknown[];
}
export declare const MANAGED_RULES = "/* SillyTavern Toast Blocker: managed start */\n#toast-container {\n  display: none !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}\n/* SillyTavern Toast Blocker: managed end */";
export declare function normalizeSettings(value: unknown): ToastBlockerSettings;
export declare function hasManagedCss(css: unknown): boolean;
export declare function stripManagedCss(css: unknown): string;
export declare function updateManagedCss(css: unknown, enabled: boolean): string;
/**
 * 用 accessor 守卫 toastr 的四个展示方法。后加载脚本即便重新赋值方法，getter
 * 仍返回屏蔽函数；关闭后则恢复最近一次被赋入的真实实现。
 */
export interface ToastrGuard {
    guardedCount: number;
    restore(): void;
}
interface GuardOptions {
    onSuppressed?: (toast: SuppressedToast) => void;
    createResult?: (level: ToastLevel, args: unknown[]) => unknown;
}
export declare function guardToastrMethods(target: Record<string, unknown> | null | undefined, { onSuppressed, createResult }?: GuardOptions): ToastrGuard | null;
export {};
