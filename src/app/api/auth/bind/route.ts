import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getPendingBind,
  setSession,
  clearPendingBind,
} from '@/lib/session';

function back(request: Request, error: string) {
  const url = new URL('/login/bind', request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const pending = await getPendingBind();
  if (!pending) {
    return NextResponse.redirect(new URL('/login', request.url), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const raw = formData.get('employee_number');
  const employee_number = String(raw ?? '').trim().toUpperCase();

  if (!employee_number) {
    return back(request, '請輸入員工編號');
  }

  // Look up employee
  const { data: emp, error: lookupErr } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, line_user_id, status')
    .eq('employee_number', employee_number)
    .maybeSingle();

  if (lookupErr) {
    return back(request, '查詢失敗:' + lookupErr.message);
  }
  if (!emp) {
    return back(request, '找不到這個員工編號,請確認後再試');
  }
  if (emp.status !== '在職') {
    return back(request, '這個員工已停用,無法綁定。請聯絡秘書。');
  }
  if (emp.line_user_id) {
    if (emp.line_user_id === pending.line_user_id) {
      // Same LINE — just log in
      await setSession({
        employee_number,
        line_user_id: pending.line_user_id,
      });
      await clearPendingBind();
      return NextResponse.redirect(new URL('/', request.url), { status: 303 });
    }
    return back(
      request,
      '這個員工編號已經綁定其他 LINE 帳號。如果你換了手機,請聯絡秘書處理。'
    );
  }

  // Bind: update employees.line_user_id
  const { error: updateErr } = await supabaseAdmin
    .from('employees')
    .update({ line_user_id: pending.line_user_id })
    .eq('employee_number', employee_number);

  if (updateErr) {
    return back(request, '綁定失敗:' + updateErr.message);
  }

  // Record in line_binding_history (best effort — don't block login on failure)
  await supabaseAdmin.from('line_binding_history').insert({
    employee_id: employee_number,
    line_user_id: pending.line_user_id,
    binding_action: '首次綁定',
    executed_by: employee_number,
    reason: '首次登入自助綁定',
  });

  // Set session, clear pending, go home
  await setSession({
    employee_number,
    line_user_id: pending.line_user_id,
  });
  await clearPendingBind();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
