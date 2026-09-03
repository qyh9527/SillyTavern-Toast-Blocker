export const SETTINGS_KEY = 'qyh_toast_blocker';
export const BLOCK_START = '/* SillyTavern Toast Blocker: managed start */';
export const BLOCK_END = '/* SillyTavern Toast Blocker: managed end */';
export const TOAST_METHODS = Object.freeze(['success', 'info', 'warning', 'error'] as const);
export type ToastLevel = (typeof TOAST_METHODS)[number];
export type BlockedToastLevels = Record<ToastLevel, boolean>;

export interface ToastBlockerSettings {
  enabled: boolean;
  blockedLevels: BlockedToastLevels;
  logSuppressed: boolean;
  schemaVersion: 2;
}

export interface SuppressedToast {
  level: ToastLevel;
  args: unknown[];
}

export const DEFAULT_BLOCKED_LEVELS: Readonly<BlockedToastLevels> = Object.freeze({
  success: true,
  info: true,
  warning: true,
  error: true,
});

const DEFAULT_SETTINGS: Readonly<ToastBlockerSettings> = Object.freeze({
  enabled: true,
  blockedLevels: DEFAULT_BLOCKED_LEVELS as BlockedToastLevels,
  logSuppressed: false,
  schemaVersion: 2,
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_PATTERN = new RegExp(
  `(?:\\r?\\n)?${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}(?:\\r?\\n)?`,
  'g',
);

export function normalizeSettings(value: unknown): ToastBlockerSettings {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<ToastBlockerSettings>
    : {};
  const levels = candidate.blockedLevels && typeof candidate.blockedLevels === 'object'
    ? candidate.blockedLevels as Partial<BlockedToastLevels>
    : {};
  return {
    enabled: candidate.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(candidate.enabled),
    blockedLevels: {
      success: levels.success === undefined ? true : Boolean(levels.success),
      info: levels.info === undefined ? true : Boolean(levels.info),
      warning: levels.warning === undefined ? true : Boolean(levels.warning),
      error: levels.error === undefined ? true : Boolean(levels.error),
    },
    logSuppressed: Boolean(candidate.logSuppressed),
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
  };
}

export function getBlockedMethods(levels: BlockedToastLevels): ToastLevel[] {
  return TOAST_METHODS.filter(level => levels[level]);
}

export function buildManagedRules(levels: BlockedToastLevels): string {
  const blocked = getBlockedMethods(levels);
  if (blocked.length === 0) return '';
  const selectors = blocked.length === TOAST_METHODS.length
    ? '#toast-container'
    : blocked.map(level => `#toast-container > .toast-${level}`).join(',\n');
  return `${BLOCK_START}
${selectors} {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
${BLOCK_END}`;
}

export function hasManagedCss(css: unknown): boolean {
  const text = typeof css === 'string' ? css : '';
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END, Math.max(0, start));
  return start >= 0 && end > start;
}

export function stripManagedCss(css: unknown): string {
  return (typeof css === 'string' ? css : '').replace(BLOCK_PATTERN, '');
}

export function updateManagedCss(
  css: unknown,
  enabled: boolean,
  levels: BlockedToastLevels = { ...DEFAULT_BLOCKED_LEVELS },
): string {
  const clean = stripManagedCss(css);
  const rules = enabled ? buildManagedRules(levels) : '';
  return rules ? `${clean}\n${rules}\n` : clean;
}

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
  onSuppressed?: (toast: SuppressedToast) => void;
  createResult?: (level: ToastLevel, args: unknown[]) => unknown;
}

interface GuardRecord {
  method: ToastLevel;
  descriptor: PropertyDescriptor | undefined;
  getUnderlying: () => unknown;
}

export function guardToastrMethods(
  target: Record<string, unknown> | null | undefined,
  {
    methods = TOAST_METHODS,
    onSuppressed = () => {},
    createResult = () => undefined,
  }: GuardOptions = {},
): ToastrGuard | null {
  if (!target || typeof target !== 'object') return null;

  const records: GuardRecord[] = [];
  for (const method of new Set(methods)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    if (descriptor && descriptor.configurable === false) continue;

    let underlying: unknown = typeof target[method] === 'function' ? target[method] : undefined;
    const guarded = function (...args: unknown[]) {
      onSuppressed({ level: method, args });
      return createResult(method, args);
    };

    try {
      Object.defineProperty(target, method, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: () => guarded,
        set: (value: unknown) => {
          if (value !== guarded) underlying = value;
        },
      });
      records.push({ method, descriptor, getUnderlying: () => underlying });
    } catch {
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
          } else {
            Object.defineProperty(target, record.method, {
              configurable: true,
              enumerable: record.descriptor?.enumerable ?? true,
              writable: true,
              value,
            });
          }
        } catch {
          try {
            target[record.method] = value;
          } catch {
            // 宿主冻结对象时无法恢复；页面重载会自然还原原生对象。
          }
        }
      }
    },
  };
}
