import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";

const MAGIC = Buffer.from("AHBK2", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MIN_PASSPHRASE_LENGTH = 10;

function normalizePassphrase(passphrase) {
  if (typeof passphrase !== "string") throw new Error("كلمة حماية النسخة الاحتياطية مطلوبة.");
  const normalized = passphrase.normalize("NFKC");
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`كلمة حماية النسخة الاحتياطية يجب أن تكون ${MIN_PASSPHRASE_LENGTH} أحرف على الأقل.`);
  }
  if (Buffer.byteLength(normalized, "utf8") > 1024) throw new Error("كلمة حماية النسخة الاحتياطية طويلة جدًا.");
  return normalized;
}

function deriveKey(passphrase, salt) {
  const normalized = normalizePassphrase(passphrase);
  return scryptSync(normalized, salt, KEY_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export async function isEncryptedBackup(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === MAGIC.length && header.equals(MAGIC);
  } finally {
    await handle.close();
  }
}

export async function encryptBackupFile(source, destination, passphrase) {
  const salt = randomBytes(SALT_BYTES);
  const key = deriveKey(passphrase, salt);
  const plain = await readFile(source);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeFile(destination, Buffer.concat([MAGIC, salt, iv, tag, encrypted]), { mode: 0o600 });
}

export async function decryptBackupFile(source, destination, passphrase) {
  const payload = await readFile(source);
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("النسخة الاحتياطية ليست بصيغة Academy Hub المشفرة.");
  }
  if (payload.length <= MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("النسخة الاحتياطية المشفرة تالفة.");
  }

  const saltStart = MAGIC.length;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const bodyStart = tagStart + TAG_BYTES;
  const salt = payload.subarray(saltStart, ivStart);
  const iv = payload.subarray(ivStart, tagStart);
  const tag = payload.subarray(tagStart, bodyStart);
  const encrypted = payload.subarray(bodyStart);
  const key = deriveKey(passphrase, salt);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    await writeFile(destination, plain, { mode: 0o600 });
  } catch {
    throw new Error("تعذر فك النسخة الاحتياطية: كلمة الحماية غير صحيحة أو الملف تالف.");
  }
}
