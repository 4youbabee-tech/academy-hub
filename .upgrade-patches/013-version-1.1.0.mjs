import fs from 'node:fs';

for (const path of ['package.json', 'package-lock.json']) {
  const before = fs.readFileSync(path, 'utf8');
  const after = before.replaceAll('"version": "1.0.1"', '"version": "1.1.0"');
  if (after === before) throw new Error(`Expected 1.0.1 version marker not found in ${path}`);
  fs.writeFileSync(path, after);
}
console.log('Academy Hub version bumped to 1.1.0');
