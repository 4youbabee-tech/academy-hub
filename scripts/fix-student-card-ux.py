from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch target: {label}")
    return text.replace(old, new, 1)

students_path = Path("src/routes/students.tsx")
students = students_path.read_text()

students = replace_required(
    students,
    '''                <Td>\n                  <Link to="/students/$id" params={{ id: s.id }} className="font-semibold text-primary hover:underline">\n                    {s.full_name}\n                  </Link>\n                </Td>''',
    '''                <Td>\n                  <div className="flex min-w-[150px] flex-col items-start gap-2">\n                    <Link to="/students/$id" params={{ id: s.id }} className="font-semibold text-primary hover:underline">\n                      {s.full_name}\n                    </Link>\n                    <Link to="/students/$id" params={{ id: s.id }}>\n                      <Button variant="secondary" className="h-8 px-3 text-xs">📋 بطاقة الطالب</Button>\n                    </Link>\n                  </div>\n                </Td>''',
    "student card button beside student name",
)

students = replace_required(
    students,
    '''                    <Link to="/students/$id" params={{ id: s.id }}>\n                      <Button variant="secondary">بطاقة الطالب</Button>\n                    </Link>\n''',
    '''''',
    "remove duplicate student card action",
)

students_path.write_text(students)

card_path = Path("src/components/StudentAnnualBillingCard.tsx")
card = card_path.read_text()

card = replace_required(
    card,
    '''  const cur = db.settings.currency;\n  const currentPeriod = localMonthKey();''',
    '''  const cur = db.settings.currency;\n  const currentPeriod = localMonthKey();\n  const student = db.students.find((item) => item.id === studentId);''',
    "student lookup in card",
)

card = replace_required(
    card,
    '''      <h2 className="mb-2 mt-6 text-sm font-bold">بطاقة الطالب الشهرية — الفعلي والمتوقع</h2>''',
    '''      <div className="mb-3 mt-6 rounded-2xl border bg-card p-4 shadow-sm">\n        <div className="flex flex-wrap items-center justify-between gap-3">\n          <div>\n            <p className="text-xs text-muted-foreground">بطاقة الطالب المالية</p>\n            <h2 className="text-lg font-extrabold">{student?.full_name ?? "الطالب"}</h2>\n            <p className="mt-1 text-xs text-muted-foreground">12 شهر — المستحق والمدفوع والمتبقي والمتوقع</p>\n          </div>\n          <Badge tone="primary">الأشهر 1 → 12</Badge>\n        </div>\n      </div>''',
    "student card heading",
)

card = replace_required(
    card,
    '''          const rows = periods.map((period) => {''',
    '''          const rows = periods.map((period, index) => {''',
    "annual rows index",
)

card = replace_required(
    card,
    '''            return { period, actual, isSkipped, isStopped, expectedAmount, future };''',
    '''            return { monthNo: index + 1, period, actual, isSkipped, isStopped, expectedAmount, future };''',
    "annual row month number",
)

card = replace_required(
    card,
    '''              <Table head={["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة", ""]}>''',
    '''              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">\n                <div className="rounded-xl bg-muted/50 p-3 text-center">\n                  <div className="text-xs text-muted-foreground">القسط الشهري</div>\n                  <div className="mt-1 font-bold tabular-nums">{money(enrollment.monthly_price_snapshot ?? 0, cur)}</div>\n                </div>\n                <div className="rounded-xl bg-muted/50 p-3 text-center">\n                  <div className="text-xs text-muted-foreground">المتبقي الفعلي</div>\n                  <div className={actualDue > 0 ? "mt-1 font-bold tabular-nums text-destructive" : "mt-1 font-bold tabular-nums text-emerald-700"}>{money(actualDue, cur)}</div>\n                </div>\n                <div className="rounded-xl bg-muted/50 p-3 text-center">\n                  <div className="text-xs text-muted-foreground">المتوقع 12 شهر</div>\n                  <div className="mt-1 font-bold tabular-nums">{money(projectedTotal, cur)}</div>\n                </div>\n                <div className="rounded-xl bg-muted/50 p-3 text-center">\n                  <div className="text-xs text-muted-foreground">حالة التسجيل</div>\n                  <div className="mt-1 font-bold">{enrollment.status === "active" ? "جارٍ" : "متوقف"}</div>\n                </div>\n              </div>\n\n              <Table head={["الشهر", "الفترة", "المستحق", "المدفوع", "المتبقي", "الحالة", ""]}>''',
    "annual financial summary and period column",
)

card = replace_required(
    card,
    '''                      <Td className="font-semibold">{numericPeriod(row.period)}</Td>\n                      <Td className="tabular-nums">{money(amount, cur)}</Td>''',
    '''                      <Td className="font-extrabold text-primary">{row.monthNo}</Td>\n                      <Td className="text-xs text-muted-foreground">{numericPeriod(row.period)}</Td>\n                      <Td className="tabular-nums">{money(amount, cur)}</Td>''',
    "display months one to twelve",
)

card_path.write_text(card)
print("Applied student card UX patch.")
