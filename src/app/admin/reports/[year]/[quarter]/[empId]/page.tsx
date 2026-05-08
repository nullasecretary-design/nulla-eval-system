import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  canViewReports,
  loadQuarter,
  ITEMS,
  totalOf,
  weightedItemForMonth,
  type ItemKey,
  type EmployeeRow,
  type MonthData,
} from '../../../_lib/quarter';

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(1);
}

export default async function EmployeeQuarterDetailPage({
  params,
}: {
  params: Promise<{ year: string; quarter: string; empId: string }>;
}) {
  const { year: yearStr, quarter: quarterStr, empId } = await params;
  const year = Number(yearStr);
  const quarter = Number(quarterStr) as 1 | 2 | 3 | 4;
  const employeeNumber = decodeURIComponent(empId).toUpperCase();

  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, position, admin_role, status, org_id')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  if (!canViewReports(actor)) redirect('/');

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(quarter) ||
    quarter < 1 ||
    quarter > 4
  ) {
    return (
      <Shell title="網址有誤" backHref={`/admin/reports`}>
        <p className="text-zinc-600 dark:text-zinc-400">找不到對應的季度。</p>
      </Shell>
    );
  }

  const data = await loadQuarter(actor.org_id, year, quarter);
  const row: EmployeeRow | undefined = data?.rows.find(
    (r) => r.employee_number === employeeNumber
  );

  const backHref = `/admin/reports/${year}/${quarter}`;

  if (!row) {
    return (
      <Shell title="找不到員工" backHref={backHref}>
        <p className="text-zinc-600 dark:text-zinc-400">
          該員工該季度沒有評核資料。
        </p>
      </Shell>
    );
  }

  // 該員工是否有主管(從第一個有資料的月份判斷;若都沒主管 row,視為直屬執行長)
  const hasManager = row.monthly.some((m) => m.evals.mgr !== null);

  // 四項目的季度平均(用「該員工每月加權後」的均值)
  const itemAverages = ITEMS.map((it) => {
    const vals = row.monthly
      .map((m) => weightedItemForMonth(m.evals, it.key, hasManager))
      .filter((v): v is number => v !== null);
    const avg =
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...it, avg };
  });

  return (
    <Shell
      title={row.name}
      subtitle={`${row.department} · ${row.job_title} · ${year} Q${quarter}`}
      backHref={backHref}
    >
      {/* 季度總分 */}
      <section className="rounded-2xl border-2 border-emerald-200 bg-white/80 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/60">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-emerald-700/80 dark:text-emerald-300/80">
            季度總分(三個月加權平均)
          </h2>
          <span className="text-xs text-zinc-500">
            {hasManager ? '主管 70% + 執行長 30%' : '執行長 100%'}
          </span>
        </div>
        <p className="mt-2 text-4xl font-bold text-emerald-700 dark:text-emerald-300">
          {fmt(row.quarterAvg)}
          {row.hasMissing && <span className="ml-1 text-2xl">*</span>}
          <span className="ml-1 text-base font-normal text-zinc-500"> / 100</span>
        </p>
        {row.hasMissing && (
          <p className="mt-1 text-xs text-zinc-500">
            *該季有月份缺評,只計入有評核的月份
          </p>
        )}
      </section>

      {/* 月拆解 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          每月拆解
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="pb-2 pr-2 font-medium">月份</th>
                <th className="pb-2 px-2 text-right font-medium text-blue-700/80 dark:text-blue-300/80">
                  自評
                </th>
                {hasManager && (
                  <th className="pb-2 px-2 text-right font-medium text-purple-700/80 dark:text-purple-300/80">
                    主管(70%)
                  </th>
                )}
                <th className="pb-2 px-2 text-right font-medium text-emerald-700/80 dark:text-emerald-300/80">
                  執行長{hasManager ? '(30%)' : '(100%)'}
                </th>
                <th className="pb-2 px-2 text-right font-medium text-emerald-700 dark:text-emerald-300">
                  加權結果
                </th>
                {hasManager && (
                  <th className="pb-2 pl-2 text-right font-medium">主/執行長落差</th>
                )}
              </tr>
            </thead>
            <tbody>
              {row.monthly.map((m) => (
                <MonthRow key={m.month} m={m} hasManager={hasManager} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 四項目平均 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          四項目季度平均(加權後)
        </h2>
        <div className="flex flex-col gap-3">
          {itemAverages.map((it) => {
            const pct = it.avg !== null ? (it.avg / it.max) * 100 : 0;
            return (
              <div key={it.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {it.label}
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {fmt(it.avg)} / {it.max}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                  <div
                    className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}

function MonthRow({ m, hasManager }: { m: MonthData; hasManager: boolean }) {
  const selfTotal = m.selfTotal;
  const mgrTotal = totalOf(m.evals.mgr);
  const ceoTotal = totalOf(m.evals.ceo);
  const gap =
    mgrTotal !== null && ceoTotal !== null
      ? Math.abs(mgrTotal - ceoTotal)
      : null;
  const gapAlert = gap !== null && gap >= 10;

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-900">
      <td className="py-2 pr-2 font-medium text-zinc-800 dark:text-zinc-200">
        {m.month} 月
      </td>
      <td className="py-2 px-2 text-right tabular-nums text-blue-700 dark:text-blue-300">
        {fmt(selfTotal)}
      </td>
      {hasManager && (
        <td className="py-2 px-2 text-right tabular-nums text-purple-700 dark:text-purple-300">
          {fmt(mgrTotal)}
        </td>
      )}
      <td className="py-2 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
        {fmt(ceoTotal)}
      </td>
      <td className="py-2 px-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
        {fmt(m.weightedTotal)}
      </td>
      {hasManager && (
        <td
          className={`py-2 pl-2 text-right tabular-nums ${
            gapAlert
              ? 'rounded-md bg-amber-100 font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              : 'text-zinc-600 dark:text-zinc-400'
          }`}
        >
          {fmt(gap)}
        </td>
      )}
    </tr>
  );
}

function Shell({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href={backHref}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回主表
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
