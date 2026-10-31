export type AppUpdateStatus = "idle" | "checking" | "not-available" | "available" | "downloading" | "downloaded" | "installing" | "error" | "disabled";

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  version?: string;
  progress?: number;
  error?: string;
}

export interface AppUpdateResult {
  ok: boolean;
  error?: string;
}
