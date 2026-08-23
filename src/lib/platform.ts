/** Future desktop contracts only; there are deliberately no hardware calls here. */
export interface MachineIdentityProvider {
  getMachineId(): Promise<string>;
}

export interface LicensePayload {
  customer: string;
  machineId: string;
  product: "academy-hub";
  edition: string;
  issuedAt: string;
  expiresAt: string | null;
  allowedMajorVersion: number;
}

export interface SignedLicenseVerifier {
  /** Verifies with an embedded public key. A private signing key never belongs in the app. */
  verify(signedLicense: string, machineId: string): Promise<LicensePayload>;
}

export interface DesktopBackupProvider {
  createBackup(): Promise<string>;
  restoreBackup(path: string): Promise<void>;
}

export interface UpdateProvider {
  checkAtStartup(): Promise<{ version: string; available: boolean }>;
}

export interface DesktopPlatformServices {
  machineIdentity: MachineIdentityProvider;
  licenseVerifier: SignedLicenseVerifier;
  backup: DesktopBackupProvider;
  updates: UpdateProvider;
}
