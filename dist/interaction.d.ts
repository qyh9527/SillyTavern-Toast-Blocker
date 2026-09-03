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
export declare function createTimedConfirmation({ clearTimer, onExpired, setTimer, timeoutMs, }?: TimedConfirmationOptions): TimedConfirmation;
export {};
