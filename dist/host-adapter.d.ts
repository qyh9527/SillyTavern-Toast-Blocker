/** 宿主内部路径仅允许出现在本模块；普通启动优先使用公开 context。 */
export interface HostAdapter {
    extensionSettings: Record<string, unknown>;
    powerUserSettings: {
        custom_css?: string;
    } & Record<string, unknown>;
    saveSettings(): Promise<void>;
    saveSettingsDebounced(): void;
    source: 'context' | 'mixed' | 'legacy';
}
type ModuleLoader = (path: string) => Promise<Record<string, unknown>>;
export declare function resolveHostAdapter(getContext?: () => Record<string, unknown> | undefined, load?: ModuleLoader): Promise<HostAdapter>;
export {};
