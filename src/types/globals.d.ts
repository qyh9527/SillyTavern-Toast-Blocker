declare var toastr: Record<string, unknown> | undefined;
declare var jQuery: ((value?: unknown) => unknown) | undefined;
declare var ToastBlocker: {
  enable(): Promise<void>;
  disable(): Promise<void>;
  repair(): Promise<void>;
  redraw(enabled: boolean): Promise<void>;
  setLevel(level: 'success' | 'info' | 'warning' | 'error', blocked: boolean): Promise<void>;
  shutdown(): Promise<void>;
  status(): Record<string, unknown>;
} | undefined;
