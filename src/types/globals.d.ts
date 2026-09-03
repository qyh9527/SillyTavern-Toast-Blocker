declare var toastr: Record<string, unknown> | undefined;
declare var jQuery: (() => unknown) | undefined;
declare var ToastBlocker: {
  enable(): Promise<void>;
  disable(): Promise<void>;
  repair(): Promise<void>;
  status(): Record<string, unknown>;
} | undefined;
