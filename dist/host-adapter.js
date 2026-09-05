const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export async function resolveHostAdapter(getContext = () => globalThis.SillyTavern?.getContext(), load = path => import(path)) {
    let context = {};
    try {
        const value = getContext();
        if (isRecord(value))
            context = value;
    }
    catch {
        // 旧宿主的 context 可能尚未准备好，继续尝试兼容导入。
    }
    let fallbackCount = 0;
    const fallback = async (path) => {
        fallbackCount += 1;
        return load(path);
    };
    const extensionSettings = isRecord(context.extensionSettings)
        ? context.extensionSettings
        : (await fallback('/scripts/extensions.js')).extension_settings;
    const powerUserSettings = isRecord(context.powerUserSettings)
        ? context.powerUserSettings
        : (await fallback('/scripts/power-user.js')).power_user;
    // saveSettingsDebounced 不保证持久化已经完成，刷新前必须等待真正的 saveSettings。
    const script = typeof context.saveSettings === 'function' && typeof context.saveSettingsDebounced === 'function'
        ? {}
        : await fallback('/script.js');
    const save = typeof context.saveSettings === 'function' ? context.saveSettings : script.saveSettings;
    const debounce = typeof context.saveSettingsDebounced === 'function'
        ? context.saveSettingsDebounced : script.saveSettingsDebounced;
    if (!isRecord(extensionSettings) || !isRecord(powerUserSettings) || typeof save !== 'function') {
        throw new Error('宿主未提供可用的设置读写接口，Toast 插件未启动');
    }
    return {
        extensionSettings,
        powerUserSettings: powerUserSettings,
        async saveSettings() { await Reflect.apply(save, context, []); },
        saveSettingsDebounced() {
            if (typeof debounce === 'function')
                Reflect.apply(debounce, context, []);
            else
                void Promise.resolve(Reflect.apply(save, context, [])).catch(() => {
                    console.error('[qyh-toast-blocker] 宿主设置保存失败');
                });
        },
        source: fallbackCount === 0 ? 'context' : fallbackCount === 3 ? 'legacy' : 'mixed',
    };
}
//# sourceMappingURL=host-adapter.js.map