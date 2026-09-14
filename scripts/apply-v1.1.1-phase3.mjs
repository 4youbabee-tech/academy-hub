import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

// Students list: make registration student-first and expose an explicit student card action.
const studentsPath = "src/routes/students.tsx";
let students = read(studentsPath);
students = replaceRequired(
  students,
  'import { Denied } from "@/components/AppShell";\n',
  'import { Denied } from "@/components/AppShell";\nimport { StudentEnrollmentModal } from "@/components/StudentEnrollmentModal";\n',
  "students enrollment modal import",
);
students = replaceRequired(
  students,
  '  const [restoreFor, setRestoreFor] = useState<Student | null>(null);\n',
  '  const [restoreFor, setRestoreFor] = useState<Student | null>(null);\n  const [enrollStudentId, setEnrollStudentId] = useState<string | null>(null);\n',
  "students registration state",
);
students = replaceRequired(
  students,
  '  const canEdit = allowed("students.update");\n  const canViewFinance = allowed("finance.view");\n',
  '  const canEdit = allowed("students.update");\n  const canEnroll = allowed("enrollments.create");\n  const canViewFinance = allowed("finance.view");\n',
  "students enrollment permission",
);
students = students.replace('title="الطلاب"', 'title="الطلاب والتسجيل"');
students = students.replaceAll('"الدورة / الصف"', '"العام الدراسي / الصف"');
students = replaceRequired(
  students,
  `                <Td>\n                  {canEdit ? (\n                    <div className="flex flex-wrap gap-1">\n                      {s.status === "archived" ? (\n                        <Button variant="secondary" onClick={() => setRestoreFor(s)}>\n                          استرجاع\n                        </Button>\n                      ) : (\n                        <>\n                          <Button variant="ghost" onClick={() => startEdit(s)}>\n                            تعديل\n                          </Button>\n                          <Button variant="ghost" onClick={() => { setArchiveFor(s); setError(null); }}>\n                            أرشفة\n                          </Button>\n                        </>\n                      )}\n                    </div>\n                  ) : null}\n                </Td>`,
  `                <Td>\n                  <div className="flex flex-wrap gap-1">\n                    <Link to="/students/$id" params={{ id: s.id }}>\n                      <Button variant="secondary">بطاقة الطالب</Button>\n                    </Link>\n                    {canEnroll && s.status === "active" ? (\n                      <Button variant="ghost" onClick={() => setEnrollStudentId(s.id)}>تسجيل</Button>\n                    ) : null}\n                    {canEdit ? (\n                      s.status === "archived" ? (\n                        <Button variant="secondary" onClick={() => setRestoreFor(s)}>استرجاع</Button>\n                      ) : (\n                        <>\n                          <Button variant="ghost" onClick={() => startEdit(s)}>تعديل</Button>\n                          <Button variant="ghost" onClick={() => { setArchiveFor(s); setError(null); }}>أرشفة</Button>\n                        </>\n                      )\n                    ) : null}\n                  </div>\n                </Td>`,
  "students action cell",
);
students = replaceRequired(
  students,
  `      <Modal open={!!restoreFor} title="استرجاع الطالب" onClose={() => setRestoreFor(null)}>\n        {restoreFor ? (\n          <div className="space-y-4">\n            <p className="text-sm">هل تريد استرجاع <b>{restoreFor.full_name}</b> من الأرشيف وإعادته كطالب نشط؟</p>\n            <div className="flex justify-end gap-2">\n              <Button variant="secondary" onClick={() => setRestoreFor(null)}>تراجع</Button>\n              <Button onClick={confirmRestore}>استرجاع</Button>\n            </div>\n          </div>\n        ) : null}\n      </Modal>\n`,
  `      <Modal open={!!restoreFor} title="استرجاع الطالب" onClose={() => setRestoreFor(null)}>\n        {restoreFor ? (\n          <div className="space-y-4">\n            <p className="text-sm">هل تريد استرجاع <b>{restoreFor.full_name}</b> من الأرشيف وإعادته كطالب نشط؟</p>\n            <div className="flex justify-end gap-2">\n              <Button variant="secondary" onClick={() => setRestoreFor(null)}>تراجع</Button>\n              <Button onClick={confirmRestore}>استرجاع</Button>\n            </div>\n          </div>\n        ) : null}\n      </Modal>\n\n      <StudentEnrollmentModal\n        open={!!enrollStudentId}\n        studentId={enrollStudentId}\n        onClose={() => setEnrollStudentId(null)}\n      />\n`,
  "students registration modal",
);
write(studentsPath, students);

// Student profile: registration belongs to the student card as the primary workflow.
const profilePath = "src/routes/students.$id.tsx";
let profile = read(profilePath);
profile = replaceRequired(
  profile,
  'import { Denied } from "@/components/AppShell";\n',
  'import { Denied } from "@/components/AppShell";\nimport { StudentEnrollmentModal } from "@/components/StudentEnrollmentModal";\n',
  "profile enrollment modal import",
);
profile = replaceRequired(
  profile,
  '  const [voidError, setVoidError] = useState<string | null>(null);\n',
  '  const [voidError, setVoidError] = useState<string | null>(null);\n  const [enrollOpen, setEnrollOpen] = useState(false);\n',
  "profile enrollment state",
);
profile = replaceRequired(
  profile,
  '  const canViewFinance = allowed("finance.view");\n  const canVoidFinance = allowed("finance.void");\n',
  '  const canViewFinance = allowed("finance.view");\n  const canVoidFinance = allowed("finance.void");\n  const canEnroll = allowed("enrollments.create");\n',
  "profile enrollment permission",
);
profile = replaceRequired(
  profile,
  `          <>\n            <Button variant="secondary" onClick={() => window.print()}>\n              طباعة كشف الحساب\n            </Button>\n            <Link to="/students">\n              <Button variant="ghost">رجوع</Button>\n            </Link>\n          </>`,
  `          <>\n            {canEnroll && student.status === "active" ? (\n              <Button onClick={() => setEnrollOpen(true)}>+ تسجيل في صف</Button>\n            ) : null}\n            <Button variant="secondary" onClick={() => window.print()}>\n              طباعة كشف الحساب\n            </Button>\n            <Link to="/students">\n              <Button variant="ghost">رجوع</Button>\n            </Link>\n          </>`,
  "profile actions",
);
profile = replaceRequired(
  profile,
  `      {canViewFinance && payments.length ? (\n        <Table head={["رقم السند", "البيان / الملاحظة", "العام الدراسي / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>`,
  `      {canViewFinance && payments.length ? (\n        <Table head={["رقم السند", "البيان / الملاحظة", "العام الدراسي / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>`,
  "profile stable payment table anchor",
);
profile = replaceRequired(
  profile,
  `      ) : canViewFinance ? (\n        <Empty text="لا توجد سندات قبض." />\n      ) : null}\n    </div>`,
  `      ) : canViewFinance ? (\n        <Empty text="لا توجد سندات قبض." />\n      ) : null}\n\n      <StudentEnrollmentModal\n        open={enrollOpen}\n        studentId={student.id}\n        onClose={() => setEnrollOpen(false)}\n      />\n    </div>`,
  "profile registration modal",
);
write(profilePath, profile);

// Classes screen remains class administration. Registration actions are intentionally removed from this entry point.
const classesPath = "src/routes/classes.tsx";
let classes = read(classesPath);
classes = classes.replaceAll("الصفوف والتسجيل — نظام إدارة المركز التعليمي", "الصفوف — نظام إدارة المركز التعليمي");
classes = classes.replaceAll("الصفوف والتسجيل — نظام إدارة المعهد", "الصفوف — نظام إدارة المعهد");
classes = classes.replaceAll("إدارة الصفوف الدراسية والمدرّسين والجداول الأسبوعية وتسجيل الطلاب.", "إدارة الصفوف الدراسية والمدرّسين والجداول الأسبوعية.");
classes = classes.replaceAll("الصفوف والمدرّسون والجداول الأسبوعية وتسجيل الطلاب.", "الصفوف والمدرّسون والجداول الأسبوعية.");
classes = classes.replace('title="الصفوف والتسجيل"', 'title="الصفوف"');
classes = classes.replace('placeholder="بحث بالصف أو العام الدراسي أو المدرّس أو اسم طالب"', 'placeholder="بحث بالصف أو العام الدراسي أو المدرّس"');
classes = classes.replaceAll('"المسجّلون"', '"عدد الطلاب"');
classes = replaceRequired(
  classes,
  `                  <Button\n                    variant="ghost"\n                    onClick={() => {\n                      setRegistrantsFor(k);\n                      setCancelError(null);\n                    }}\n                  >\n                    المسجّلون\n                  </Button>\n                  {canEnroll ? (\n                    <Button variant="ghost" onClick={() => openEnroll(k)}>\n                      تسجيل طالب\n                    </Button>\n                  ) : null}\n`,
  "",
  "remove class-side registration actions",
);
write(classesPath, classes);

console.log("Applied Academy Hub v1.1.1 phase 3 student-first registration integration.");
