import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

// spec §4.4:後台代解綁
//   - 秘書:同公司一般員工 / 主管(不能解高權限者)
//   - 超管:任何人
// 解綁 = employees.line_user_id 設 NULL + 寫一筆 line_binding_history
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { id } = await params;
  const targetEmpNum = decodeURIComponent(id);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有解綁的權限', 403);
  }

  const isSuper = actor.admin_role === '超級管理員';

  const { data: target } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, position, admin_role, line_user_id')
    .eq('employee_number', targetEmpNum)
    .maybeSingle();
  if (!target) return bad('找不到目標員工', 404);

  // 秘書權限檢查
  if (!isSuper) {
    if (target.org_id !== actor.org_id) {
      return bad('只能解綁自家公司員工', 403);
    }
    // 不能解高權限者(會計、超管,或執行長職位)
    const targetIsHighPriv =
      target.position === '執行長' ||
      target.admin_role === '會計' ||
      target.admin_role === '超級管理員';
    if (targetIsHighPriv) {
      return bad(
        '高權限者(會計 / 執行長 / 超管)只能由超級管理員解綁',
        403
      );
    }
  }

  if (!target.line_user_id) {
    return bad('這位員工目前沒有綁 LINE,不需要解綁', 409);
  }

  // 解綁:把 line_user_id 設 NULL
  const { error: updErr } = await supabaseAdmin
    .from('employees')
    .update({ line_user_id: null })
    .eq('employee_number', target.employee_number);
  if (updErr) return bad('解綁失敗:' + updErr.message, 500);

  // 寫 line_binding_history(留痕,規格 §4.4)
  const { error: histErr } = await supabaseAdmin
    .from('line_binding_history')
    .insert({
      employee_id: target.employee_number,
      line_user_id: target.line_user_id, // 解綁前的 LINE ID(歷史快照)
      binding_action: '解綁',
      executed_by: actor.employee_number,
      approved_by: actor.employee_number,
      reason: '後台代解綁(spec §4.4)',
    });
  if (histErr) {
    // 不阻擋解綁成功,只 log
    console.error('[unbind-line] history insert failed:', histErr.message);
  }

  return NextResponse.json({ ok: true, target_name: target.name });
}
