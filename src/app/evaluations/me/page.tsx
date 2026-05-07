import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SelfEvalForm } from '../_components/SelfEvalForm';

const ITEMS = [
  { key: 'score_efficiency', label: '工作時效', max: 30 },
  { key: 'score_quality', label: '工作品質', max: 25 },
  { key: 'score_cooperation', label: '工作配合度', max: 25 },
  { key: 'score_attendance', label: '出勤狀況', max: 20 },
] as const;

function PageShell({
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回首頁
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}

export default async function MyEvalPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title, org_id')
    .eq('employee_number', session.employee_number)
    .single();

  if (!emp) redirect('/login');

  // Find current month evaluation period
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: period } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status')
    .eq('org_id', emp.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (!period || period.status === '待啟動') {
    return (
      <PageShell title="本月自評" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-sky-200 bg-white/80 p-6 text-center dark:border-sky-900/40 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">
            本月評核尚未啟動,等待秘書按下「啟動本月評核」。
          </p>
        </div>
      </PageShell>
    );
  }

  if (period.status === '已截止') {
    return (
      <PageShell title="本月自評" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-zinc-300 bg-white/80 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">本月評核已截止。</p>
        </div>
      </PageShell>
    );
  }

  // Find self-eval row
  const { data: selfEval } = await supabaseAdmin
    .from('evaluations')
    .select(
      'id, status, score_efficiency, score_quality, score_cooperation, score_attendance, comment, filled_at'
    )
    .eq('period_id', period.id)
    .eq('evaluatee_id', emp.employee_number)
    .eq('evaluator_role', '自評')
    .maybeSingle();

  if (!selfEval) {
    return (
      <PageShell title="本月自評" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-red-200 bg-white/80 p-6 text-center dark:border-red-900/40 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">
            找不到你的自評紀錄。請聯絡秘書確認。
          </p>
        </div>
      </PageShell>
    );
  }

  if (selfEval.status === '已填') {
    const total = ITEMS.reduce(
      (sum, it) => sum + (selfEval[it.key] ?? 0),
      0
    );
    return (
      <PageShell
        title={`${emp.name} - 自評`}
        subtitle={`${emp.department} · ${emp.job_title} · ${year} 年 ${month} 月`}
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
          ✓ 已完成,送出後不可修改
        </div>

        {ITEMS.map((item) => {
          const score = selfEval[item.key] ?? 0;
          const pct = (score / item.max) * 100;
          return (
            <div
              key={item.key}
              className="rounded-xl border border-blue-200 bg-white/80 p-4 dark:border-blue-900/40 dark:bg-zinc-900/60"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                  {item.label}
                </span>
                <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                  {score} / {item.max}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                <div
                  className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-blue-600 px-5 py-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-wider opacity-80">
              總計
            </span>
            <span className="text-3xl font-bold">
              {total} / 100
            </span>
          </div>
        </div>

        {selfEval.comment && (
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              備註
            </p>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {selfEval.comment}
            </p>
          </div>
        )}
      </PageShell>
    );
  }

  if (selfEval.status !== '待填') {
    return (
      <PageShell title="本月自評" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-zinc-300 bg-white/80 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">
            這筆評核狀態是「{selfEval.status}」,目前無法填寫。
          </p>
        </div>
      </PageShell>
    );
  }

  // status = '待填' — render the form
  return (
    <PageShell
      title={`${emp.name} - 自評`}
      subtitle={`${emp.department} · ${emp.job_title} · ${year} 年 ${month} 月`}
    >
      <SelfEvalForm
        evalId={selfEval.id}
        initialComment={selfEval.comment ?? ''}
      />
    </PageShell>
  );
}
