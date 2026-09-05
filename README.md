# SillyTavern Toast Blocker

一个同时兼容原生 SillyTavern 与 TauriTavern 的 TypeScript 纯前端扩展。它既能分别屏蔽全局 `toastr` 产生的 Success、Info、Warning 与 Error，也能把未屏蔽的通知交给轻量重绘器。

## 安装

> [!IMPORTANT]
> **安装方式**
>
> 在 SillyTavern 或 TauriTavern 的“扩展 → 安装扩展”中粘贴：
>
> ```text
> https://github.com/qyh9527/SillyTavern-Toast-Blocker
> ```
>
> 安装后重启一次酒馆。首次安装当页会立即处理后续 Toast；重启后，前置规则才能覆盖扩展脚本加载前出现的启动通知。

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

重绘器针对通知风暴做了以下约束：同步调用先进入内存队列，以微任务合并同一轮请求，再在 `requestAnimationFrame` 中每帧最多创建 12 个；同一容器使用 `DocumentFragment` 批量写入；最大可见数限制为 1–20；入场、退场与进度条只使用 `transform`/`opacity`，进度由 Web Animations 驱动，不使用高频轮询。1 秒内内容和关键选项相同的重复通知可聚合为一张卡片并显示次数；带独立点击回调的交互通知不会合并。无效自定义挂载目标或内部异常会回退到原生 Toast。

启用重绘器后还会写入一条启动接管规则：扩展脚本加载前先隐藏原生 Toast，接管时移动已有节点到重绘容器，保留其中链接、按钮及事件，然后统一补上整卡点击关闭。若扩展未能启动，隐藏会在 8 秒后自动释放，避免通知永久不可见。

重绘器创建的定时 Toast 使用基于剩余时长与截止时间的计时：页面进入后台、锁屏或 WebView 暂停时冻结，回到前台后继续，避免移动端定时器节流造成通知集中消失或停留过久。

## 操作面板

扩展设置栏中会出现“Toast 屏蔽与重绘器”：

- **启用分类屏蔽**：分类屏蔽总开关；关闭后解除屏蔽。重绘器若仍开启，未屏蔽通知继续重绘，并保留启动接管规则。
- **Success / Info / Warning / Error**：四类可独立选择，也可一键全部选择或全部取消；更改后立即生效并同步前置 CSS。移动端保持紧凑的 2×2 卡片布局，整卡可点；胶囊开关不使用字符勾号，开启时卡片高亮，关闭时灰暗。
- **高性能重绘器**：异步重绘所有未被屏蔽的 Toast；屏蔽选择始终优先。
- **后台计时保护**：重绘 Toast 在页面隐藏时冻结剩余时长，恢复可见后从正确位置继续计时。
- **重复通知聚合**：默认把 1 秒内内容与关键行为相同的通知合并，并以 `×N` 显示累计次数；可独立关闭。
- **诊断概览（默认折叠）**：规则、守卫、兼容方式、队列与全部诊断数字合并在同一个可折叠面板中；打开“本地性能诊断”时自动展开，关闭后自动收回，也可手动切换。
- **本地性能诊断**：统计已重绘、已聚合、队列峰值、后台暂停、批次耗时和可用的页面长帧；数据只保存在当前页面内存，不读取正文、不上传；页面长帧数字按秒节流刷新，避免诊断自己放大卡顿。
- **一键自检并复制报告**：输出插件版本、能力检测、关键设置与统计；剪贴板不可用时展示可手动复制的文本。不包含正文、聊天、密钥、URL 或完整用户 CSS，不自动上传。无需开启性能诊断。
- **点击关闭**：所有重绘或启动阶段接管的 Toast 均可点击卡片关闭；卡片中的链接和按钮仍会先执行自身操作。
- **最大同时显示**：允许 1–20 个，默认 6 个；启动接管通知和新重绘通知共享上限；超过时立即淘汰最早的通知。
- **控制台记录**：只记录被拦截 Toast 的级别与计数，不记录正文。
- **立即刷新前端**：醒目的手动刷新按钮；首次点击仅进入 5 秒确认状态，第二次点击才会保存设置并刷新，超时自动取消。
- **修复早期规则**：重新写入并保存带边界标记的前置 CSS。
- **关闭并清理**：同时关闭屏蔽器和重绘器，清理本插件的持久规则与重绘通知。

也可以在开发者控制台使用：

```js
ToastBlocker.status();
ToastBlocker.selfCheck(); // 返回本地自检报告字符串
ToastBlocker.enable();
ToastBlocker.disable();
ToastBlocker.repair();
ToastBlocker.setLevel('warning', false);
ToastBlocker.redraw(true);
ToastBlocker.aggregate(true);
ToastBlocker.diagnostics(true);
ToastBlocker.resetDiagnostics();
ToastBlocker.shutdown();
```

## v1.4.3 更新内容

- 修复移动端布局工作流失败：浏览器测试从 `manifest.json` 读取真实 CSS/JS 入口，避免继续验证旧版样式。
- 修复主设置抽屉默认展开、展开后状态头落到底部的问题：状态头直接置于 DOM 顶部，不再用 `flex` 和 `order` 干扰宿主折叠。
- 修复通知触发状态刷新时覆盖正在输入的“最大同时显示”数值；提交时仍限制为 1–20 并保存。
- 删除未被使用的宿主静态类型声明和 `dist/*.d.ts`，关闭声明文件输出；运行所需 JS、调试用 source map 和三层样式仍保留。
- 新增真实发布样式下反复折叠、状态头位置和编辑保护的跨浏览器回归，并更新开发文档。

## v1.4.2 更新内容

- 诊断概览与本地性能诊断合并为一个可折叠面板：默认折叠只留标题与健康徽标；打开本地性能诊断自动展开，关闭自动收回，手动点过则以用户选择为准。
- 旧诊断数字区块（已重绘、已聚合、队列峰值、后台暂停、最慢批次、超帧预算）并入诊断概览，面板中只保留一个诊断框。
- 页面长帧突发上百条时改为计数每条入账、界面每秒至多刷新一次的冷却节流，避免诊断显示参与放大卡顿。
- 修复 Windows 本地运行 E2E 静态服务器时因路径分隔符差异全部返回 403 的开发环境问题。

## v1.4.1 更新内容

- 修复宿主 `textarea { display: block }` 覆盖 `hidden` 导致的大空白报告框，增加面板作用域内的强制隐藏规则。
- 在原区域新增可视化诊断概览：规则、方法守卫、宿主适配、当前通知、插件批次耗时与整个页面的长帧分别展示。
- 无耗时样本时显示“暂无批次样本”，不把 `0 ms` 当作零开销测量；页面长帧明确标注不能归因于本插件。
- 采集器只读取启用期间的新性能条目，配置变化复用观察器，清零时丢弃待处理条目，避免历史重复累计。
- 自检报告结构升级为 2；持久设置结构仍为 4，版本号同步至 1.4.1。

## v1.4.0 更新内容

- 新增宿主适配层，优先使用 `SillyTavern.getContext()`；旧宿主与缺少立即保存 API 的宿主保留动态导入回退。
- 新增一键自检报告与剪贴板失败后的手动复制。
- 启动通知纳入可见数量、`clear/remove` 与停用清理，原生自动消失后回收注册表和空容器；保留原 DOM 与事件。
- 修复延迟出现容器时观察器不能及时切换的问题；容器被替换后看门狗重新绑定；后台启动不运行巡检定时器。
- 按抽屉内容实际可见性决定是否更新诊断数字，打开抽屉时触发状态刷新。
- 增加 Chromium/WebKit 的桌面和移动视口 E2E，以及版本一致性、编译产物同步检查。

启动通知的原生闭包计时器仍由宿主拥有，不能冻结其剩余时间；原生回调由宿主触发，插件不额外模拟 `onShown/onHidden`。浏览器模拟测试不等同于 TT 各平台真机测试，验收结果见 [开发文档](docs/development.md)。

## 更新行为

通过扩展管理器成功更新本扩展后，更新钩子会先保存、恢复当前设置，再以零延迟任务刷新前端一次，让新编译代码立即接管页面。刷新调度带有单页去重，不会因同一次更新重复触发。

## 兼容性与边界

- 面向 SillyTavern `1.12.13+` 以及采用同一扩展契约的当前 TauriTavern。TauriTavern 官方列出的 Windows、Linux、Android 与 iOS 均在兼容目标内，macOS 同样适用。
- 不依赖 Node.js、Tauri 私有命令或特定 WebView 全局对象；运行时仅使用浏览器标准 API，并对性能观察能力做特性检测。Windows WebView2、Linux WebKitGTK、iOS/macOS WKWebView 与 Android System WebView 不支持的增强诊断会自动降级，不影响屏蔽与重绘主功能。
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
- [TauriTavern 平台说明](https://github.com/Darkatse/TauriTavern/blob/main/README.en.md)：Windows、macOS、Linux、Android 与 iOS 支持范围。
- [Tauri WebView 版本说明](https://v2.tauri.app/reference/webview-versions/) 与 [进程模型](https://v2.tauri.app/concept/process-model/)：各平台使用的系统 WebView 以及跨平台差异。
- [Toastr 2.1.3 项目](https://github.com/CodeSeven/toastr)：全局 API 与容器行为。
- [MDN：`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) 与 [微任务指南](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)：批处理的调度边界。
- [MDN：Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) 与 [`PerformanceObserver.supportedEntryTypes`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static)：后台计时纠偏和诊断能力检测。
- [web.dev：避免布局抖动](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) 与 [高性能 CSS 动画](https://web.dev/articles/animations-guide)：集中 DOM 写入，并优先使用 `transform`/`opacity`。
- [W3C：`role=status`](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) 与 [W3C：`role=alert`](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19)：通知的无障碍语义。

## 开发与测试

TypeScript 源码位于 `src/`，编译产物位于 `dist/`。修改 TypeScript 后运行构建即可生成 JS，不手工同步两份代码；提交时包含生成的 `dist/`。样式入口为 `style-status.css`，依次导入 `style-compact.css`、`style.css`。运行时无第三方依赖：

```bash
npm ci
npm test
npm run check
npm run check:release
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

详细说明见 [开发文档](docs/development.md) 和 [未来更新建议](docs/roadmap.md)。

## 许可证

[MIT](LICENSE)
