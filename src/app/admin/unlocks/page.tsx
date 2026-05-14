import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateTimeTW } from '@/lib/date';

type Role = '自評' | '主管' | '執行長';

const ROLE_CHIP: Record<Role, string> = {
  自評: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  主管: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  執行長: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

type UnlockLogRow = {
  id: string;
  actor_id: string;
  reason: string | null;
  created_at: string;
  evaluations: {
    evaluatee_id: string;
    evaluator_role: Role;
    evaluation_periods: {
      org_id: string;
      year: number;
      month: number;
    };
  };
};

// 時間格式化用 @/lib/date 的 formatDateTimeTW(統一台北時區)。

export default async function UnlocksPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  // 規格 §10:解鎖權限給 秘書 + 超管,所以解鎖紀錄也只給這兩種角色看
  if (actor.admin_role !== '秘書' && actor.admin_role !== '超級管理員') {
    redirect('/');
  }

  const isSuperAdmin = actor.admin_role === '超級管理員';

  // 抓所有解鎖 log,帶上對應的評核 row 跟期別
  let query = supabaseAdmin
    .from('evaluation_logs')
    .select(
      `
      id,
      actor_id,
      reason,
      created_at,
      evaluations!inner (
        evaluatee_id,
        evaluator_role,
        evaluation_periods!inner (
          org_id,
          year,
          month
        )
      )
      `
    )
    .eq('action_type', 'UNLOCK')
    .order('created_at', { ascending: false });

  // 秘書 只看自家;超管 看全部
  if (!isSuperAdmin) {
    query = query.eq('evaluations.evaluation_periods.org_id', actor.org_id);
  }

  const { data: rawLogs } = await query.returns<UnlockLogRow[]>();
  const logs = rawLogs ?? [];

  // 把所有 actor / evaluatee 編號收齊,一次查名字
  const allEmpIds = new Set<string>();
  for (const l of logs) {
    allEmpIds.add(l.actor_id);
    allEmpIds.add(l.evaluations.evaluatee_id);
  }
  const { data: emps } = allEmpIds.size
    ? await supabaseAdmin
        .from('employees')
        .select('employee_number, name')
        .in('employee_number', Array.from(allEmpIds))
    : { data: [] };
  const nameOf = new Map<string, string>(
    (emps ?? []).map((e) => [e.employee_number, e.name])
  );
  const name = (id: string) => nameOf.get(id) ?? id;

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/admin/evaluations"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回評核管理
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            解鎖紀錄
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isSuperAdmin
              ? `共 ${logs.length} 筆(跨公司全部)`
              : `共 ${logs.length} 筆(自家公司)`}
          </p>
        </header>

        {logs.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-zinc-600 dark:text-zinc-400">尚無解鎖紀錄。</p>
          </div>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {logs.map((l) => {
                const e = l.evaluations;
                const period = e.evaluation_periods;
                return (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${ROLE_CHIP[e.evaluator_role]}`}
                      >
                        {e.evaluator_role}
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {name(e.evaluatee_id)}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        · {period.year} 年 {period.month} 月
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateTimeTW(l.created_at)} · 解鎖人:{name(l.actor_id)}
                    </p>
                    {l.reason && (
                      <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        原因:{l.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
