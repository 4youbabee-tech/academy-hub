import type { DB } from "./lib/types";
import type { PageRequest, PageResult } from "./lib/data-access";

interface DesktopLicensePayload {
  customer: string;
  machineId: string;
  product: "academy-hub";
  edition: string;
  issuedAt: string;
  expiresAt: string | null;
  allowedMajorVersion: number;
}

interface DesktopLicenseStatus {
  valid: boolean;
  state: string;
  message: string;
  machineId: string;
  license: DesktopLicensePayload | null;
}

interface AcademyDesktopApi {
  platform: "desktop";
  database: {
    load(): Promise<DB | undefined>;
    save(snapshot: unknown): Promise<{ saved: boolean }>;
    getPage<T>(collection: string, request: PageRequest): Promise<PageResult<T>>;
  };
  license: {
    getStatus(): Promise<DesktopLicenseStatus>;
    importFile(): Promise<{ cancelled: boolean; status: DesktopLicenseStatus }>;
    copyMachineId(): Promise<{ copied: boolean }>;
  };
  backup: {
    create(request: { passphrase: string }): Promise<{ cancelled: boolean; path?: string }>;
    restore(request: { passphrase: string }): Promise<{ cancelled: boolean; restarting?: boolean; safetyBackup?: string }>;
  };
  print: {
    html(request: {
      html: string;
      pageSize?: "A4" | "A5";
    }): Promise<{ printed: boolean; cancelled: boolean; failureReason?: string }>;
  };
  app: {
    getInfo(): Promise<{ name: string; version: string; packaged: boolean }>;
    checkForUpdates(): Promise<{
      configured: boolean;
      available: boolean;
      currentVersion: string;
      latestVersion?: string;
      message: string;
    }>;
    onPrepareClose(callback: () => void): () => void;
    confirmClose(result: { ok: boolean; error?: string }): Promise<{ accepted: boolean }>;
    quit(): Promise<{ quitting: boolean }>;
  };
}

declare global {
  interface Window {
    academyDesktop?: AcademyDesktopApi;
  }
}

export {};
