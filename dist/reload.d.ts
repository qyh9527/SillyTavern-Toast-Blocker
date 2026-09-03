type Defer = (callback: () => void) => unknown;
interface ReloadSchedulerOptions {
    defer?: Defer;
    reload?: () => void;
}
/**
 * 为一次扩展更新只安排一次前端刷新。延迟到当前任务结束，避免在更新 hook
 * 尚未返回时中断宿主的更新收尾工作。
 */
export declare function createSingleReloadScheduler({ defer, reload, }?: ReloadSchedulerOptions): () => boolean;
export declare const scheduleFrontendReload: () => boolean;
export {};
