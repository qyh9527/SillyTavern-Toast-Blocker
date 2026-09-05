declare var toastr: Record<string, unknown> | undefined;
declare var jQuery: ((value?: unknown) => unknown) | undefined;
declare var ToastBlocker: {
  enable(): Promise<void>;
  disable(): Promise<void>;
  repair(): Promise<void>;
  redraw(enabled: boolean): Promise<void>;
  setLevel(level: 'success' | 'info' | 'warning' | 'error', blocked: boolean): Promise<void>;
  shutdown(): Promise<void>;
  aggregate(enabled: boolean): Promise<void>;
  diagnostics(enabled: boolean): Promise<void>;
  resetDiagnostics(): void;
  selfCheck(): string;
  status(): Record<string, unknown>;
} | undefined;

declare var SillyTavern: { getContext(): Record<string, unknown> } | undefined;
