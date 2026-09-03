import { type ToastBlockerSettings } from './core.js';
import { ToastRuntimeBlocker } from './runtime.js';
interface PublicStatus extends Record<string, unknown> {
    enabled: boolean;
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
    setLogging(enabled: boolean): Promise<void>;
    persistPreloadCss(enabled: boolean, forceSave: boolean): Promise<boolean>;
    forceSave(): Promise<void>;
    mountPanelWhenReady(): Promise<void>;
    renderStatus(): void;
    getPublicStatus(): PublicStatus;
}
export declare function installToastBlockerHost(): ToastBlockerHost;
export {};
