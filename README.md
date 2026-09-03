# SillyTavern Toast Blocker

一个同时兼容原生 SillyTavern 与 TauriTavern 的 TypeScript 纯前端扩展。它既能分别屏蔽全局 `toastr` 产生的 Success、Info、Warning 与 Error，也能把未屏蔽的通知交给轻量重绘器。

## 为什么不是简单覆盖 `toastr`

原生 SillyTavern 会按照 `manifest.json` 的 `loading_order` 从小到大激活扩展；因此本扩展使用 `-100000`，尽量早于普通第三方扩展运行。但 TauriTavern 会先完成主界面并发出 `APP_READY`，之后才延迟激活普通第三方扩展。单纯在扩展入口覆盖 `toastr`，无法可靠覆盖 TauriTavern 的启动阶段。

屏蔽器采用三层防护：

1. **重启前置规则**：首次运行时，把一段带唯一边界标记的隐藏规则写入酒馆的“自定义 CSS”。下一次启动时，这段规则会早于第三方扩展恢复。
2. **运行时方法守卫**：拦截 `toastr.success/info/warning/error`；后加载脚本重新赋值这些方法时，守卫仍然有效。
3. **DOM 兜底**：按类型移除已有或由旧函数引用新建的 Toast 节点，防止只覆盖全局方法造成漏网。

关闭开关、在扩展管理器禁用扩展，或删除扩展时，都会移除本扩展自己的持久 CSS。用户原有的自定义 CSS 不会被整体覆盖。

## 屏蔽器与重绘器如何共存

两者不互斥，处理顺序固定：

1. 如果 Toast 类型已勾选屏蔽，直接拦截，不创建任何 DOM。
2. 如果该类型未被屏蔽且重绘器已启用，使用轻量通知重绘。
3. 如果两者都不处理，调用宿主当前的原生 `toastr` 实现。

因此，默认四类全部屏蔽时，即使打开重绘器也不会显示 Toast。请取消勾选希望重绘的类型。

重绘器针对通知风暴做了以下约束：同步调用先进入内存队列，以微任务合并同一轮请求，再在 `requestAnimationFrame` 中每帧最多创建 12 个；同一容器使用 `DocumentFragment` 批量写入；最大可见数限制为 1–20；入场、退场与进度条只使用 `transform`/`opacity`，进度由 Web Animations 驱动，不使用高频轮询。无效自定义挂载目标或内部异常会回退到原生 Toast。

启用重绘器后还会写入一条启动接管规则：扩展脚本加载前先隐藏原生 Toast，接管时移动已有节点到重绘容器，保留其中链接、按钮及事件，然后统一补上整卡点击关闭。若扩展未能启动，隐藏会在 8 秒后自动释放，避免通知永久不可见。

## 安装

在 SillyTavern 或 TauriTavern 的“扩展 → 安装扩展”中填入：

```text
https://github.com/qyh9527/SillyTavern-Toast-Blocker
```

安装后重启一次酒馆。首次安装当页会立即屏蔽后续 Toast，但重启后才能覆盖更早的启动阶段。

## 操作面板

扩展设置栏中会出现“Toast 屏蔽与重绘器”：

- **启用分类屏蔽**：总开关；关闭后立即恢复原生 Toast，并清除持久规则。
- **Success / Info / Warning / Error**：四类可独立勾选，也可一键全部选择或全部取消；更改后立即生效并同步前置 CSS。移动端保持紧凑的 2×2 卡片布局，整卡可点，并提供清晰的选中态与键盘焦点。
- **高性能重绘器**：异步重绘所有未被屏蔽的 Toast；屏蔽选择始终优先。
- **点击关闭**：所有重绘或启动阶段接管的 Toast 均可点击卡片关闭；卡片中的链接和按钮仍会先执行自身操作。
- **最大同时显示**：允许 1–20 个，默认 6 个；超过上限立即淘汰最早的重绘 Toast。
- **控制台记录**：只记录被拦截 Toast 的级别与计数，不记录正文。
- **立即刷新前端**：醒目的手动刷新按钮；首次点击仅进入 5 秒确认状态，第二次点击才会保存设置并刷新，超时自动取消。
- **修复早期规则**：重新写入并保存带边界标记的前置 CSS。
- **关闭并清理**：等同于关闭总开关。

也可以在开发者控制台使用：

```js
ToastBlocker.status();
ToastBlocker.enable();
ToastBlocker.disable();
ToastBlocker.repair();
ToastBlocker.setLevel('warning', false);
ToastBlocker.redraw(true);
ToastBlocker.shutdown();
```

## 更新行为

通过扩展管理器成功更新本扩展后，更新钩子会先保存、恢复当前设置，再以零延迟任务刷新前端一次，让新编译代码立即接管页面。刷新调度带有单页去重，不会因同一次更新重复触发。

## 兼容性与边界

- 面向 SillyTavern `1.12.13+` 以及采用同一扩展契约的当前 TauriTavern。
- 只处理当前主文档中的全局 `toastr`。跨域 iframe 拥有独立文档和脚本上下文，浏览器安全模型不允许本扩展控制它。
- 本扩展不会吞掉业务异常、网络错误或控制台日志，只移除所选类型的 Toast 视觉通知。屏蔽 Error 或 Warning 可能使重要问题不再显眼，请按需查看开发者控制台。
- 重绘器保留 Toastr 常用的标题、正文、类型、关闭按钮、点击/悬停、超时、进度条、回调、位置、RTL、`clear/remove` 等契约；极少见的第三方自定义 DOM 模板或直接操作原生 `#toast-container` 的代码不保证完全等价。
- Success/Info 使用 `role="status"`，Warning/Error 使用 `role="alert"`；系统偏好“减少动态效果”时会把进出动画缩短到 1ms。
- 若在不支持生命周期清理 hook 的旧版宿主上直接删除扩展，可在“用户设置 → 自定义 CSS”中删除 `SillyTavern Toast Blocker: managed start/end` 标记之间的区块。

## 设计依据

- [SillyTavern 官方扩展文档](https://docs.sillytavern.app/for-contributors/writing-extensions/)：manifest、加载顺序、设置面板与 lifecycle hooks。
- [SillyTavern 扩展加载器](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions.js)：按 `loading_order` 排序并顺序激活扩展。
- [SillyTavern 自定义 CSS 加载实现](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/power-user.js)：用户 CSS 在设置加载阶段恢复。
- [TauriTavern 第三方扩展兼容说明](https://github.com/Darkatse/TauriTavern/blob/main/docs/CurrentState/ThirdPartyExtensions.md)：第三方扩展在 `APP_READY` 后延迟激活。
- [Toastr 2.1.3 项目](https://github.com/CodeSeven/toastr)：全局 API 与容器行为。
- [MDN：`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) 与 [微任务指南](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)：批处理的调度边界。
- [web.dev：避免布局抖动](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) 与 [高性能 CSS 动画](https://web.dev/articles/animations-guide)：集中 DOM 写入，并优先使用 `transform`/`opacity`。
- [W3C：`role=status`](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) 与 [W3C：`role=alert`](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19)：通知的无障碍语义。

## 开发与测试

TypeScript 源码位于 `src/`，编译产物位于 `dist/`。运行时无第三方依赖：

```bash
npm test
npm run check
```

## 许可证

[MIT](LICENSE)
