import type { DB, ID } from "./types";

export function attendanceRate(db: DB, enrollmentId: ID): number | null {
  const rows = db.attendance.filter((a) => a.enrollment_id === enrollmentId);
  if (!rows.length) return null;
  const good = rows.filter((r) => r.status === "present" || r.status === "late" || r.status === "excused").length;
  return (good / rows.length) * 100;
}

/** Weighted final result using the exam weight snapshots + attendance weight. */
export function finalResult(db: DB, enrollmentId: ID) {
  const enr = db.enrollments.find((e) => e.id === enrollmentId);
  if (!enr) return null;
  const exams = db.exams.filter((x) => x.class_id === enr.class_id);
  let weighted = 0;
  let usedWeight = 0;
  const breakdown: { title: string; percent: number; weight: number }[] = [];

  for (const ex of exams) {
    const g = db.grades.find((x) => x.exam_id === ex.id && x.enrollment_id === enrollmentId);
    if (!g || ex.max_score <= 0) continue;
    const percent = (g.score / ex.max_score) * 100;
    weighted += percent * (ex.weight_snapshot / 100);
    usedWeight += ex.weight_snapshot;
    breakdown.push({ title: ex.title, percent, weight: ex.weight_snapshot });
  }

  const attWeight = db.settings.grading.weights.attendance;
  const att = attendanceRate(db, enrollmentId);
  if (attWeight > 0 && att !== null) {
    weighted += att * (attWeight / 100);
    usedWeight += attWeight;
    breakdown.push({ title: "الحضور", percent: att, weight: attWeight });
  }

  if (usedWeight === 0) return { total: null, passed: false, breakdown };
  const total = (weighted / usedWeight) * 100;
  return { total, passed: total >= db.settings.grading.pass_mark, breakdown };
}
