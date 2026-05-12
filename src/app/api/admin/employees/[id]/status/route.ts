import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
  const employee_number = decodeURIComponent(id);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有變更狀態的權限', 403);
  }

  const { data: target } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, status')
    .eq('employee_number', employee_number)
    .maybeSingle();
  if (!target) return bad('找不到員工', 404);

  if (actor.admin_role === '秘書' && target.org_id !== actor.org_id) {
    return bad('秘書只能變更自家公司員工', 403);
  }

  // 不能停用自己(避免把自己鎖在系統外)
  if (employee_number === actor.employee_number) {
    return bad('不能變更自己的狀態');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');
  const next = (body as { status?: unknown }).status;
  if (next !== '在職' && next !== '已停用') return bad('狀態值不合法');
  if (next === target.status) return bad(`此員工已是「${next}」狀態`, 409);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const update =
    next === '已停用'
      ? { status: '已停用', left_at: todayStr }
      : { status: '在職', left_at: null };

  const { error: updateErr } = await supabaseAdmin
    .from('employees')
    .update(update)
    .eq('employee_number', employee_number);
  if (updateErr) return bad('狀態變更失敗:' + updateErr.message, 500);

  return NextResponse.json({ ok: true });
}
