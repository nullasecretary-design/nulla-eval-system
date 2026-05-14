import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildReminderNotice, sendEmail } from '@/lib/email';
import { buildReminderLine, pushLine } from '@/lib/line';
import { nowInTaipei } from '@/lib/date';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

type PendingRow = {
  evaluator_id: string;
  evaluator_role: '自評' | '主管' | '執行長';
  evaluatee_id: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有寄催繳的權限', 403);
  }

  let body: unknown = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const bodyObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const evaluatorId =
    typeof bodyObj.evaluatorId === 'string' ? bodyObj.evaluatorId : null;
  // evaluationId 有傳 = 只提醒這一筆 row(不列該 evaluator 其他未完成項目)
  const evaluationId =
    typeof bodyObj.evaluationId === 'string' ? bodyObj.evaluationId : null;
  // scope:'non-ceo' = 全員不含執行長 / 'ceo-only' = 只執行長 / 預設 = 全部
  const scope =
    bodyObj.scope === 'non-ceo' || bodyObj.scope === 'ceo-only'
      ? (bodyObj.scope as 'non-ceo' | 'ceo-only')
      : null;

  // 本月 period
  const { year, month } = nowInTaipei();

  const { data: period } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, year, month')
    .eq('org_id', actor.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!period) return bad('本月評核尚未啟動', 409);

  // 抓所有未完成的評核
  let query = supabaseAdmin
    .from('evaluations')
    .select('evaluator_id, evaluator_role, evaluatee_id')
    .eq('period_id', period.id)
    .in('status', ['待填', '已解鎖', '逾期未填']);

  if (evaluationId) {
    // 精準提醒單一筆 row(列表上某一行的提醒按鈕)
    query = query.eq('id', evaluationId);
  } else if (evaluatorId) {
    query = query.eq('evaluator_id', evaluatorId);
  } else if (scope === 'non-ceo') {
    // 全員不含執行長:CEO 評核 row 的 evaluator_role 一定是「執行長」
    query = query.neq('evaluator_role', '執行長');
  } else if (scope === 'ceo-only') {
    query = query.eq('evaluator_role', '執行長');
  }

  const { data: rows } = await query.returns<PendingRow[]>();
  const pending = rows ?? [];

  if (pending.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, message: '沒有未完成項目' });
  }

  // 抓所有相關員工的名字 + email
  const ids = Array.from(
    new Set(pending.flatMap((r) => [r.evaluator_id, r.evaluatee_id]))
  );
  const { data: emps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, company_email, line_user_id')
    .in('employee_number', ids);
  const empMap = new Map(
    (emps ?? []).map((e) => [
      e.employee_number,
      {
        name: e.name,
        email: e.company_email as string | null,
        line: e.line_user_id as string | null,
      },
    ])
  );

  // 依 evaluator_id 分組,把每個 evaluator 未完成的 items 列成可讀字串
  const groups = new Map<string, PendingRow[]>();
  for (const r of pending) {
    const arr = groups.get(r.evaluator_id) ?? [];
    arr.push(r);
    groups.set(r.evaluator_id, arr);
  }

  // sent_email / sent_line 分開計;一個人可能只有一條成功
  let emailSent = 0;
  let emailFailed = 0;
  let lineSent = 0;
  let lineFailed = 0;
  let skippedNoChannel = 0; // 兩條都沒得寄(無 email 又無 LINE)

  for (const [evaluatorId2, items] of groups) {
    const evaluator = empMap.get(evaluatorId2);
    if (!evaluator) continue;

    if (!evaluator.email && !evaluator.line) {
      skippedNoChannel++;
      console.warn(`[remind] ${evaluator.name} 無 email 也無 LINE,略過`);
      continue;
    }

    const pendingItems = items.map((r) => {
      const eeName = empMap.get(r.evaluatee_id)?.name ?? r.evaluatee_id;
      if (r.evaluator_role === '自評') return '自評(填自己)';
      if (r.evaluator_role === '主管') return `主管評(對 ${eeName})`;
      return `執行長評(對 ${eeName})`;
    });

    if (evaluator.email) {
      const mail = buildReminderNotice({
        recipientName: evaluator.name,
        year: period.year,
        month: period.month,
        pendingItems,
      });
      const ok = await sendEmail({ to: evaluator.email, ...mail });
      if (ok) emailSent++;
      else emailFailed++;
    }
    if (evaluator.line) {
      const text = buildReminderLine({
        recipientName: evaluator.name,
        year: period.year,
        month: period.month,
        pendingItems,
      });
      const ok = await pushLine({ to: evaluator.line, text });
      if (ok) lineSent++;
      else lineFailed++;
    }
  }

  return NextResponse.json({
    emailSent,
    emailFailed,
    lineSent,
    lineFailed,
    skipped: skippedNoChannel,
    total_evaluators: groups.size,
    // 為了相容前端原本看 sent / failed 欄位,給個合計
    sent: emailSent + lineSent,
    failed: emailFailed + lineFailed,
  });
}
