import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateTimeTW, nowInTaipei } from '@/lib/date';
import { ActivationForm } from '@/app/_components/ActivationForm';
import { CompletedSection } from './_components/CompletedSection';
import { RemindButton } from './_components/RemindButton';

type Role = '自評' | '主管' | '執行長';
type Status = '待填' | '已填' | '已解鎖' | '逾期未填' | '作廢';

type EvalRow = {
  id: string;
  evaluator_role: Role;
  evaluator_id: string;
  evaluatee_id: string;
  status: Status;
  filled_at: string | null;
  last_modified_at: string | null;
  unlocked_at: string | null;
};

const ROLES: Role[] = ['自評', '主管', '執行長'];

const ROLE_STYLE: Record<Role, { tag: string; chip: string; ring: string }> = {
  自評: {
    tag: 'text-blue-700 dark:text-blue-300',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    ring: 'border-blue-200 dark:border-blue-900/40',
  },
  主管: {
    tag: 'text-purple-700 dark:text-purple-300',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    ring: 'border-purple-200 dark:border-purple-900/40',
  },
  執行長: {
    tag: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    ring: 'border-emerald-200 dark:border-emerald-900/40',
  },
};

// 時間格式化用 @/lib/date 的 formatDateTimeTW(統一台北時區)。

export default async function AdminEvaluationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, position, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  // 規格 §10:秘書 / 超管 / 執行長 都能看評核進度(自家)
  const isEvalAdmin =
    actor.admin_role === '秘書' ||
    actor.admin_role === '超級管理員' ||
    actor.position === '執行長';
  if (!isEvalAdmin) redirect('/');
  // 但「解鎖」只給秘書 + 超管,執行長 沒有(規格 §10)
  const canUnlock =
    actor.admin_role === '秘書' || actor.admin_role === '超級管理員';

  const { year, month } = nowInTaipei();

  const { data: period } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status, deadline_at')
    .eq('org_id', actor.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  // 沒 row(月初 cron 還沒跑)或已建檔但「待啟動」(月初 cron 已建)→ 都顯示啟動表單
  if (!period || period.status === '待啟動') {
    // 預設截止 = 本月最後一天 23:59
    const lastDay = new Date(year, month, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDeadline = `${year}-${pad(month)}-${pad(lastDay)}T23:59`;

    const subtitle = period
      ? `${year} 年 ${month} 月 · 待啟動`
      : `${year} 年 ${month} 月`;

    return (
      <Shell title="評核管理" subtitle={subtitle}>
        {canUnlock ? (
          // 秘書 / 超管 → 直接顯示啟動表單
          <ActivationForm
            initialDeadlineLocal={defaultDeadline}
            year={year}
            month={month}
          />
        ) : (
          // 執行長 → 沒啟動權限,只能等
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-zinc-600 dark:text-zinc-400">
              本月評核尚未啟動,等待秘書啟動。
            </p>
          </div>
        )}
      </Shell>
    );
  }

  const { data: rows } = await supabaseAdmin
    .from('evaluations')
    .select(
      'id, evaluator_role, evaluator_id, evaluatee_id, status, filled_at, last_modified_at, unlocked_at'
    )
    .eq('period_id', period.id)
    .returns<EvalRow[]>();

  const evals: EvalRow[] = rows ?? [];

  // 抓所有相關員工的姓名
  const ids = Array.from(
    new Set(evals.flatMap((r) => [r.evaluator_id, r.evaluatee_id]))
  );
  const { data: emps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name')
    .in('employee_number', ids);
  const nameMap = new Map<string, string>(
    (emps ?? []).map((e) => [e.employee_number, e.name])
  );
  const nameOf = (id: string) => nameMap.get(id) ?? id;

  // 進度卡:每個 role 的 X/Y
  const progress = ROLES.map((role) => {
    const roleRows = evals.filter((r) => r.evaluator_role === role);
    const done = roleRows.filter((r) => r.status === '已填').length;
    return { role, done, total: roleRows.length };
  });

  // 未完成(待填 / 已解鎖 / 逾期未填)
  const pendingRows = evals
    .filter(
      (r) =>
        r.status === '待填' ||
        r.status === '已解鎖' ||
        r.status === '逾期未填'
    )
    .sort((a, b) =>
      a.evaluator_role === b.evaluator_role
        ? a.evaluatee_id.localeCompare(b.evaluatee_id)
        : ROLES.indexOf(a.evaluator_role) - ROLES.indexOf(b.evaluator_role)
    );

  // 已完成
  const doneRows = evals
    .filter((r) => r.status === '已填')
    .sort((a, b) =>
      (b.filled_at ?? '').localeCompare(a.filled_at ?? '')
    );

  return (
    <Shell
      title="評核管理"
      subtitle={`${year} 年 ${month} 月 · ${
        period.status === '進行中' ? '進行中' : period.status
      } · 截止 ${formatDateTimeTW(period.deadline_at)}`}
    >
      {/* 三張進度卡 */}
      <div className="grid grid-cols-3 gap-3">
        {progress.map((p) => {
          const s = ROLE_STYLE[p.role];
          const allDone = p.total > 0 && p.done === p.total;
          return (
            <div
              key={p.role}
              className={`rounded-xl border-2 ${s.ring} bg-white/80 p-4 text-center shadow-sm dark:bg-zinc-900/60`}
            >
              <div className={`text-xs font-medium ${s.tag}`}>{p.role}</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {p.done}
                <span className="text-base text-zinc-500"> / {p.total}</span>
              </div>
              {allDone && (
                <div className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ 全完成
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 未完成名單 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            未完成({pendingRows.length} 件)
          </h2>
          {canUnlock && pendingRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <RemindButton mode="non-ceo" label="一鍵催繳全員(不含執行長)" />
              <RemindButton
                mode="ceo-only"
                label="提醒執行長"
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
              />
            </div>
          )}
        </div>
        {pendingRows.length === 0 ? (
          <p className="rounded-md bg-emerald-50 px-3 py-3 text-center text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            ✓ 本月所有評核都完成了
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {pendingRows.map((r) => {
              const s = ROLE_STYLE[r.evaluator_role];
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${s.chip}`}>
                        {r.evaluator_role}
                      </span>
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {nameOf(r.evaluatee_id)}
                      </span>
                      {r.status === '已解鎖' && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          已解鎖待重填
                        </span>
                      )}
                    </div>
                    {r.evaluator_role !== '自評' && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        評核人:{nameOf(r.evaluator_id)}
                      </p>
                    )}
                  </div>
                  {canUnlock && (
                    <RemindButton
                      mode="one"
                      evaluatorId={r.evaluator_id}
                      evaluationId={r.id}
                      label={`提醒 ${nameOf(r.evaluator_id)}`}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 已完成名單(預設收合) */}
      <CompletedSection
        canUnlock={canUnlock}
        rows={doneRows.map((r) => ({
          id: r.id,
          role: r.evaluator_role,
          evaluatee: nameOf(r.evaluatee_id),
          evaluator: nameOf(r.evaluator_id),
          filledAt: formatDateTimeTW(r.filled_at),
        }))}
      />

      {canUnlock && (
        <div className="text-right">
          <Link
            href="/admin/unlocks"
            className="text-sm text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
          >
            解鎖紀錄 →
          </Link>
        </div>
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
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回首頁
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
