import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";

const MAGIC = Buffer.from("AHBK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error("Invalid Academy Hub backup encryption key.");
  }
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

export async function encryptBackupFile(source, destination, key) {
  assertKey(key);
  const plain = await readFile(source);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeFile(destination, Buffer.concat([MAGIC, iv, tag, encrypted]), { mode: 0o600 });
}

export async function decryptBackupFile(source, destination, key) {
  assertKey(key);
  const payload = await readFile(source);
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("النسخة الاحتياطية ليست بصيغة Academy Hub المشفرة.");
  }
  if (payload.length <= MAGIC.length + IV_BYTES + TAG_BYTES) {
    throw new Error("النسخة الاحتياطية المشفرة تالفة.");
  }

  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const bodyStart = tagStart + TAG_BYTES;
  const iv = payload.subarray(ivStart, tagStart);
  const tag = payload.subarray(tagStart, bodyStart);
  const encrypted = payload.subarray(bodyStart);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    await writeFile(destination, plain, { mode: 0o600 });
  } catch {
    throw new Error("تعذر فك النسخة الاحتياطية: الملف تالف أو مفتاح الحماية غير صحيح.");
  }
}
