# SillyTavern Toast Blocker

一个同时兼容原生 SillyTavern 与 TauriTavern 的纯前端扩展，可分别屏蔽主界面中由全局 `toastr` 产生的 Success、Info、Warning 与 Error Toast。

## 为什么不是简单覆盖 `toastr`

原生 SillyTavern 会按照 `manifest.json` 的 `loading_order` 从小到大激活扩展；因此本扩展使用 `-100000`，尽量早于普通第三方扩展运行。但 TauriTavern 会先完成主界面并发出 `APP_READY`，之后才延迟激活普通第三方扩展。单纯在扩展入口覆盖 `toastr`，无法可靠覆盖 TauriTavern 的启动阶段。

本扩展采用三层防护：

1. **重启前置规则**：首次运行时，把一段带唯一边界标记的隐藏规则写入酒馆的“自定义 CSS”。下一次启动时，这段规则会早于第三方扩展恢复。
2. **运行时方法守卫**：拦截 `toastr.success/info/warning/error`；后加载脚本重新赋值这些方法时，守卫仍然有效。
3. **DOM 兜底**：按类型移除已有或由旧函数引用新建的 Toast 节点，防止只覆盖全局方法造成漏网。

关闭开关、在扩展管理器禁用扩展，或删除扩展时，都会移除本扩展自己的持久 CSS。用户原有的自定义 CSS 不会被整体覆盖。

## 安装

在 SillyTavern 或 TauriTavern 的“扩展 → 安装扩展”中填入：

```text
https://github.com/qyh9527/SillyTavern-Toast-Blocker
```

安装后重启一次酒馆。首次安装当页会立即屏蔽后续 Toast，但重启后才能覆盖更早的启动阶段。

## 操作面板

扩展设置栏中会出现“Toast 全局屏蔽器”：

- **启用分类屏蔽**：总开关；关闭后立即恢复原生 Toast，并清除持久规则。
- **Success / Info / Warning / Error**：四类可独立勾选，也可一键全部选择或全部取消；更改后立即生效并同步前置 CSS。
- **控制台记录**：只记录被拦截 Toast 的级别与计数，不记录正文。
- **修复早期规则**：重新写入并保存带边界标记的前置 CSS。
- **关闭并清理**：等同于关闭总开关。

也可以在开发者控制台使用：

```js
ToastBlocker.status();
ToastBlocker.enable();
ToastBlocker.disable();
ToastBlocker.repair();
ToastBlocker.setLevel('warning', false);
```

## 兼容性与边界

- 面向 SillyTavern `1.12.13+` 以及采用同一扩展契约的当前 TauriTavern。
- 只处理当前主文档中的全局 `toastr`。跨域 iframe 拥有独立文档和脚本上下文，浏览器安全模型不允许本扩展控制它。
- 本扩展不会吞掉业务异常、网络错误或控制台日志，只移除所选类型的 Toast 视觉通知。屏蔽 Error 或 Warning 可能使重要问题不再显眼，请按需查看开发者控制台。
- 若在不支持生命周期清理 hook 的旧版宿主上直接删除扩展，可在“用户设置 → 自定义 CSS”中删除 `SillyTavern Toast Blocker: managed start/end` 标记之间的区块。

## 设计依据

- [SillyTavern 官方扩展文档](https://docs.sillytavern.app/for-contributors/writing-extensions/)：manifest、加载顺序、设置面板与 lifecycle hooks。
- [SillyTavern 扩展加载器](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions.js)：按 `loading_order` 排序并顺序激活扩展。
- [SillyTavern 自定义 CSS 加载实现](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/power-user.js)：用户 CSS 在设置加载阶段恢复。
- [TauriTavern 第三方扩展兼容说明](https://github.com/Darkatse/TauriTavern/blob/main/docs/CurrentState/ThirdPartyExtensions.md)：第三方扩展在 `APP_READY` 后延迟激活。
- [Toastr 2.1.3 项目](https://github.com/CodeSeven/toastr)：全局 API 与容器行为。

## 开发与测试

TypeScript 源码位于 `src/`，编译产物位于 `dist/`。运行时无第三方依赖：

```bash
npm test
npm run check
```

## 许可证

[MIT](LICENSE)
