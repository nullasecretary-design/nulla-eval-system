import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  // Look up the actor
  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('你沒有啟動評核的權限', 403);
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');
  const { deadline_at } = body as { deadline_at?: unknown };
  if (typeof deadline_at !== 'string') return bad('缺少截止日');
  const deadline = new Date(deadline_at);
  if (Number.isNaN(deadline.getTime())) return bad('截止日格式不正確');
  if (deadline.getTime() <= Date.now()) return bad('截止日必須晚於現在');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 月初 cron 會建一筆 status='待啟動' 的 row。秘書啟動時:
  //   - 沒 row → INSERT 一筆 '進行中' 的 row
  //   - 有 row 且 '待啟動' → UPDATE 那筆 row 成 '進行中'
  //   - 有 row 且 '進行中' / '已截止' → 拒絕
  const { data: existing } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status')
    .eq('org_id', actor.org_id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (existing && existing.status !== '待啟動') {
    return bad(`本月評核已存在(狀態:${existing.status})`, 409);
  }

  // Pull all in-service employees of this org
  const { data: employees, error: empErr } = await supabaseAdmin
    .from('employees')
    .select('employee_number, position, admin_role, manager_id')
    .eq('org_id', actor.org_id)
    .eq('status', '在職');
  if (empErr || !employees) return bad('查詢員工失敗:' + (empErr?.message ?? ''), 500);

  const ceo = employees.find((e) => e.position === '執行長');
  if (!ceo) return bad('這家公司沒有執行長,無法啟動評核', 500);

  // Insert period(或 update 既有「待啟動」row)
  let periodId: string;
  if (existing) {
    const { error: periodErr } = await supabaseAdmin
      .from('evaluation_periods')
      .update({
        status: '進行中',
        activated_by: actor.employee_number,
        activated_at: now.toISOString(),
        deadline_at: deadline.toISOString(),
      })
      .eq('id', existing.id);
    if (periodErr) {
      return bad('啟動評核期失敗:' + periodErr.message, 500);
    }
    periodId = existing.id;
  } else {
    const { data: period, error: periodErr } = await supabaseAdmin
      .from('evaluation_periods')
      .insert({
        org_id: actor.org_id,
        year,
        month,
        status: '進行中',
        activated_by: actor.employee_number,
        activated_at: now.toISOString(),
        deadline_at: deadline.toISOString(),
      })
      .select('id')
      .single();
    if (periodErr || !period) {
      return bad('建立評核期失敗:' + (periodErr?.message ?? '未知錯誤'), 500);
    }
    periodId = period.id;
  }

  // Build the 14-row evaluation set
  // - 自評: position != 執行長, admin_role != 會計
  // - 主管: 同上 + 有主管 + 主管不是 CEO
  // - 執行長: 同上(全部會被執行長評)
  const evalRows: {
    period_id: string;
    evaluatee_id: string;
    evaluator_role: '自評' | '主管' | '執行長';
    evaluator_id: string;
    status: '待填';
  }[] = [];
  for (const e of employees) {
    if (e.position === '執行長') continue;
    if (e.admin_role === '會計') continue;
    evalRows.push({
      period_id: periodId,
      evaluatee_id: e.employee_number,
      evaluator_role: '自評',
      evaluator_id: e.employee_number,
      status: '待填',
    });
    if (e.manager_id && e.manager_id !== ceo.employee_number) {
      evalRows.push({
        period_id: periodId,
        evaluatee_id: e.employee_number,
        evaluator_role: '主管',
        evaluator_id: e.manager_id,
        status: '待填',
      });
    }
    evalRows.push({
      period_id: periodId,
      evaluatee_id: e.employee_number,
      evaluator_role: '執行長',
      evaluator_id: ceo.employee_number,
      status: '待填',
    });
  }

  const { error: evalsErr } = await supabaseAdmin.from('evaluations').insert(evalRows);
  if (evalsErr) {
    // Best-effort cleanup
    if (existing) {
      // 還原到「待啟動」
      await supabaseAdmin
        .from('evaluation_periods')
        .update({
          status: '待啟動',
          activated_by: null,
          activated_at: null,
          deadline_at: null,
        })
        .eq('id', periodId);
    } else {
      await supabaseAdmin.from('evaluation_periods').delete().eq('id', periodId);
    }
    return bad('建立評核 row 失敗:' + evalsErr.message, 500);
  }

  return NextResponse.json({
    ok: true,
    period_id: periodId,
    rows_created: evalRows.length,
  });
}
