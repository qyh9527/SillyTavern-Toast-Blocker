declare var toastr: Record<string, unknown> | undefined;
declare var jQuery: (() => unknown) | undefined;
declare var ToastBlocker: {
  enable(): Promise<void>;
  disable(): Promise<void>;
  repair(): Promise<void>;
  setLevel(level: 'success' | 'info' | 'warning' | 'error', blocked: boolean): Promise<void>;
  status(): Record<string, unknown>;
} | undefined;
