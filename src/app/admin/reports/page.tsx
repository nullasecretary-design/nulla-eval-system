import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canViewReports } from './_lib/quarter';

type Quarter = { year: number; quarter: 1 | 2 | 3 | 4; monthsHave: number[] };

export default async function ReportsListPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, position, admin_role, status, org_id')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  if (!canViewReports(actor)) redirect('/');

  // 找出這家組織所有有資料的 (year, quarter)
  const { data: periods } = await supabaseAdmin
    .from('evaluation_periods')
    .select('year, month, status')
    .eq('org_id', actor.org_id)
    .in('status', ['進行中', '已截止']);

  const map = new Map<string, Quarter>();
  for (const p of periods ?? []) {
    const q = Math.ceil(p.month / 3) as 1 | 2 | 3 | 4;
    const key = `${p.year}-Q${q}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { year: p.year, quarter: q, monthsHave: [] };
      map.set(key, entry);
    }
    entry.monthsHave.push(p.month);
  }
  const quarters = Array.from(map.values()).sort((a, b) =>
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
            季度報表
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            點下面任一季度看主表
          </p>
        </header>

        {quarters.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-zinc-600 dark:text-zinc-400">尚無報表資料。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {quarters.map((q) => {
              const monthRange = q.monthsHave
                .sort((a, b) => a - b)
                .map((m) => `${m} 月`)
                .join('·');
              const isComplete = q.monthsHave.length === 3;
              return (
                <Link
                  key={`${q.year}-Q${q.quarter}`}
                  href={`/admin/reports/${q.year}/${q.quarter}`}
                  className="block rounded-xl border-2 border-zinc-200 bg-white/80 p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-sky-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                        {q.year} Q{q.quarter}
                      </h3>
                      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {monthRange}
                      </p>
                    </div>
                    {!isComplete && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        部分月份
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
