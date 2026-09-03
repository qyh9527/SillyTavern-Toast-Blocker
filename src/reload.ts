type Defer = (callback: () => void) => unknown;

interface ReloadSchedulerOptions {
  defer?: Defer;
  reload?: () => void;
}

/**
 * 为一次扩展更新只安排一次前端刷新。延迟到当前任务结束，避免在更新 hook
 * 尚未返回时中断宿主的更新收尾工作。
 */
export function createSingleReloadScheduler({
  defer = callback => setTimeout(callback, 0),
  reload = () => globalThis.location.reload(),
}: ReloadSchedulerOptions = {}): () => boolean {
  let scheduled = false;
  return () => {
    if (scheduled) return false;
    scheduled = true;
    defer(reload);
    return true;
  };
}

export const scheduleFrontendReload = createSingleReloadScheduler();
