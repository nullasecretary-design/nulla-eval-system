import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifyAdminRoleChange } from '@/lib/admin-role-audit';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

const POSITIONS = ['一般員工', '主管', '執行長'] as const;
const ADMIN_ROLES = ['無', '秘書', '會計', '超級管理員'] as const;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有新增員工的權限', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');
  const b = body as Record<string, unknown>;

  const employee_number = typeof b.employee_number === 'string' ? b.employee_number.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const department = typeof b.department === 'string' ? b.department.trim() : '';
  const job_title = typeof b.job_title === 'string' ? b.job_title.trim() : '';
  const position = typeof b.position === 'string' ? b.position : '';
  const manager_id = typeof b.manager_id === 'string' && b.manager_id ? b.manager_id : null;
  const company_email = typeof b.company_email === 'string' && b.company_email ? b.company_email.trim() : null;
  const hired_at = typeof b.hired_at === 'string' ? b.hired_at : '';

  if (!employee_number) return bad('員工編號必填');
  if (!name) return bad('姓名必填');
  if (!department) return bad('部門必填');
  if (!job_title) return bad('職務必填');
  if (!POSITIONS.includes(position as (typeof POSITIONS)[number])) return bad('職位不合法');
  if (!hired_at || !/^\d{4}-\d{2}-\d{2}$/.test(hired_at)) return bad('到職日格式錯誤');

  // admin_role:秘書 強制為「無」;超管 才能設定
  let admin_role: (typeof ADMIN_ROLES)[number] = '無';
  if (actor.admin_role === '超級管理員') {
    if (b.admin_role !== undefined) {
      if (!ADMIN_ROLES.includes(b.admin_role as (typeof ADMIN_ROLES)[number])) {
        return bad('管理者身分不合法');
      }
      admin_role = b.admin_role as (typeof ADMIN_ROLES)[number];
    }
  }

  // 檢查員工編號是否已存在
  const { data: existing } = await supabaseAdmin
    .from('employees')
    .select('employee_number')
    .eq('employee_number', employee_number)
    .maybeSingle();
  if (existing) return bad(`員工編號 ${employee_number} 已存在`, 409);

  // 檢查 manager_id(若有指定):必須存在且同 org
  if (manager_id) {
    const { data: mgr } = await supabaseAdmin
      .from('employees')
      .select('employee_number, org_id')
      .eq('employee_number', manager_id)
      .maybeSingle();
    if (!mgr) return bad('指定的主管不存在');
    if (mgr.org_id !== actor.org_id) return bad('主管必須與員工同公司');
  }

  const { error: insertErr } = await supabaseAdmin.from('employees').insert({
    employee_number,
    name,
    org_id: actor.org_id,
    department,
    job_title,
    position,
    admin_role,
    manager_id,
    company_email,
    status: '在職',
    hired_at,
  });
  if (insertErr) return bad('建立失敗:' + insertErr.message, 500);

  // spec §9.1:管理者身分有設(非「無」)時寄通知給所有超管
  if (admin_role !== '無') {
    await notifyAdminRoleChange({
      actorName: actor.name,
      orgId: actor.org_id,
      targetName: name,
      targetEmpNum: employee_number,
      before: '(新建立)',
      after: admin_role,
    }).catch((e) => console.error('[employees POST] role change notify failed:', e));
  }

  return NextResponse.json({ ok: true, employee_number });
}
