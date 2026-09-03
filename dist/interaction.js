/** 要求危险操作在限定时间内被主动触发两次。 */
export function createTimedConfirmation({ clearTimer = handle => clearTimeout(handle), onExpired = () => { }, setTimer = (callback, timeoutMs) => setTimeout(callback, timeoutMs), timeoutMs = 5000, } = {}) {
    let timer = null;
    const cancel = () => {
        if (timer !== null)
            clearTimer(timer);
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
//# sourceMappingURL=interaction.js.map