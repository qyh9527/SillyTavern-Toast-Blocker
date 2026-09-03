export const SETTINGS_KEY = 'qyh_toast_blocker';
export const BLOCK_START = '/* SillyTavern Toast Blocker: managed start */';
export const BLOCK_END = '/* SillyTavern Toast Blocker: managed end */';
export const REDRAW_READY_CLASS = 'qyh-toast-redraw-ready';
export const TOAST_METHODS = Object.freeze(['success', 'info', 'warning', 'error']);
export const DEFAULT_BLOCKED_LEVELS = Object.freeze({
    success: true,
    info: true,
    warning: true,
    error: true,
});
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    blockedLevels: DEFAULT_BLOCKED_LEVELS,
    redrawEnabled: false,
    redrawMaxVisible: 6,
    logSuppressed: false,
    schemaVersion: 3,
});
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const BLOCK_PATTERN = new RegExp(`(?:\\r?\\n)?${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}(?:\\r?\\n)?`, 'g');
export function normalizeSettings(value) {
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const levels = candidate.blockedLevels && typeof candidate.blockedLevels === 'object'
        ? candidate.blockedLevels
        : {};
    return {
        enabled: candidate.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(candidate.enabled),
        blockedLevels: {
            success: levels.success === undefined ? true : Boolean(levels.success),
            info: levels.info === undefined ? true : Boolean(levels.info),
            warning: levels.warning === undefined ? true : Boolean(levels.warning),
            error: levels.error === undefined ? true : Boolean(levels.error),
        },
        redrawEnabled: Boolean(candidate.redrawEnabled),
        redrawMaxVisible: normalizeMaxVisible(candidate.redrawMaxVisible),
        logSuppressed: Boolean(candidate.logSuppressed),
        schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    };
}
export function normalizeMaxVisible(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.min(20, Math.max(1, Math.round(parsed))) : 6;
}
export function getBlockedMethods(levels) {
    return TOAST_METHODS.filter(level => levels[level]);
}
export function buildManagedRules(levels, hideNativeUntilRedrawReady = false) {
    const blocked = getBlockedMethods(levels);
    if (blocked.length === 0 && !hideNativeUntilRedrawReady)
        return '';
    const sections = [];
    if (blocked.length > 0) {
        const selectors = blocked.length === TOAST_METHODS.length
            ? '#toast-container'
            : blocked.map(level => `#toast-container > .toast-${level}`).join(',\n');
        sections.push(`${selectors} {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}`);
    }
    if (hideNativeUntilRedrawReady) {
        sections.push(`html:not(.${REDRAW_READY_CLASS}) #toast-container {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  animation: qyh-toast-redraw-startup-release 1ms step-end 8s forwards;
}
@keyframes qyh-toast-redraw-startup-release {
  to {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
  }
}`);
    }
    return `${BLOCK_START}\n${sections.join('\n')}\n${BLOCK_END}`;
}
export function hasManagedCss(css) {
    const text = typeof css === 'string' ? css : '';
    const start = text.indexOf(BLOCK_START);
    const end = text.indexOf(BLOCK_END, Math.max(0, start));
    return start >= 0 && end > start;
}
export function stripManagedCss(css) {
    return (typeof css === 'string' ? css : '').replace(BLOCK_PATTERN, '');
}
export function updateManagedCss(css, enabled, levels = { ...DEFAULT_BLOCKED_LEVELS }, hideNativeUntilRedrawReady = false) {
    const clean = stripManagedCss(css);
    const effectiveLevels = enabled
        ? levels
        : { success: false, info: false, warning: false, error: false };
    const rules = buildManagedRules(effectiveLevels, hideNativeUntilRedrawReady);
    return rules ? `${clean}\n${rules}\n` : clean;
}
export function guardToastrMethods(target, { methods = TOAST_METHODS, handleCall, onSuppressed = () => { }, createResult = () => undefined, } = {}) {
    if (!target || typeof target !== 'object')
        return null;
    const records = [];
    for (const method of new Set(methods)) {
        const descriptor = Object.getOwnPropertyDescriptor(target, method);
        if (descriptor && descriptor.configurable === false)
            continue;
        let underlying = typeof target[method] === 'function' ? target[method] : undefined;
        const guarded = function (...args) {
            if (handleCall) {
                return handleCall({
                    level: method,
                    args,
                    thisArg: this,
                    invokeOriginal: () => typeof underlying === 'function'
                        ? Reflect.apply(underlying, this, args)
                        : undefined,
                });
            }
            onSuppressed({ level: method, args });
            return createResult(method, args);
        };
        try {
            Object.defineProperty(target, method, {
                configurable: true,
                enumerable: descriptor?.enumerable ?? true,
                get: () => guarded,
                set: (value) => {
                    if (value !== guarded)
                        underlying = value;
                },
            });
            records.push({ method, descriptor, getUnderlying: () => underlying });
        }
        catch {
            // CSS 和 DOM 清理层仍会继续生效；这里只跳过不可修改的方法。
        }
    }
    return {
        guardedCount: records.length,
        restore() {
            for (const record of records) {
                const value = record.getUnderlying();
                try {
                    if (record.descriptor && 'value' in record.descriptor) {
                        Object.defineProperty(target, record.method, { ...record.descriptor, value });
                    }
                    else {
                        Object.defineProperty(target, record.method, {
                            configurable: true,
                            enumerable: record.descriptor?.enumerable ?? true,
                            writable: true,
                            value,
                        });
                    }
                }
                catch {
                    try {
                        target[record.method] = value;
                    }
                    catch {
                        // 宿主冻结对象时无法恢复；页面重载会自然还原原生对象。
                    }
                }
            }
        },
    };
}
//# sourceMappingURL=core.js.map