/** 只输出白名单字段，不序列化宿主上下文、完整 UA、自定义 CSS 或通知内容。 */
export declare function createSelfCheckReport(status: Record<string, unknown>, source: string): string;
export declare function copyReport(report: string): Promise<boolean>;
