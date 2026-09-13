import fs from 'node:fs';

const path = 'src/routes/settings.tsx';
let source = fs.readFileSync(path, 'utf8');
const from = `            <p className="text-xs text-muted-foreground">تعطيل الخصم يمنع استخدامه في تسجيلات جديدة، لكنه يبقى محفوظاً حتى لا يتأثر التاريخ المالي للتسجيلات السابقة.</p>\n          </div>\n      </div>\n\n      {/* ✅ قسم الشعار */}`;
const to = `            <p className="text-xs text-muted-foreground">تعطيل الخصم يمنع استخدامه في تسجيلات جديدة، لكنه يبقى محفوظاً حتى لا يتأثر التاريخ المالي للتسجيلات السابقة.</p>\n          </div>\n        </div>\n      </div>\n\n      {/* ✅ قسم الشعار */}`;
if (!source.includes(from)) throw new Error('Expected transformed discount panel block not found');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Settings discount panel JSX repaired');
