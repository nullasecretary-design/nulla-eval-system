import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { HistoryTimeline } from '../../_components/HistoryTimeline';
import { canViewHistoryOf, loadEmployeeHistory } from '../../_lib/load-history';

export default async function HistoryOfEmployeePage({
  params,
}: {
  params: Promise<{ empNum: string }>;
}) {
  const { empNum } = await params;
  const target_number = decodeURIComponent(empNum);

  const session = await getSession();
  if (!session) redirect('/login');

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
      <Shell title="找不到員工">
        <p className="text-zinc-600 dark:text-zinc-400">編號 {target_number} 不存在。</p>
      </Shell>
    );
  }

  if (!canViewHistoryOf(viewer, target)) {
    redirect('/history');
  }

  const basePath = `/history/of/${encodeURIComponent(target.employee_number)}`;
  const quarters = await loadEmployeeHistory(target.employee_number);

  return (
    <Shell
      title={`${target.name} 的歷史紀錄`}
      subtitle={`${target.department} · ${target.job_title}${target.status === '已停用' ? ' · 已停用' : ''}`}
    >
      {quarters.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">
            尚無紀錄。第一次評核完成後就會出現。
          </p>
        </div>
      ) : (
        <HistoryTimeline quarters={quarters} basePath={basePath} />
      )}
    </Shell>
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/history"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回歷史紀錄
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
