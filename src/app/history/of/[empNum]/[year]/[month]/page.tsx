import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canViewHistoryOf } from '../../../../_lib/load-history';

type EvalRow = {
  evaluator_role: '自評' | '主管' | '執行長';
  score_efficiency: number;
  score_quality: number;
  score_cooperation: number;
  score_attendance: number;
  comment: string | null;
};

const ITEMS = [
  { key: 'efficiency', label: '工作時效', max: 30 },
  { key: 'quality', label: '工作品質', max: 25 },
  { key: 'cooperation', label: '工作配合度', max: 25 },
  { key: 'attendance', label: '出勤狀況', max: 20 },
] as const;
type ItemKey = (typeof ITEMS)[number]['key'];

function fieldOf(r: EvalRow, key: ItemKey): number {
  if (key === 'efficiency') return r.score_efficiency;
  if (key === 'quality') return r.score_quality;
  if (key === 'cooperation') return r.score_cooperation;
  return r.score_attendance;
}

function fmt(n: number | null): string {
  return n === null ? '—' : String(Math.round(n));
}

export default async function TargetMonthlyDetailPage({
  params,
}: {
  params: Promise<{ empNum: string; year: string; month: string }>;
}) {
  const { empNum, year: yearStr, month: monthStr } = await params;
  const target_number = decodeURIComponent(empNum);
  const year = Number(yearStr);
  const month = Number(monthStr);

  const session = await getSession();
  if (!session) redirect('/login');

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return (
      <Shell
        backHref={`/history/of/${encodeURIComponent(target_number)}`}
        title="月份不存在"
      >
        <p className="text-zinc-600 dark:text-zinc-400">網址有誤,找不到對應的月份。</p>
      </Shell>
    );
  }

  const { data: viewer } = await supabaseAdmin
    .from('employees')
    .select('employee_number, position, admin_role, org_id, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!viewer) redirect('/login');
  if (viewer.status !== '在職') redirect('/');

  const { data: target } = await supabaseAdmin
    .from('employees')
    .select(
      'employee_number, name, department, job_title, manager_id, org_id, status'
    )
    .eq('employee_number', target_number)
    .maybeSingle();
  if (!target) {
    return (
      <Shell
        backHref="/history"
        title="找不到員工"
      >
        <p className="text-zinc-600 dark:text-zinc-400">編號 {target_number} 不存在。</p>
      </Shell>
    );
  }

  if (!canViewHistoryOf(viewer, target)) {
    redirect('/history');
  }

  const backHref = `/history/of/${encodeURIComponent(target.employee_number)}`;

  const { data: period } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id')
    .eq('org_id', target.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (!period) {
    return (
      <Shell
        backHref={backHref}
        title={`${year} 年 ${month} 月`}
        subtitle={`${target.name} · ${target.department} · ${target.job_title}`}
      >
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">這個月沒有評核紀錄。</p>
        </div>
      </Shell>
    );
  }

  const { data: rows } = await supabaseAdmin
    .from('evaluations')
    .select(
      'evaluator_role, score_efficiency, score_quality, score_cooperation, score_attendance, comment, status'
    )
    .eq('period_id', period.id)
    .eq('evaluatee_id', target.employee_number)
    .eq('status', '已填')
    .returns<(EvalRow & { status: string })[]>();

  const self = rows?.find((r) => r.evaluator_role === '自評') ?? null;
  const mgr = rows?.find((r) => r.evaluator_role === '主管') ?? null;
  const ceo = rows?.find((r) => r.evaluator_role === '執行長') ?? null;

  const hasMgr = mgr !== null;

  function weighted(key: ItemKey): number | null {
    if (hasMgr) {
      if (!mgr || !ceo) return null;
      return fieldOf(mgr, key) * 0.7 + fieldOf(ceo, key) * 0.3;
    }
    if (!ceo) return null;
    return fieldOf(ceo, key);
  }

  const itemRows = ITEMS.map((it) => ({
    ...it,
    self: self ? fieldOf(self, it.key) : null,
    weighted: weighted(it.key),
  }));

  const selfTotal = self
    ? ITEMS.reduce((s, it) => s + fieldOf(self, it.key), 0)
    : null;
  const weightedTotal = itemRows.every((r) => r.weighted !== null)
    ? itemRows.reduce((s, r) => s + (r.weighted ?? 0), 0)
    : null;

  return (
    <Shell
      backHref={backHref}
      title={`${year} 年 ${month} 月`}
      subtitle={`${target.name} · ${target.department} · ${target.job_title}`}
    >
      {/* 加權後總分 */}
      <section className="rounded-2xl border-2 border-emerald-200 bg-white/80 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/60">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-emerald-700/80 dark:text-emerald-300/80">
            加權後總分
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {hasMgr ? '主管 70% + 執行長 30%' : '執行長 100%'}
          </span>
        </div>
        <p className="mt-2 text-4xl font-bold text-emerald-700 dark:text-emerald-300">
          {fmt(weightedTotal)}
          <span className="ml-1 text-base font-normal text-zinc-500"> / 100</span>
        </p>
      </section>

      {/* 四項目拆解 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          四項拆解
        </h2>
        <div className="flex flex-col gap-4">
          {itemRows.map((it) => {
            const selfPct = it.self !== null ? (it.self / it.max) * 100 : 0;
            const wPct = it.weighted !== null ? (it.weighted / it.max) * 100 : 0;
            return (
              <div key={it.key}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {it.label}
                  </span>
                  <span className="text-xs text-zinc-500">/ {it.max}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-blue-700 dark:text-blue-300">自評</span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                      <div
                        className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
                        style={{ width: `${selfPct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-bold text-blue-700 dark:text-blue-300">
                      {fmt(it.self)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-emerald-700 dark:text-emerald-300">加權</span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                        style={{ width: `${wPct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      {fmt(it.weighted)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          <span className="text-zinc-600 dark:text-zinc-400">自評總分</span>
          <span className="font-bold text-blue-700 dark:text-blue-300">
            {fmt(selfTotal)} / 100
          </span>
        </div>
      </section>

      {/* 自評備註 — 給看下屬的主管/執行長看本人寫的字 */}
      {self?.comment && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {target.name} 當月寫的備註
          </h3>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{self.comment}</p>
        </section>
      )}
    </Shell>
  );
}

function Shell({
  backHref,
  title,
  subtitle,
  children,
}: {
  backHref: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href={backHref}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回上一頁
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
