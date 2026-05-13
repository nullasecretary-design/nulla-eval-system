import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifyAdminRoleChange } from '@/lib/admin-role-audit';

// Excel 匯入不允許「執行長」「超級管理員」— 要建那種人請走單筆新增
const POSITIONS_IMPORT = ['一般員工', '主管'] as const;
const ADMIN_ROLES_IMPORT = ['無', '秘書', '會計'] as const;

type IncomingRow = {
  rowNum: number;
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  position: string;
  manager_id: string | null;
  company_email: string | null;
  admin_role?: string;
  hired_at: string;
};

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

function jsonRowErrors(message: string, rowErrors: { rowNum: number; message: string }[]) {
  return NextResponse.json({ message, rowErrors }, { status: 422 });
}

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
    return bad('沒有匯入員工的權限', 403);
  }

  const canSetAdminRole = actor.admin_role === '超級管理員';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');
  const raw = (body as { rows?: unknown }).rows;
  if (!Array.isArray(raw) || raw.length === 0) return bad('沒有要匯入的資料');

  const rows: IncomingRow[] = raw as IncomingRow[];

  // ---- 逐列基本驗證 ----
  const rowErrors: { rowNum: number; message: string }[] = [];
  const seenNumbers = new Set<string>();

  for (const r of rows) {
    const num = r.rowNum;
    if (!r.employee_number) {
      rowErrors.push({ rowNum: num, message: '員工編號必填' });
      continue;
    }
    if (seenNumbers.has(r.employee_number)) {
      rowErrors.push({ rowNum: num, message: `員工編號 ${r.employee_number} 在此次匯入裡重複` });
      continue;
    }
    seenNumbers.add(r.employee_number);

    if (!r.name) rowErrors.push({ rowNum: num, message: '姓名必填' });
    if (!r.department) rowErrors.push({ rowNum: num, message: '部門必填' });
    if (!r.job_title) rowErrors.push({ rowNum: num, message: '職務必填' });
    if (!POSITIONS_IMPORT.includes(r.position as (typeof POSITIONS_IMPORT)[number])) {
      rowErrors.push({
        rowNum: num,
        message:
          r.position === '執行長'
            ? '執行長不能用 Excel 匯入,請用單筆新增'
            : `職位「${r.position}」不合法(只能填 一般員工 / 主管)`,
      });
    }
    // 秘書 收到 admin_role 直接擋(明確權限不足)
    if (!canSetAdminRole && r.admin_role && r.admin_role !== '無') {
      rowErrors.push({
        rowNum: num,
        message: '權限不足:只有超級管理員可以設定管理者身分',
      });
    }
    if (canSetAdminRole && r.admin_role !== undefined) {
      if (!ADMIN_ROLES_IMPORT.includes(r.admin_role as (typeof ADMIN_ROLES_IMPORT)[number])) {
        rowErrors.push({
          rowNum: num,
          message:
            r.admin_role === '超級管理員'
              ? '超級管理員不能用 Excel 匯入,請用單筆新增'
              : `管理者身分「${r.admin_role}」不合法(只能填 秘書 / 會計,留空=無)`,
        });
      }
    }
    if (!r.hired_at || !/^\d{4}-\d{2}-\d{2}$/.test(r.hired_at)) {
      rowErrors.push({ rowNum: num, message: '到職日格式錯誤(應為 YYYY-MM-DD)' });
    }
    if (r.manager_id && r.manager_id === r.employee_number) {
      rowErrors.push({ rowNum: num, message: '主管不能是自己' });
    }
  }

  if (rowErrors.length > 0) {
    return jsonRowErrors('部分資料有問題,無法匯入', rowErrors);
  }

  const employeeNumbers = rows.map((r) => r.employee_number);

  // ---- 編號是否已存在於 DB ----
  const { data: existing } = await supabaseAdmin
    .from('employees')
    .select('employee_number')
    .in('employee_number', employeeNumbers);
  const existingSet = new Set((existing ?? []).map((e) => e.employee_number));
  for (const r of rows) {
    if (existingSet.has(r.employee_number)) {
      rowErrors.push({
        rowNum: r.rowNum,
        message: `員工編號 ${r.employee_number} 已存在於系統`,
      });
    }
  }
  if (rowErrors.length > 0) {
    return jsonRowErrors('部分資料有問題,無法匯入', rowErrors);
  }

  // ---- 主管編號驗證:必須已存在於系統且同 org ----
  const managerIds = Array.from(
    new Set(rows.map((r) => r.manager_id).filter((v): v is string => !!v))
  );
  const managerInfo = new Map<string, { org_id: string }>();
  if (managerIds.length > 0) {
    const { data: mgrs } = await supabaseAdmin
      .from('employees')
      .select('employee_number, org_id')
      .in('employee_number', managerIds);
    for (const m of mgrs ?? []) {
      managerInfo.set(m.employee_number, { org_id: m.org_id });
    }
  }

  for (const r of rows) {
    if (!r.manager_id) continue;
    const info = managerInfo.get(r.manager_id);
    if (!info) {
      rowErrors.push({
        rowNum: r.rowNum,
        message: `主管 ${r.manager_id} 不存在於系統`,
      });
    } else if (info.org_id !== actor.org_id) {
      rowErrors.push({
        rowNum: r.rowNum,
        message: `主管 ${r.manager_id} 不在自家公司`,
      });
    }
  }
  if (rowErrors.length > 0) {
    return jsonRowErrors('部分資料有問題,無法匯入', rowErrors);
  }

  // ---- 全部 OK,組 insert payload ----
  const inserts = rows.map((r) => ({
    employee_number: r.employee_number,
    name: r.name,
    org_id: actor.org_id,
    department: r.department,
    job_title: r.job_title,
    position: r.position,
    admin_role: canSetAdminRole && r.admin_role ? r.admin_role : '無',
    manager_id: r.manager_id || null,
    company_email: r.company_email || null,
    status: '在職',
    hired_at: r.hired_at,
  }));

  const { error: insertErr } = await supabaseAdmin.from('employees').insert(inserts);
  if (insertErr) {
    return bad('匯入失敗:' + insertErr.message, 500);
  }

  // spec §9.1:批次匯入裡每個有設管理者身分(非「無」)的員工各寄一封通知給超管
  const withRole = inserts.filter((i) => i.admin_role !== '無');
  await Promise.allSettled(
    withRole.map((i) =>
      notifyAdminRoleChange({
        actorName: actor.name,
        orgId: actor.org_id,
        targetName: i.name,
        targetEmpNum: i.employee_number,
        before: '(新建立)',
        after: i.admin_role,
      })
    )
  );

  return NextResponse.json({ ok: true, inserted: inserts.length });
}
