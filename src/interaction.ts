type TimerHandle = ReturnType<typeof setTimeout>;

interface TimedConfirmationOptions {
  clearTimer?: (handle: TimerHandle) => void;
  onExpired?: () => void;
  setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  timeoutMs?: number;
}

export interface TimedConfirmation {
  activate(): 'armed' | 'confirmed';
  cancel(): void;
  isArmed(): boolean;
}

/** 要求危险操作在限定时间内被主动触发两次。 */
export function createTimedConfirmation({
  clearTimer = handle => clearTimeout(handle),
  onExpired = () => {},
  setTimer = (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  timeoutMs = 5000,
}: TimedConfirmationOptions = {}): TimedConfirmation {
  let timer: TimerHandle | null = null;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    activate() {
      if (timer !== null) {
        cancel();
        return 'confirmed';
      }
      timer = setTimer(() => {
        timer = null;
        onExpired();
      }, Math.max(1000, timeoutMs));
      return 'armed';
    },
    cancel,
    isArmed: () => timer !== null,
  };
}
