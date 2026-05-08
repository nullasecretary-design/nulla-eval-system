import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  MonthlyEvalForm,
  type Section,
  type SubordinateManagerView,
  type SubordinateProfile,
  type SubordinateSelfView,
} from '../_components/MonthlyEvalForm';

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

type Status = '待填' | '已填';

type EvalRow = {
  id: string;
  evaluator_role: string;
  evaluatee_id: string;
  status: string;
  score_efficiency: number | null;
  score_quality: number | null;
  score_cooperation: number | null;
  score_attendance: number | null;
  comment: string | null;
};

function rowToScores(r: {
  score_efficiency: number | null;
  score_quality: number | null;
  score_cooperation: number | null;
  score_attendance: number | null;
}) {
  return {
    efficiency: r.score_efficiency ?? 0,
    quality: r.score_quality ?? 0,
    cooperation: r.score_cooperation ?? 0,
    attendance: r.score_attendance ?? 0,
  };
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
      <PageShell title="本月評核" subtitle={`${year} 年 ${month} 月`}>
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
      <PageShell title="本月評核" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-zinc-300 bg-white/80 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">本月評核已截止。</p>
        </div>
      </PageShell>
    );
  }

  // 我這個月要做的所有評核(自評 + 主管評)
  const { data: myEvals } = await supabaseAdmin
    .from('evaluations')
    .select(
      'id, evaluator_role, evaluatee_id, status, score_efficiency, score_quality, score_cooperation, score_attendance, comment'
    )
    .eq('period_id', period.id)
    .eq('evaluator_id', emp.employee_number)
    .order('evaluator_role')
    .order('evaluatee_id');

  if (!myEvals || myEvals.length === 0) {
    return (
      <PageShell title="本月評核" subtitle={`${year} 年 ${month} 月`}>
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-zinc-600 dark:text-zinc-400">
            本月沒有您需要填的評核。
          </p>
        </div>
      </PageShell>
    );
  }

  const selfRows = (myEvals as EvalRow[]).filter((r) => r.evaluator_role === '自評');
  const mgrRows = (myEvals as EvalRow[]).filter((r) => r.evaluator_role === '主管');
  const execRows = (myEvals as EvalRow[]).filter((r) => r.evaluator_role === '執行長');

  // 抓下屬 profile + 下屬自評 + 下屬主管評
  // 主管評卡片需要下屬自評;執行長評卡片需要下屬自評 + 下屬主管評(若有)
  const subIds = Array.from(
    new Set([...mgrRows.map((r) => r.evaluatee_id), ...execRows.map((r) => r.evaluatee_id)])
  );
  const subProfiles: SubordinateProfile[] = [];
  const subSelfMap = new Map<string, SubordinateSelfView>();
  const subMgrMap = new Map<string, SubordinateManagerView>();

  if (subIds.length > 0) {
    const [{ data: profiles }, { data: subSelfs }, { data: subMgrs }] = await Promise.all([
      supabaseAdmin
        .from('employees')
        .select('employee_number, name, department, job_title')
        .in('employee_number', subIds),
      supabaseAdmin
        .from('evaluations')
        .select(
          'evaluatee_id, status, score_efficiency, score_quality, score_cooperation, score_attendance, comment'
        )
        .eq('period_id', period.id)
        .in('evaluatee_id', subIds)
        .eq('evaluator_role', '自評'),
      supabaseAdmin
        .from('evaluations')
        .select(
          'evaluatee_id, status, score_efficiency, score_quality, score_cooperation, score_attendance, comment'
        )
        .eq('period_id', period.id)
        .in('evaluatee_id', subIds)
        .eq('evaluator_role', '主管'),
    ]);
    subProfiles.push(...((profiles ?? []) as SubordinateProfile[]));
    for (const s of subSelfs ?? []) {
      subSelfMap.set(s.evaluatee_id, {
        status: (s.status === '已填' ? '已填' : '待填') as Status,
        scores: rowToScores(s),
        comment: s.comment,
      });
    }
    for (const m of subMgrs ?? []) {
      subMgrMap.set(m.evaluatee_id, {
        status: (m.status === '已填' ? '已填' : '待填') as Status,
        scores: rowToScores(m),
        comment: m.comment,
      });
    }
  }
  const profileMap = new Map(subProfiles.map((p) => [p.employee_number, p]));

  // 拼出 sections array
  const sections: Section[] = [];

  for (const r of selfRows) {
    sections.push({
      kind: 'self',
      evalId: r.id,
      status: (r.status === '已填' ? '已填' : '待填') as Status,
      scores: rowToScores(r),
      comment: r.comment ?? '',
    });
  }

  for (const r of mgrRows) {
    const profile = profileMap.get(r.evaluatee_id);
    if (!profile) continue;
    const subSelf = subSelfMap.get(r.evaluatee_id) ?? {
      status: '待填' as Status,
      scores: { efficiency: 0, quality: 0, cooperation: 0, attendance: 0 },
      comment: null,
    };
    sections.push({
      kind: 'manager',
      evalId: r.id,
      status: (r.status === '已填' ? '已填' : '待填') as Status,
      scores: rowToScores(r),
      comment: r.comment ?? '',
      subordinate: profile,
      subordinateSelf: subSelf,
    });
  }

  for (const r of execRows) {
    const profile = profileMap.get(r.evaluatee_id);
    if (!profile) continue;
    const subSelf = subSelfMap.get(r.evaluatee_id) ?? {
      status: '待填' as Status,
      scores: { efficiency: 0, quality: 0, cooperation: 0, attendance: 0 },
      comment: null,
    };
    const subMgr = subMgrMap.get(r.evaluatee_id) ?? null;
    sections.push({
      kind: 'executive',
      evalId: r.id,
      status: (r.status === '已填' ? '已填' : '待填') as Status,
      scores: rowToScores(r),
      comment: r.comment ?? '',
      subordinate: profile,
      subordinateSelf: subSelf,
      subordinateManager: subMgr,
    });
  }

  return (
    <PageShell
      title="本月評核"
      subtitle={`${emp.name} · ${emp.department} · ${emp.job_title} · ${year} 年 ${month} 月`}
    >
      <MonthlyEvalForm initialSections={sections} />
    </PageShell>
  );
}
