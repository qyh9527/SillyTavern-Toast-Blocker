import { type ToastLevel, type ToastBlockerSettings } from './core.js';
import { ToastRuntimeBlocker } from './runtime.js';
import { type TimedConfirmation } from './interaction.js';
interface PublicStatus extends Record<string, unknown> {
    enabled: boolean;
    redrawEnabled: boolean;
    blockedMethods: ToastLevel[];
    guardedMethods: number;
    observingDom: boolean;
    runtimeStyle: boolean;
    earlyRuleInstalled: boolean;
    suppressedThisSession: number;
    settings: ToastBlockerSettings;
}
declare class ToastBlockerHost {
    settings: ToastBlockerSettings;
    preloadPresentAtBoot: boolean;
    suppressedCount: number;
    panel: HTMLElement | null;
    statusText: string;
    bootPromise: Promise<void> | null;
    runtime: ToastRuntimeBlocker;
    refreshConfirmation: TimedConfirmation;
    statusRenderScheduled: boolean;
    statusRenderTimer: ReturnType<typeof setTimeout> | null;
    constructor();
    activate({ forceSave }?: {
        forceSave?: boolean;
    }): Promise<void>;
    install(): Promise<void>;
    enableFromLifecycle(): Promise<void>;
    disableFromLifecycle(): Promise<void>;
    clean(): Promise<void>;
    applyPreference({ forceSave }?: {
        forceSave?: boolean;
    }): Promise<void>;
    setEnabled(enabled: boolean): Promise<void>;
    setLevel(level: ToastLevel, blocked: boolean): Promise<void>;
    setAllLevels(blocked: boolean): Promise<void>;
    setLogging(enabled: boolean): Promise<void>;
    setRedrawEnabled(enabled: boolean): Promise<void>;
    setRedrawMaxVisible(value: unknown): Promise<void>;
    setAggregateDuplicates(enabled: boolean): Promise<void>;
    setDiagnosticsEnabled(enabled: boolean): Promise<void>;
    resetDiagnostics(): void;
    shutdown(): Promise<void>;
    requestFrontendRefresh(button: HTMLButtonElement): Promise<void>;
    resetRefreshButton(): void;
    applyRuntimeSettings(): void;
    persistPreloadCss(enabled: boolean, levels: ToastBlockerSettings['blockedLevels'], hideNativeUntilRedrawReady: boolean, forceSave: boolean): Promise<boolean>;
    forceSave(): Promise<void>;
    mountPanelWhenReady(): Promise<void>;
    renderStatus(): void;
    /** 抽屉合上时跳过诊断数字刷新，只保留轻量的状态行与开关回显。 */
    private isDiagnosticsVisible;
    private paintStatusNow;
    getPublicStatus(): PublicStatus;
}
export declare function installToastBlockerHost(): ToastBlockerHost;
export {};
