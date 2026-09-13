import fs from 'node:fs';

const path = 'tests/domain-harness.ts';
let source = fs.readFileSync(path, 'utf8');
const oldPattern = '/السجلات المالية لا تُعدّل أو تُحذف مباشرة/';
const newPattern = '/السجلات المالية لا تُنشأ أو تُعدّل أو تُحذف مباشرة/';
const matches = source.split(oldPattern).length - 1;
if (matches < 2) throw new Error(`Expected at least 2 legacy financial guard assertions, found ${matches}`);
source = source.replaceAll(oldPattern, newPattern);
fs.writeFileSync(path, source);
console.log('Financial guard test expectations updated');
