import { normalizeSettings, REDRAW_READY_CLASS } from './core.js';
import { VERSION } from './version.js';

/** 只输出白名单字段，不序列化宿主上下文、完整 UA、自定义 CSS 或通知内容。 */
export function createSelfCheckReport(status: Record<string, unknown>, source: string): string {
  const redraw = status.redraw as Record<string, unknown> | undefined;
  const capabilities = {
    mutationObserver: typeof globalThis.MutationObserver === 'function',
    animationFrame: typeof globalThis.requestAnimationFrame === 'function',
    webAnimations: typeof globalThis.Element?.prototype.animate === 'function',
    clipboard: typeof globalThis.navigator?.clipboard?.writeText === 'function',
    visibility: typeof globalThis.document?.visibilityState === 'string',
    longAnimationFrame: globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame') ?? false,
    longTask: globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask') ?? false,
    colorMix: globalThis.CSS?.supports?.('color', 'color-mix(in srgb, red, blue)') ?? false,
    dynamicViewport: globalThis.CSS?.supports?.('height', '100dvh') ?? false,
  };
  const settings = normalizeSettings(status.settings);
  const issues: string[] = [];
  const expectedGuards = settings.redrawEnabled ? 4 : settings.enabled
    ? Object.values(settings.blockedLevels).filter(Boolean).length : 0;
  const expectedRule = expectedGuards > 0;
  if (expectedRule && !status.earlyRuleInstalled) issues.push('早期规则缺失：请点击“修复早期规则”并重启前端。');
  if (Number(status.guardedMethods) < expectedGuards) issues.push('方法守卫数量不足：宿主或其他插件可能替换了 Toastr。');
  if (settings.enabled && Object.values(settings.blockedLevels).some(Boolean) && !status.runtimeStyle) {
    issues.push('运行时屏蔽样式缺失。');
  }
  if (settings.redrawEnabled && settings.enabled && Object.values(settings.blockedLevels).every(Boolean)) {
    issues.push('四类全部屏蔽，重绘器不会显示通知；这是当前配置的正常行为。');
  }
  const counters: Record<string, number | boolean | string | null> = {};
  for (const key of ['active', 'adoptedActive', 'pending', 'rendered', 'evicted', 'fallbacks', 'aggregated',
    'pendingPeak', 'visibilityPauses', 'pausedForVisibility', 'frameSamples', 'averageBatchMs',
    'maxBatchMs', 'overBudgetBatches', 'observedLongFrames', 'maxObservedLongFrameMs']) {
    const value = redraw?.[key];
    counters[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return JSON.stringify({
    plugin: 'SillyTavern Toast Blocker', version: VERSION, reportSchema: 1,
    hostAdapter: source, capabilities, settings,
    runtime: {
      earlyRuleInstalled: Boolean(status.earlyRuleInstalled),
      runtimeStyle: Boolean(status.runtimeStyle),
      guardedMethods: Number(status.guardedMethods) || 0,
      auxiliaryMethods: Number(status.auxiliaryMethods) || 0,
      observingDom: Boolean(status.observingDom),
      redrawReady: globalThis.document?.documentElement?.classList.contains(REDRAW_READY_CLASS) ?? false,
      ...counters,
    },
    findings: issues.length ? issues : ['当前检查项未发现异常；这不代表已经通过真机兼容测试。'],
    limitations: ['启动期原生通知保留宿主计时器，不支持剩余时间冻结。', '报告不包含通知正文、聊天、密钥、URL 或用户自定义 CSS；不会自动上传。'],
  }, null, 2);
}

export async function copyReport(report: string): Promise<boolean> {
  try {
    if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') return false;
    await globalThis.navigator.clipboard.writeText(report);
    return true;
  } catch {
    return false;
  }
}
