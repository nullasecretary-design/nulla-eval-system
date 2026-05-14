import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { nowInTaipei } from '@/lib/date';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CountdownTier = 'not-started' | 'safe' | 'warning' | 'urgent' | 'closed';

function describeCountdown(deadline: Date): {
  tier: Exclude<CountdownTier, 'not-started'>;
  label: string;
} {
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs <= 0) {
    return { tier: 'closed', label: '已截止' };
  }
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;

  let tier: Exclude<CountdownTier, 'not-started' | 'closed'>;
  if (diffDays >= 7) tier = 'safe';
  else if (diffDays >= 3) tier = 'warning';
  else tier = 'urgent';

  const label =
    diffDays > 0
      ? `距截止還有 ${diffDays} 天 ${remHours} 小時`
      : `距截止還有 ${diffHours} 小時`;

  return { tier, label };
}

const tierStyles: Record<CountdownTier, { ring: string; chip: string; text: string }> = {
  'not-started': {
    ring: 'border-sky-200 dark:border-sky-900/40',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-300',
  },
  safe: {
    ring: 'border-sky-200 dark:border-sky-900/40',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-300',
  },
  warning: {
    ring: 'border-amber-300 dark:border-amber-900/50',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  urgent: {
    ring: 'border-red-300 dark:border-red-900/50',
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    text: 'text-red-700 dark:text-red-300',
  },
  closed: {
    ring: 'border-zinc-300 dark:border-zinc-700',
    chip: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Logged-in employee
  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title, position, admin_role, org_id')
    .eq('employee_number', session.employee_number)
    .single();

  if (!emp) redirect('/login');

  // Current month's evaluation period (per the user's org)
  const { year, month } = nowInTaipei();

  const { data: period } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status, deadline_at, year, month')
    .eq('org_id', emp.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  // Progress for the logged-in user (count rows where they are evaluator)
  let progress: { done: number; total: number } | null = null;
  if (period && period.status === '進行中') {
    const { data: myEvals } = await supabaseAdmin
      .from('evaluations')
      .select('status')
      .eq('period_id', period.id)
      .eq('evaluator_id', emp.employee_number);

    const total = myEvals?.length ?? 0;
    const done = myEvals?.filter((e) => e.status === '已填').length ?? 0;
    progress = { total, done };
  }

  // History: 算過去有幾個月有評核(以月為單位,不是 row 數)
  const { data: historyRows } = await supabaseAdmin
    .from('evaluations')
    .select('evaluation_periods!inner(year, month)')
    .eq('evaluatee_id', emp.employee_number)
    .eq('status', '已填')
    .returns<{ evaluation_periods: { year: number; month: number } }[]>();
  const historyMonthSet = new Set(
    (historyRows ?? []).map(
      (r) => `${r.evaluation_periods.year}-${r.evaluation_periods.month}`
    )
  );
  const historyCount = historyMonthSet.size;

  // ---------- Card A logic ----------
  let cardATier: CountdownTier;
  let cardATopLabel: string;
  let cardAMainLabel: string;
  let cardAProgress: string | null = null;

  if (!period || period.status === '待啟動') {
    cardATier = 'not-started';
    cardATopLabel = `${year} 年 ${month} 月`;
    cardAMainLabel = '本月評核尚未啟動';
    cardAProgress = '等待秘書按下「啟動本月評核」';
  } else if (period.status === '已截止') {
    cardATier = 'closed';
    cardATopLabel = `${year} 年 ${month} 月`;
    cardAMainLabel = '已截止';
    cardAProgress = progress
      ? `最後狀態:已完成 ${progress.done}/${progress.total}`
      : null;
  } else {
    // 進行中
    const cd = describeCountdown(new Date(period.deadline_at!));
    cardATier = cd.tier;
    cardATopLabel = `${year} 年 ${month} 月`;
    cardAMainLabel = cd.label;
    if (progress) {
      if (progress.total === 0) {
        cardAProgress = '本月沒有您需要填的評核';
      } else if (emp.position === '一般員工') {
        cardAProgress =
          progress.done >= progress.total ? '✓ 已完成' : '尚未填寫';
      } else {
        cardAProgress = `已完成 ${progress.done}/${progress.total} 人`;
      }
    }
  }

  const aStyle = tierStyles[cardATier];

  const isAdmin =
    emp.admin_role === '秘書' || emp.admin_role === '超級管理員';
  const canViewReports =
    emp.position === '執行長' ||
    emp.admin_role === '超級管理員' ||
    emp.admin_role === '會計';
  // 規格 §10:執行長 也能看評核進度(自家)
  const canViewEvalAdmin = isAdmin || emp.position === '執行長';
  // 歷史匯入:秘書 / 會計 / 超管
  const canImportHistory =
    emp.admin_role === '秘書' ||
    emp.admin_role === '會計' ||
    emp.admin_role === '超級管理員';

  // 本月還沒啟動的時候,Card A 退化成資訊卡(不可點),
  // 啟動表單移到 /admin/evaluations 那邊去做
  const notStarted = !period || period.status === '待啟動';

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Hello, Nulla
          </h1>
          <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
            績效評核系統
          </p>
        </div>

        {/* User info */}
        <header className="flex items-start justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="text-left">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {emp.name}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {emp.department} · {emp.job_title}
              {emp.admin_role && emp.admin_role !== '無' && (
                <span className="ml-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  {emp.admin_role}
                </span>
              )}
            </p>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              登出
            </button>
          </form>
        </header>

        {/* Card A: 本月評核 — 沒啟動時退化成資訊卡(不可點) */}
        {notStarted ? (
          <div
            className={`block rounded-2xl border-2 ${aStyle.ring} bg-white/80 p-6 shadow-sm backdrop-blur dark:bg-zinc-900/60`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                本月評核
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${aStyle.chip}`}
              >
                {cardATopLabel}
              </span>
            </div>
            <p className={`mt-4 text-2xl font-bold ${aStyle.text}`}>
              {cardAMainLabel}
            </p>
            {isAdmin ? (
              <Link
                href="/admin/evaluations"
                className="mt-3 inline-block text-sm font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300"
              >
                去評核管理啟動 →
              </Link>
            ) : (
              cardAProgress && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {cardAProgress}
                </p>
              )
            )}
          </div>
        ) : (
          <Link
            href="/evaluations/me"
            className={`block rounded-2xl border-2 ${aStyle.ring} bg-white/80 p-6 shadow-sm backdrop-blur transition hover:shadow-md hover:bg-white dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                本月評核
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${aStyle.chip}`}
              >
                {cardATopLabel}
              </span>
            </div>
            <p className={`mt-4 text-2xl font-bold ${aStyle.text}`}>
              {cardAMainLabel}
            </p>
            {cardAProgress && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {cardAProgress}
              </p>
            )}
          </Link>
        )}

        {/* Card B: 歷史紀錄 */}
        <Link
          href="/history"
          className="block rounded-2xl border-2 border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              歷史紀錄
            </h2>
          </div>
          <p className="mt-4 text-2xl font-bold text-zinc-700 dark:text-zinc-300">
            {historyCount > 0 ? `過去 ${historyCount} 個月` : '尚無紀錄'}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {historyCount > 0
              ? '點擊查看每月、每季的詳細分數'
              : '完成第一次評核後,你的歷史紀錄會出現在這'}
          </p>
        </Link>

        {/* 後台入口 */}
        {canViewEvalAdmin && (
          <Link
            href="/admin/evaluations"
            className="block rounded-2xl border-2 border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              評核管理
              {isAdmin && (
                <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                  (秘書專用)
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {isAdmin
                ? '啟動本月評核流程、看全公司評核進度、解鎖'
                : '看全公司評核進度'}
            </p>
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/admin/employees"
            className="block rounded-2xl border-2 border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              員工管理
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                (秘書專用)
              </span>
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              新增、編輯、停用員工
            </p>
          </Link>
        )}
        {canViewReports && (
          <Link
            href="/admin/reports"
            className="block rounded-2xl border-2 border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              季度報表
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                (會計專用)
              </span>
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              看每季加權分數、下載 CSV
            </p>
          </Link>
        )}
        {canImportHistory && (
          <Link
            href="/admin/import-history"
            className="block rounded-2xl border-2 border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              歷史匯入
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                (秘書 / 會計專用)
              </span>
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              把過去紙本月份的評核分數一次匯入(每季一張 Excel)
            </p>
          </Link>
        )}

        {/* Footer note */}
        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-600">
          員工編號 {emp.employee_number}
        </p>
      </div>
    </main>
  );
}
