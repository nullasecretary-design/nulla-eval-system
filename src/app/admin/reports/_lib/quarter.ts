import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const ITEMS = [
  { key: 'efficiency', label: '工作時效', max: 30 },
  { key: 'quality', label: '工作品質', max: 25 },
  { key: 'cooperation', label: '工作配合度', max: 25 },
  { key: 'attendance', label: '出勤狀況', max: 20 },
] as const;
export type ItemKey = (typeof ITEMS)[number]['key'];

export type Role = '自評' | '主管' | '執行長';

export type ItemScores = Record<ItemKey, number>;

export type EvalSet = {
  self: ItemScores | null;
  mgr: ItemScores | null;
  ceo: ItemScores | null;
};

export type MonthData = {
  month: number;
  evals: EvalSet;
  weightedTotal: number | null;
  selfTotal: number | null;
};

export type EmployeeRow = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  monthly: MonthData[];
  quarterAvg: number | null;
  hasMissing: boolean;
};

export function quarterMonths(quarter: number): [number, number, number] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function totalOf(s: ItemScores | null): number | null {
  if (!s) return null;
  return s.efficiency + s.quality + s.cooperation + s.attendance;
}

/**
 * 加權月分計算(spec §3.3):
 *   有主管評(該員工有 manager 不是 CEO)→ 主管 × 70% + 執行長 × 30%
 *   沒主管評(直屬執行長)→ 執行長 × 100%
 *   缺任一必要項 → null(該月不計入)
 */
export function weightedTotalForMonth(set: EvalSet, hasManager: boolean): number | null {
  const ceo = totalOf(set.ceo);
  if (ceo === null) return null;
  if (hasManager) {
    const mgr = totalOf(set.mgr);
    if (mgr === null) return null;
    return mgr * 0.7 + ceo * 0.3;
  }
  return ceo;
}

export function weightedItemForMonth(
  set: EvalSet,
  itemKey: ItemKey,
  hasManager: boolean
): number | null {
  if (!set.ceo) return null;
  if (hasManager) {
    if (!set.mgr) return null;
    return set.mgr[itemKey] * 0.7 + set.ceo[itemKey] * 0.3;
  }
  return set.ceo[itemKey];
}

type RawEvalRow = {
  period_id: string;
  evaluatee_id: string;
  evaluator_role: Role;
  score_efficiency: number;
  score_quality: number;
  score_cooperation: number;
  score_attendance: number;
  comment: string | null;
};

type EmployeeRecord = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  manager_id: string | null;
};

/**
 * Load all data needed for a quarterly report on a single org.
 * Returns null if no periods exist for that quarter.
 */
export async function loadQuarter(
  orgId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<{
  rows: EmployeeRow[];
  ceoId: string | null;
} | null> {
  const months = quarterMonths(quarter);

  const { data: periods } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, month')
    .eq('org_id', orgId)
    .eq('year', year)
    .in('month', months);
  if (!periods || periods.length === 0) return null;

  const periodIdToMonth = new Map<string, number>(
    periods.map((p) => [p.id, p.month])
  );

  const { data: evals } = await supabaseAdmin
    .from('evaluations')
    .select(
      'period_id, evaluatee_id, evaluator_role, score_efficiency, score_quality, score_cooperation, score_attendance, comment'
    )
    .in(
      'period_id',
      periods.map((p) => p.id)
    )
    .eq('status', '已填')
    .returns<RawEvalRow[]>();

  // 抓 CEO id 用來判斷「直屬執行長」
  const { data: ceoRow } = await supabaseAdmin
    .from('employees')
    .select('employee_number')
    .eq('org_id', orgId)
    .eq('position', '執行長')
    .eq('status', '在職')
    .maybeSingle();
  const ceoId = ceoRow?.employee_number ?? null;

  // 蒐集出現在這季度評核紀錄裡的所有 evaluatee_id
  const evaluateeIds = Array.from(
    new Set((evals ?? []).map((e) => e.evaluatee_id))
  );
  if (evaluateeIds.length === 0) return { rows: [], ceoId };

  const { data: emps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title, manager_id')
    .in('employee_number', evaluateeIds)
    .returns<EmployeeRecord[]>();
  const empMap = new Map<string, EmployeeRecord>(
    (emps ?? []).map((e) => [e.employee_number, e])
  );

  // index: evaluatee → month → role → scores
  const buckets = new Map<string, Map<number, EvalSet>>();
  for (const r of evals ?? []) {
    const month = periodIdToMonth.get(r.period_id);
    if (!month) continue;
    let monthMap = buckets.get(r.evaluatee_id);
    if (!monthMap) {
      monthMap = new Map();
      buckets.set(r.evaluatee_id, monthMap);
    }
    let set = monthMap.get(month);
    if (!set) {
      set = { self: null, mgr: null, ceo: null };
      monthMap.set(month, set);
    }
    const scores: ItemScores = {
      efficiency: r.score_efficiency,
      quality: r.score_quality,
      cooperation: r.score_cooperation,
      attendance: r.score_attendance,
    };
    if (r.evaluator_role === '自評') set.self = scores;
    else if (r.evaluator_role === '主管') set.mgr = scores;
    else if (r.evaluator_role === '執行長') set.ceo = scores;
  }

  const rows: EmployeeRow[] = [];
  for (const evaluateeId of evaluateeIds) {
    const emp = empMap.get(evaluateeId);
    if (!emp) continue;
    const hasManager =
      emp.manager_id !== null && emp.manager_id !== ceoId;

    const monthly: MonthData[] = months.map((m) => {
      const set = buckets.get(evaluateeId)?.get(m) ?? {
        self: null,
        mgr: null,
        ceo: null,
      };
      return {
        month: m,
        evals: set,
        weightedTotal: weightedTotalForMonth(set, hasManager),
        selfTotal: totalOf(set.self),
      };
    });

    const validWeighted = monthly
      .map((m) => m.weightedTotal)
      .filter((v): v is number => v !== null);
    const quarterAvg =
      validWeighted.length > 0
        ? validWeighted.reduce((a, b) => a + b, 0) / validWeighted.length
        : null;
    const hasMissing = monthly.some((m) => m.weightedTotal === null);

    rows.push({
      employee_number: emp.employee_number,
      name: emp.name,
      department: emp.department,
      job_title: emp.job_title,
      monthly,
      quarterAvg,
      hasMissing,
    });
  }

  rows.sort((a, b) => a.employee_number.localeCompare(b.employee_number));
  return { rows, ceoId };
}

export function canViewReports(emp: {
  position: string;
  admin_role: string;
}): boolean {
  return (
    emp.position === '執行長' ||
    emp.admin_role === '超級管理員' ||
    emp.admin_role === '會計'
  );
}
