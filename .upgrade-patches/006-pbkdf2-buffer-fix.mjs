import fs from 'node:fs';

const path = 'src/lib/db.ts';
let source = fs.readFileSync(path, 'utf8');
const from = `async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {\n  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);\n  const bits = await crypto.subtle.deriveBits(\n    { name: "PBKDF2", hash: "SHA-256", salt, iterations },`;
const to = `async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {\n  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);\n  const saltBuffer = Uint8Array.from(salt).buffer;\n  const bits = await crypto.subtle.deriveBits(\n    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },`;
if (!source.includes(from)) throw new Error('Expected PBKDF2 derive block not found');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('PBKDF2 salt BufferSource compatibility repaired');
