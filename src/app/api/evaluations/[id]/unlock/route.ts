import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildUnlockAuditNotice, sendEmail } from '@/lib/email';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { id } = await params;

  // Auth
  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有解鎖的權限', 403);
  }

  // Parse body
  let body: unknown = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const reason =
    body && typeof body === 'object' && 'reason' in body && typeof (body as { reason: unknown }).reason === 'string'
      ? (body as { reason: string }).reason.trim()
      : '';

  // Look up eval row + its period (for org check + audit email)
  const { data: evalRow } = await supabaseAdmin
    .from('evaluations')
    .select(
      'id, status, evaluatee_id, evaluator_id, evaluator_role, score_efficiency, score_quality, score_cooperation, score_attendance, evaluation_periods!inner(org_id, year, month)'
    )
    .eq('id', id)
    .maybeSingle<{
      id: string;
      status: string;
      evaluatee_id: string;
      evaluator_id: string;
      evaluator_role: '自評' | '主管' | '執行長';
      score_efficiency: number | null;
      score_quality: number | null;
      score_cooperation: number | null;
      score_attendance: number | null;
      evaluation_periods: { org_id: string; year: number; month: number };
    }>();
  if (!evalRow) return bad('找不到評核紀錄', 404);

  // 秘書 only allowed to unlock own org; 超管 cross-org
  if (actor.admin_role === '秘書' && evalRow.evaluation_periods.org_id !== actor.org_id) {
    return bad('秘書只能解鎖自家公司的評核', 403);
  }

  if (evalRow.status !== '已填') {
    return bad(`這筆評核狀態是「${evalRow.status}」,不需要解鎖`, 409);
  }

  const now = new Date().toISOString();

  // Update row → '已解鎖' + unlocked metadata
  const { error: updateErr } = await supabaseAdmin
    .from('evaluations')
    .update({
      status: '已解鎖',
      unlocked_at: now,
      unlocked_by: actor.employee_number,
    })
    .eq('id', id);
  if (updateErr) return bad('解鎖失敗:' + updateErr.message, 500);

  // Append-only log
  const { error: logErr } = await supabaseAdmin.from('evaluation_logs').insert({
    evaluation_id: id,
    action_type: 'UNLOCK',
    actor_id: actor.employee_number,
    reason: reason || null,
    score_efficiency_before: evalRow.score_efficiency,
    score_quality_before: evalRow.score_quality,
    score_cooperation_before: evalRow.score_cooperation,
    score_attendance_before: evalRow.score_attendance,
    status_before: '已填',
    status_after: '已解鎖',
  });
  if (logErr) {
    console.error('evaluation_logs insert failed:', logErr.message);
  }

  // 動作審計通知:寄 email 給所有秘書 + 超管(Becca's add 2026-05-13,規格 §6.2 補強)
  await sendAuditEmails(
    actor.name,
    actor.org_id,
    evalRow.evaluatee_id,
    evalRow.evaluator_id,
    evalRow.evaluator_role,
    evalRow.evaluation_periods.year,
    evalRow.evaluation_periods.month,
    reason || null
  ).catch((e) => console.error('[unlock] audit email failed:', e));

  return NextResponse.json({ ok: true });
}

// 寄 email 通知所有秘書 / 超管 — 動作備份用。失敗不擋解鎖成功。
async function sendAuditEmails(
  actorName: string,
  actorOrgId: string,
  evaluateeId: string,
  evaluatorId: string,
  evaluatorRole: '自評' | '主管' | '執行長',
  year: number,
  month: number,
  reason: string | null
): Promise<void> {
  // 找姓名
  const { data: relatedEmps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name')
    .in('employee_number', [evaluateeId, evaluatorId]);
  const nameMap = new Map((relatedEmps ?? []).map((e) => [e.employee_number, e.name]));
  const evaluateeName = nameMap.get(evaluateeId) ?? evaluateeId;
  const evaluatorName = nameMap.get(evaluatorId) ?? evaluatorId;

  // 找所有秘書 + 超管(限同 org;超管跨 org 也只通知自己 org 的同事 — keep it simple)
  const { data: admins } = await supabaseAdmin
    .from('employees')
    .select('company_email')
    .eq('org_id', actorOrgId)
    .in('admin_role', ['秘書', '超級管理員'])
    .eq('status', '在職');

  const emails = (admins ?? [])
    .map((a) => a.company_email)
    .filter((v): v is string => !!v);

  if (emails.length === 0) return;

  const mail = buildUnlockAuditNotice({
    actorName,
    evaluateeName,
    evaluatorName,
    evaluatorRole,
    year,
    month,
    reason,
  });

  await Promise.allSettled(
    emails.map((to) =>
      sendEmail({ to, ...mail }).catch((e) =>
        console.error('[unlock] email to', to, 'failed:', e)
      )
    )
  );
}
