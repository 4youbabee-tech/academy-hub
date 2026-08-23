import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const PRODUCT = "academy-hub";
const FORMAT_VERSION = 1;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function normalizeHardwareValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!normalized) return "";
  if (/^(UNKNOWN|DEFAULT STRING|TO BE FILLED|TO BE FILLED BY O\.E\.M\.|NONE|N\/A)$/i.test(normalized)) {
    return "";
  }
  if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(normalized)) return "";
  return normalized;
}

async function runHardwareCommand(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: 7_000,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    return String(stdout ?? "");
  } catch {
    return "";
  }
}

async function windowsHardwareParts() {
  const parts = [];
  const registry = await runHardwareCommand("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
    "/v",
    "MachineGuid",
  ]);
  const machineGuid = normalizeHardwareValue(
    registry.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i)?.[1],
  );
  if (machineGuid) parts.push(`machine-guid:${machineGuid}`);

  const powershell = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$system=(Get-CimInstance Win32_ComputerSystemProduct).UUID;",
    "$board=(Get-CimInstance Win32_BaseBoard).SerialNumber;",
    "Write-Output $system; Write-Output $board;",
  ].join("");
  const cim = await runHardwareCommand("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    powershell,
  ]);
  const [systemUuid, boardSerial] = cim.split(/\r?\n/).map(normalizeHardwareValue).filter(Boolean);
  if (systemUuid) parts.push(`system-uuid:${systemUuid}`);
  if (boardSerial) parts.push(`board:${boardSerial}`);
  return parts;
}

async function portableMachinePart() {
  if (process.platform === "win32") return [];
  try {
    const machineId = normalizeHardwareValue(await readFile("/etc/machine-id", "utf8"));
    return machineId ? [`machine-id:${machineId}`] : [];
  } catch {
    return [];
  }
}

export async function calculateMachineId() {
  const hardwareParts = process.platform === "win32"
    ? await windowsHardwareParts()
    : await portableMachinePart();
  const fallbackParts = [
    `platform:${process.platform}`,
    `arch:${process.arch}`,
    `host:${normalizeHardwareValue(os.hostname())}`,
  ];
  const source = ["academy-hub-machine-v1", ...(hardwareParts.length ? hardwareParts : fallbackParts)]
    .sort()
    .join("|");
  const digest = createHash("sha256").update(source, "utf8").digest("hex").toUpperCase();
  return `AH-${digest.match(/.{1,8}/g).slice(0, 4).join("-")}`;
}

function invalidStatus(machineId, state, message) {
  return { valid: false, state, message, machineId, license: null };
}

export function verifyLicenseDocument(rawDocument, machineId, publicKeyPem, appVersion) {
  let document;
  try {
    document = typeof rawDocument === "string" ? JSON.parse(rawDocument) : rawDocument;
  } catch {
    return invalidStatus(machineId, "invalid", "ملف الترخيص غير صالح أو تالف.");
  }

  if (
    !document ||
    document.format !== FORMAT_VERSION ||
    !document.payload ||
    typeof document.payload !== "object" ||
    typeof document.signature !== "string"
  ) {
    return invalidStatus(machineId, "invalid", "صيغة ملف الترخيص غير معروفة.");
  }

  const payload = document.payload;
  const requiredStrings = ["customer", "machineId", "product", "edition", "issuedAt"];
  if (
    requiredStrings.some((key) => typeof payload[key] !== "string" || !payload[key].trim()) ||
    typeof payload.allowedMajorVersion !== "number" ||
    !(payload.expiresAt === null || typeof payload.expiresAt === "string")
  ) {
    return invalidStatus(machineId, "invalid", "بيانات الترخيص ناقصة.");
  }

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signature = Buffer.from(document.signature, "base64");
    const verified = verifySignature(
      null,
      Buffer.from(canonicalJson(payload), "utf8"),
      publicKey,
      signature,
    );
    if (!verified) return invalidStatus(machineId, "invalid", "التوقيع الرقمي للترخيص غير صحيح.");
  } catch {
    return invalidStatus(machineId, "invalid", "تعذر التحقق من التوقيع الرقمي للترخيص.");
  }

  if (payload.product !== PRODUCT) {
    return invalidStatus(machineId, "invalid", "هذا الترخيص مخصص لمنتج آخر.");
  }
  if (payload.machineId.trim().toUpperCase() !== machineId.toUpperCase()) {
    return invalidStatus(machineId, "machine_mismatch", "الترخيص لا يطابق هذا الجهاز.");
  }

  const currentMajor = Number.parseInt(String(appVersion).split(".")[0] ?? "0", 10);
  if (!Number.isFinite(currentMajor) || currentMajor > payload.allowedMajorVersion) {
    return invalidStatus(machineId, "version_mismatch", "الترخيص لا يغطي هذا الإصدار الرئيسي من البرنامج.");
  }

  if (payload.expiresAt) {
    const expiry = Date.parse(payload.expiresAt);
    if (!Number.isFinite(expiry)) {
      return invalidStatus(machineId, "invalid", "تاريخ انتهاء الترخيص غير صالح.");
    }
    if (Date.now() > expiry) {
      return invalidStatus(machineId, "expired", "انتهت صلاحية هذا الترخيص.");
    }
  }

  return {
    valid: true,
    state: "valid",
    message: "الترخيص صالح.",
    machineId,
    license: {
      customer: payload.customer,
      machineId: payload.machineId,
      product: payload.product,
      edition: payload.edition,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      allowedMajorVersion: payload.allowedMajorVersion,
    },
  };
}

export class LicenseManager {
  static async create(options) {
    const manager = new LicenseManager(options);
    await manager.initialize();
    return manager;
  }

  constructor({
    licensePath,
    publicKeyPath,
    machineCachePath = null,
    protectMachineId = null,
    unprotectMachineId = null,
    appVersion,
    developmentBypass = false,
  }) {
    this.licensePath = licensePath;
    this.publicKeyPath = publicKeyPath;
    this.machineCachePath = machineCachePath;
    this.protectMachineId = protectMachineId;
    this.unprotectMachineId = unprotectMachineId;
    this.appVersion = appVersion;
    this.developmentBypass = developmentBypass;
    this.machineId = null;
    this.publicKeyPem = null;
    this.status = null;
  }

  async resolveMachineId() {
    if (this.machineCachePath && this.unprotectMachineId) {
      try {
        const encrypted = await readFile(this.machineCachePath);
        const cached = String(this.unprotectMachineId(encrypted)).trim().toUpperCase();
        if (/^AH-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/.test(cached)) return cached;
      } catch {
        // A cache copied from another Windows installation cannot be decrypted.
      }
    }

    const calculated = await calculateMachineId();
    if (this.machineCachePath && this.protectMachineId) {
      try {
        await mkdir(path.dirname(this.machineCachePath), { recursive: true });
        await writeFile(this.machineCachePath, this.protectMachineId(calculated), { mode: 0o600 });
      } catch {
        // Hardware calculation still works when protected caching is unavailable.
      }
    }
    return calculated;
  }

  async initialize() {
    this.machineId = await this.resolveMachineId();
    this.publicKeyPem = await readFile(this.publicKeyPath, "utf8");
    await this.refresh();
  }

  async refresh() {
    if (this.developmentBypass) {
      this.status = {
        valid: true,
        state: "development",
        message: "Development license bypass.",
        machineId: this.machineId,
        license: {
          customer: "Academy Hub Development",
          machineId: this.machineId,
          product: PRODUCT,
          edition: "development",
          issuedAt: new Date().toISOString(),
          expiresAt: null,
          allowedMajorVersion: Number.parseInt(this.appVersion.split(".")[0] ?? "1", 10),
        },
      };
      return this.status;
    }

    try {
      const raw = await readFile(this.licensePath, "utf8");
      this.status = verifyLicenseDocument(raw, this.machineId, this.publicKeyPem, this.appVersion);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        this.status = invalidStatus(this.machineId, "missing", "لم يتم تفعيل البرنامج على هذا الجهاز بعد.");
      } else {
        this.status = invalidStatus(this.machineId, "invalid", "تعذر قراءة ملف الترخيص.");
      }
    }
    return this.status;
  }

  getStatus() {
    if (!this.status) return invalidStatus(this.machineId ?? "", "invalid", "الترخيص غير جاهز.");
    if (this.status.valid && this.status.license?.expiresAt) {
      const expiry = Date.parse(this.status.license.expiresAt);
      if (Number.isFinite(expiry) && Date.now() > expiry) {
        this.status = invalidStatus(this.machineId, "expired", "انتهت صلاحية هذا الترخيص.");
      }
    }
    return structuredClone(this.status);
  }

  isValid() {
    return this.getStatus().valid;
  }

  assertValid() {
    if (!this.isValid()) throw new Error("يجب تفعيل Academy Hub قبل استخدام قاعدة البيانات.");
  }

  async importFrom(sourcePath) {
    const info = await stat(sourcePath);
    if (!info.isFile() || info.size > 64 * 1024) throw new Error("ملف الترخيص غير صالح.");
    const raw = await readFile(sourcePath, "utf8");
    const candidate = verifyLicenseDocument(raw, this.machineId, this.publicKeyPem, this.appVersion);
    if (!candidate.valid) throw new Error(candidate.message);

    await mkdir(path.dirname(this.licensePath), { recursive: true });
    await copyFile(sourcePath, this.licensePath);
    this.status = candidate;
    return this.getStatus();
  }
}

export const LICENSE_FORMAT_VERSION = FORMAT_VERSION;
export { canonicalJson };
