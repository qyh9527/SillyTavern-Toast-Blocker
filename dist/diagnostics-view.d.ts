import type { RuntimeStatus } from './runtime.js';
export interface DiagnosticStatus extends RuntimeStatus {
    settings: unknown;
    earlyRuleInstalled: boolean;
}
/** 纯展示模型；页面长帧不参与插件健康状态判断。 */
export declare function buildDiagnosticView(status: DiagnosticStatus, source: string): {
    tone: string;
    summary: string;
    early: string;
    guards: string;
    adapter: string;
    active: string;
    queue: string;
    batch: string;
    batchNote: string;
    page: string;
    pageNote: string;
    collection: string;
    rendered: string;
    aggregated: string;
    pendingPeak: string;
    visibilityPauses: string;
    maxBatch: string;
    overBudget: string;
    budget: number;
    samples: number;
};
export declare const DIAGNOSTIC_OVERVIEW_HTML = "\n  <section class=\"qyh-toast-plugin-status\" aria-label=\"\u63D2\u4EF6\u72B6\u6001\">\n    <div class=\"qyh-toast-plugin-status__identity\">\n      <strong>Toast \u5C4F\u853D\u4E0E\u91CD\u7ED8\u5668</strong>\n      <span class=\"qyh-toast-plugin-version\">v1.4.2</span>\n    </div>\n    <span data-health=\"summary\" class=\"qyh-toast-health-badge qyh-toast-plugin-health\"></span>\n  </section>\n  <section class=\"qyh-toast-overview\" aria-label=\"\u53EF\u89C6\u5316\u8BCA\u65AD\u6982\u89C8\">\n    <button class=\"qyh-toast-overview-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"qyh-toast-overview-body\">\n      <strong>\u8BCA\u65AD\u6982\u89C8</strong>\n      <span data-health=\"summary\" class=\"qyh-toast-health-badge\"></span>\n      <i class=\"fa-solid fa-circle-chevron-down\" aria-hidden=\"true\"></i>\n    </button>\n    <div class=\"qyh-toast-overview-body\" id=\"qyh-toast-overview-body\" hidden>\n      <div class=\"qyh-toast-health-checks\">\n        <div><span>\u65E9\u671F\u89C4\u5219</span><strong data-health=\"early\"></strong></div>\n        <div><span>\u65B9\u6CD5\u5B88\u536B</span><strong data-health=\"guards\"></strong></div>\n        <div><span>\u5BBF\u4E3B\u63A5\u53E3</span><strong data-health=\"adapter\"></strong></div>\n      </div>\n      <div class=\"qyh-toast-overview-grid\">\n        <article><small>\u5F53\u524D\u901A\u77E5</small><strong data-health=\"active\"></strong><span data-health=\"queue\"></span></article>\n        <article><small>\u63D2\u4EF6\u91CD\u7ED8 \u00B7 \u5E73\u5747\u6279\u6B21</small><strong data-health=\"batch\"></strong><span data-health=\"batchNote\"></span>\n          <div class=\"qyh-toast-budget\" aria-hidden=\"true\"><span data-health-budget></span></div>\n          <small>\u6761\u5F62\u4EC5\u5BF9\u7167 16.7 ms \u53C2\u8003\u9884\u7B97</small>\n        </article>\n        <article class=\"qyh-toast-page-observation\"><small>\u6574\u4E2A\u9875\u9762 \u00B7 \u957F\u5E27 / \u957F\u4EFB\u52A1</small><strong data-health=\"page\"></strong><span data-health=\"pageNote\"></span>\n          <p>\u5305\u542B\u9152\u9986\u3001\u4E3B\u9898\u4E0E\u5176\u4ED6\u6269\u5C55\uFF0C\u4E0D\u80FD\u636E\u6B64\u5F52\u56E0\u4E8E\u672C\u63D2\u4EF6\u3002</p>\n        </article>\n      </div>\n      <div class=\"qyh-toast-overview-grid\">\n        <article><small>\u5DF2\u91CD\u7ED8</small><strong data-health=\"rendered\"></strong></article>\n        <article><small>\u5DF2\u805A\u5408</small><strong data-health=\"aggregated\"></strong></article>\n        <article><small>\u961F\u5217\u5CF0\u503C</small><strong data-health=\"pendingPeak\"></strong></article>\n        <article><small>\u540E\u53F0\u6682\u505C</small><strong data-health=\"visibilityPauses\"></strong></article>\n        <article><small>\u6700\u6162\u6279\u6B21</small><strong data-health=\"maxBatch\"></strong></article>\n        <article><small>\u8D85\u5E27\u9884\u7B97</small><strong data-health=\"overBudget\"></strong></article>\n        <button id=\"qyh-toast-blocker-diagnostics-reset\" class=\"menu_button\" type=\"button\">\u6E05\u7A7A\u8BCA\u65AD\u7EDF\u8BA1</button>\n      </div>\n      <p class=\"qyh-toast-blocker-help\" data-health=\"collection\"></p>\n      <p class=\"qyh-toast-blocker-help\">\u8FD9\u662F\u72B6\u6001\u6982\u89C8\uFF0C\u4E0D\u4EE3\u8868\u5DF2\u9A8C\u8BC1\u6240\u6709\u8BBE\u5907\u3002\u539F\u751F\u542F\u52A8\u901A\u77E5\u4ECD\u4F7F\u7528\u5BBF\u4E3B\u8BA1\u65F6\u5668\u3002</p>\n    </div>\n  </section>";
export declare function paintDiagnosticView(panel: HTMLElement, status: DiagnosticStatus, source: string): void;
