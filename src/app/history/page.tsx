import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { HistoryTimeline } from './_components/HistoryTimeline';
import { loadEmployeeHistory } from './_lib/load-history';

type TeamMember = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  status: '在職' | '已停用';
};

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title, position, admin_role, org_id')
    .eq('employee_number', session.employee_number)
    .single();
  if (!emp) redirect('/login');

  const quarters = await loadEmployeeHistory(emp.employee_number);

  // 誰能看誰的歷史:
  // - 執行長 / 超管 → 全公司
  // - 其他人 → 看實際上歸你管的下屬(查 manager_id,不看職位欄位)
  const isCEO = emp.position === '執行長';
  const isSuperAdmin = emp.admin_role === '超級管理員';
  const showCompany = isCEO || isSuperAdmin;

  let team: TeamMember[] = [];
  let teamLabel = '';

  if (showCompany) {
    const { data: members } = await supabaseAdmin
      .from('employees')
      .select('employee_number, name, department, job_title, status')
      .eq('org_id', emp.org_id)
      .neq('employee_number', emp.employee_number)
      .order('status', { ascending: true })
      .order('employee_number', { ascending: true });
    team = (members ?? []) as TeamMember[];
    teamLabel = '全公司歷史';
  } else {
    const { data: members } = await supabaseAdmin
      .from('employees')
      .select('employee_number, name, department, job_title, status')
      .eq('org_id', emp.org_id)
      .eq('manager_id', emp.employee_number)
      .order('status', { ascending: true })
      .order('employee_number', { ascending: true });
    team = (members ?? []) as TeamMember[];
    teamLabel = '下屬歷史';
  }

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
              {isCEO
                ? '執行長不參與被評核,沒有自己的紀錄。'
                : '尚無紀錄。完成第一次評核後,過去的分數會出現在這。'}
            </p>
          </div>
        ) : (
          <HistoryTimeline quarters={quarters} />
        )}

        {/* 下屬 / 全公司 清單 */}
        {team.length > 0 && (
          <section className="mt-2 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {teamLabel}
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {team.length} 人
              </span>
            </h2>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {team.map((m) => (
                <li key={m.employee_number}>
                  <Link
                    href={`/history/of/${encodeURIComponent(m.employee_number)}`}
                    className="flex items-center justify-between gap-3 px-2 py-2.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {m.name}
                        </span>
                        {m.status === '已停用' && (
                          <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            已停用
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {m.department} · {m.job_title}
                      </p>
                    </div>
                    <span className="text-zinc-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
