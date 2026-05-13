import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifyAdminRoleChange } from '@/lib/admin-role-audit';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

const POSITIONS = ['一般員工', '主管', '執行長'] as const;
const ADMIN_ROLES = ['無', '秘書', '會計', '超級管理員'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { id } = await params;
  const employee_number = decodeURIComponent(id);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有編輯員工的權限', 403);
  }

  const { data: target } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, admin_role')
    .eq('employee_number', employee_number)
    .maybeSingle();
  if (!target) return bad('找不到員工', 404);

  if (actor.admin_role === '秘書' && target.org_id !== actor.org_id) {
    return bad('秘書只能編輯自家公司員工', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const department = typeof b.department === 'string' ? b.department.trim() : '';
  const job_title = typeof b.job_title === 'string' ? b.job_title.trim() : '';
  const position = typeof b.position === 'string' ? b.position : '';
  const manager_id = typeof b.manager_id === 'string' && b.manager_id ? b.manager_id : null;
  const company_email = typeof b.company_email === 'string' && b.company_email ? b.company_email.trim() : null;
  const hired_at = typeof b.hired_at === 'string' ? b.hired_at : '';

  if (!name) return bad('姓名必填');
  if (!department) return bad('部門必填');
  if (!job_title) return bad('職務必填');
  if (!POSITIONS.includes(position as (typeof POSITIONS)[number])) return bad('職位不合法');
  if (!hired_at || !/^\d{4}-\d{2}-\d{2}$/.test(hired_at)) return bad('到職日格式錯誤');

  // 主管不能是自己
  if (manager_id === employee_number) {
    return bad('員工不能是自己的主管');
  }
  if (manager_id) {
    const { data: mgr } = await supabaseAdmin
      .from('employees')
      .select('employee_number, org_id')
      .eq('employee_number', manager_id)
      .maybeSingle();
    if (!mgr) return bad('指定的主管不存在');
    if (mgr.org_id !== target.org_id) return bad('主管必須與員工同公司');
  }

  const update: Record<string, unknown> = {
    name,
    department,
    job_title,
    position,
    manager_id,
    company_email,
    hired_at,
  };

  // 只有超管能改 admin_role(秘書即使送來也忽略 — 防內部威脅)
  if (actor.admin_role === '超級管理員' && b.admin_role !== undefined) {
    if (!ADMIN_ROLES.includes(b.admin_role as (typeof ADMIN_ROLES)[number])) {
      return bad('管理者身分不合法');
    }
    update.admin_role = b.admin_role;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('employees')
    .update(update)
    .eq('employee_number', employee_number);
  if (updateErr) return bad('儲存失敗:' + updateErr.message, 500);

  // spec §9.1:管理者身分有變更時寄通知給所有超管
  if (update.admin_role !== undefined && update.admin_role !== target.admin_role) {
    await notifyAdminRoleChange({
      actorName: actor.name,
      orgId: target.org_id,
      targetName: name, // PATCH 也可能改名,用送進來的新名
      targetEmpNum: target.employee_number,
      before: target.admin_role,
      after: String(update.admin_role),
    }).catch((e) => console.error('[employees PATCH] role change notify failed:', e));
  }

  return NextResponse.json({ ok: true });
}
