export type ThemePreference = "system" | "light" | "dark";

export type ToastSeverity = "success" | "error" | "warning" | "info";

export type ToastRequest = {
  message: string;
  severity: ToastSeverity;
};

export type ConfirmTone = "danger" | "warn";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};
