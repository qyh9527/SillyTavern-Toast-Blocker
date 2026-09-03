export const SETTINGS_KEY = 'qyh_toast_blocker';
export const BLOCK_START = '/* SillyTavern Toast Blocker: managed start */';
export const BLOCK_END = '/* SillyTavern Toast Blocker: managed end */';
export const TOAST_METHODS = Object.freeze(['success', 'info', 'warning', 'error']);
export const MANAGED_RULES = `${BLOCK_START}
#toast-container {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
${BLOCK_END}`;
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    logSuppressed: false,
    schemaVersion: 1,
});
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const BLOCK_PATTERN = new RegExp(`(?:\\r?\\n)?${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}(?:\\r?\\n)?`, 'g');
export function normalizeSettings(value) {
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    return {
        enabled: candidate.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(candidate.enabled),
        logSuppressed: Boolean(candidate.logSuppressed),
        schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    };
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
export function updateManagedCss(css, enabled) {
    const clean = stripManagedCss(css);
    return enabled ? `${clean}\n${MANAGED_RULES}\n` : clean;
}
export function guardToastrMethods(target, { onSuppressed = () => { }, createResult = () => undefined } = {}) {
    if (!target || typeof target !== 'object')
        return null;
    const records = [];
    for (const method of TOAST_METHODS) {
        const descriptor = Object.getOwnPropertyDescriptor(target, method);
        if (descriptor && descriptor.configurable === false)
            continue;
        let underlying = typeof target[method] === 'function' ? target[method] : undefined;
        const guarded = function (...args) {
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