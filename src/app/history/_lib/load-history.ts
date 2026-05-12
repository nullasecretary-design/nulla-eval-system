import { supabaseAdmin } from '@/lib/supabase-admin';
import type { QuarterSummary, MonthSummary } from '../_components/HistoryTimeline';

type EvalRow = {
  evaluator_role: '自評' | '主管' | '執行長';
  score_efficiency: number | null;
  score_quality: number | null;
  score_cooperation: number | null;
  score_attendance: number | null;
  evaluation_periods: { year: number; month: number };
};

function rowTotal(r: EvalRow): number {
  return (
    (r.score_efficiency ?? 0) +
    (r.score_quality ?? 0) +
    (r.score_cooperation ?? 0) +
    (r.score_attendance ?? 0)
  );
}

function quarterOf(month: number): 1 | 2 | 3 | 4 {
  return Math.ceil(month / 3) as 1 | 2 | 3 | 4;
}

function monthsOfQuarter(q: number): [number, number, number] {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * 抓某員工的全部已填評核 → 算每月加權 → 整理成季度卡片資料。
 * 「員工自己看」跟「主管/執行長看下屬」都用這條,顯示內容完全一致。
 */
export async function loadEmployeeHistory(
  employee_number: string
): Promise<QuarterSummary[]> {
  const { data: rows } = await supabaseAdmin
    .from('evaluations')
    .select(
      'evaluator_role, score_efficiency, score_quality, score_cooperation, score_attendance, evaluation_periods!inner(year, month)'
    )
    .eq('evaluatee_id', employee_number)
    .eq('status', '已填')
    .returns<EvalRow[]>();

  // 依年月分組,算 self / mgr / ceo 各自總分
  type MonthBucket = {
    year: number;
    month: number;
    self: number | null;
    mgr: number | null;
    ceo: number | null;
  };
  const bucketKey = (y: number, m: number) => `${y}-${m}`;
  const monthBuckets = new Map<string, MonthBucket>();

  for (const r of rows ?? []) {
    const y = r.evaluation_periods.year;
    const m = r.evaluation_periods.month;
    const k = bucketKey(y, m);
    let b = monthBuckets.get(k);
    if (!b) {
      b = { year: y, month: m, self: null, mgr: null, ceo: null };
      monthBuckets.set(k, b);
    }
    if (r.evaluator_role === '自評') b.self = rowTotal(r);
    else if (r.evaluator_role === '主管') b.mgr = rowTotal(r);
    else if (r.evaluator_role === '執行長') b.ceo = rowTotal(r);
  }

  // 算每月加權:有主管評就 70/30,沒主管評(直屬執行長)就執行長 100%
  const monthSummaries: MonthSummary[] = [];
  for (const b of monthBuckets.values()) {
    let weighted: number | null = null;
    if (b.mgr !== null && b.ceo !== null) {
      weighted = b.mgr * 0.7 + b.ceo * 0.3;
    } else if (b.mgr === null && b.ceo !== null) {
      weighted = b.ceo;
    }
    monthSummaries.push({
      year: b.year,
      month: b.month,
      selfTotal: b.self,
      weightedTotal: weighted,
    });
  }

  // 依季度分組
  const quarterMap = new Map<string, QuarterSummary>();
  for (const ms of monthSummaries) {
    const q = quarterOf(ms.month);
    const qKey = `${ms.year}-Q${q}`;
    let qs = quarterMap.get(qKey);
    if (!qs) {
      qs = {
        year: ms.year,
        quarter: q,
        months: monthsOfQuarter(q),
        monthData: [],
        selfAvg: null,
        weightedAvg: null,
      };
      quarterMap.set(qKey, qs);
    }
    qs.monthData.push(ms);
  }
  // 補齊每季 3 個月(沒紀錄的月份也要顯示為空白卡)
  for (const qs of quarterMap.values()) {
    qs.monthData.sort((a, b) => a.month - b.month);
    const haveMonths = new Set(qs.monthData.map((m) => m.month));
    for (const m of qs.months) {
      if (!haveMonths.has(m)) {
        qs.monthData.push({
          year: qs.year,
          month: m,
          selfTotal: null,
          weightedTotal: null,
        });
      }
    }
    qs.monthData.sort((a, b) => a.month - b.month);
    qs.selfAvg = avg(qs.monthData.map((m) => m.selfTotal));
    qs.weightedAvg = avg(qs.monthData.map((m) => m.weightedTotal));
  }

  // 由新到舊
  return Array.from(quarterMap.values()).sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.quarter - a.quarter
  );
}

/**
 * 檢查 viewer 能不能看 target 的歷史紀錄。
 *
 * 規則:
 * - 自己 → 隨時可看
 * - 主管 → 直屬下屬(target.manager_id === viewer.employee_number)
 * - 執行長 → 自家公司所有人
 * - 超管 → 全部
 */
export function canViewHistoryOf(
  viewer: {
    employee_number: string;
    position: string;
    admin_role: string;
    org_id: string;
  },
  target: { employee_number: string; manager_id: string | null; org_id: string }
): boolean {
  if (viewer.employee_number === target.employee_number) return true;
  if (viewer.admin_role === '超級管理員') return true;
  if (viewer.position === '執行長' && target.org_id === viewer.org_id) return true;
  if (target.manager_id === viewer.employee_number) return true;
  return false;
}
