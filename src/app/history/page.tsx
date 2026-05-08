import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { HistoryTimeline, type QuarterSummary } from './_components/HistoryTimeline';

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

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title')
    .eq('employee_number', session.employee_number)
    .single();
  if (!emp) redirect('/login');

  // 抓自己所有「已填」的評核(三種角色都要),帶上 period 的年月
  const { data: rows } = await supabaseAdmin
    .from('evaluations')
    .select(
      'evaluator_role, score_efficiency, score_quality, score_cooperation, score_attendance, evaluation_periods!inner(year, month)'
    )
    .eq('evaluatee_id', emp.employee_number)
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
  // 缺評(該角色 row 沒填)→ weighted = null
  type MonthSummary = {
    year: number;
    month: number;
    selfTotal: number | null;
    weightedTotal: number | null;
  };
  const monthSummaries: MonthSummary[] = [];
  for (const b of monthBuckets.values()) {
    let weighted: number | null = null;
    if (b.mgr !== null && b.ceo !== null) {
      weighted = b.mgr * 0.7 + b.ceo * 0.3;
    } else if (b.mgr === null && b.ceo !== null) {
      // 沒主管評 = 直屬執行長者:執行長 × 100%
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
  // 補齊每季 3 個月(沒紀錄的 month 也要顯示)
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

  // 由新到舊排序
  const quarters: QuarterSummary[] = Array.from(quarterMap.values()).sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.quarter - a.quarter
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回首頁
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            歷史紀錄
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {emp.name} · {emp.department} · {emp.job_title}
          </p>
        </header>

        {quarters.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-zinc-600 dark:text-zinc-400">
              尚無紀錄。完成第一次評核後,過去的分數會出現在這。
            </p>
          </div>
        ) : (
          <HistoryTimeline quarters={quarters} />
        )}
      </div>
    </main>
  );
}
