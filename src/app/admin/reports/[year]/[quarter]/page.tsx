import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  canViewReports,
  loadQuarter,
  quarterMonths,
  type EmployeeRow,
} from '../../_lib/quarter';
import { nowInTaipei } from '@/lib/date';

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(1);
}

export default async function QuarterReportPage({
  params,
}: {
  params: Promise<{ year: string; quarter: string }>;
}) {
  const { year: yearStr, quarter: quarterStr } = await params;
  const year = Number(yearStr);
  const quarter = Number(quarterStr) as 1 | 2 | 3 | 4;

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
      <Shell title="網址有誤">
        <p className="text-zinc-600 dark:text-zinc-400">找不到對應的季度。</p>
      </Shell>
    );
  }

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', actor.org_id)
    .single();

  const data = await loadQuarter(actor.org_id, year, quarter);
  if (!data || data.rows.length === 0) {
    return (
      <Shell
        title={`${year} Q${quarter}`}
        subtitle={`${org?.name ?? '本公司'} · 無報表資料`}
      >
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">這個季度尚無評核資料。</p>
        </div>
      </Shell>
    );
  }

  const months = quarterMonths(quarter);
  const missingCount = data.rows.filter((r) => r.hasMissing).length;

  const { year: today_y, month: tm, day: td } = nowInTaipei();
  const today_m = String(tm).padStart(2, '0');
  const today_d = String(td).padStart(2, '0');

  return (
    <Shell
      title={`${year} Q${quarter}`}
      subtitle={`${org?.name ?? '本公司'} · 產出於 ${today_y}/${today_m}/${today_d}`}
    >
      {/* 摘要 + 下載 */}
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-xl border-2 border-amber-200 bg-white/80 px-4 py-3 dark:border-amber-900/40 dark:bg-zinc-900/60">
          <div className="text-xs text-amber-700/80 dark:text-amber-300/80">缺評提醒</div>
          <div className="mt-0.5 text-xl font-bold text-amber-700 dark:text-amber-300">
            {missingCount > 0 ? `${missingCount} 位` : '無'}
          </div>
        </div>
        <a
          href={`/api/admin/reports/${year}/${quarter}/csv`}
          className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50"
        >
          ⬇ 下載 CSV
        </a>
      </div>

      {/* 主表 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          員工列表({data.rows.length} 人)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="pb-2 pr-2 font-medium">姓名</th>
                {months.map((m) => (
                  <th key={m} className="pb-2 px-2 text-right font-medium">
                    {m} 月
                  </th>
                ))}
                <th className="pb-2 pl-2 text-right font-medium">季度平均</th>
                <th className="pb-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <RowDisplay
                  key={r.employee_number}
                  r={r}
                  year={year}
                  quarter={quarter}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-500">
          *表示該季有月份缺評,只計入有評核的月份。
        </p>
      </section>
    </Shell>
  );
}

function RowDisplay({
  r,
  year,
  quarter,
}: {
  r: EmployeeRow;
  year: number;
  quarter: number;
}) {
  return (
    <tr className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/40">
      <td className="py-2 pr-2">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</div>
        <div className="text-[10px] text-zinc-500">{r.department}</div>
      </td>
      {r.monthly.map((m) => (
        <td key={m.month} className="py-2 px-2 text-right tabular-nums">
          <span
            className={
              m.weightedTotal === null
                ? 'text-zinc-400'
                : 'text-zinc-800 dark:text-zinc-200'
            }
          >
            {fmt(m.weightedTotal)}
          </span>
        </td>
      ))}
      <td className="py-2 pl-2 text-right tabular-nums">
        {r.quarterAvg === null ? (
          <span className="text-zinc-400">無資料</span>
        ) : (
          <span className="font-bold text-emerald-700 dark:text-emerald-300">
            {fmt(r.quarterAvg)}
            {r.hasMissing && <span className="ml-0.5">*</span>}
          </span>
        )}
      </td>
      <td className="py-2 pl-2 text-right">
        <Link
          href={`/admin/reports/${year}/${quarter}/${r.employee_number}`}
          className="text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300"
        >
          詳細 →
        </Link>
      </td>
    </tr>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/admin/reports"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回報表列表
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
