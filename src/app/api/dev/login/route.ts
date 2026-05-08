// TEMPORARY DEV LOGIN — DO NOT COMMIT
// Hit GET /api/dev/login?as=NULLA0001&to=/evaluations/me
import { NextResponse } from 'next/server';
import { setSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('disabled in prod', { status: 403 });
  }
  const url = new URL(request.url);
  const employee_number = (url.searchParams.get('as') ?? '').toUpperCase().trim();
  const to = url.searchParams.get('to') ?? '/';
  if (!employee_number) return new NextResponse('?as= required', { status: 400 });

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('employee_number, line_user_id')
    .eq('employee_number', employee_number)
    .maybeSingle();
  if (!emp) return new NextResponse('not found', { status: 404 });

  await setSession({
    employee_number,
    line_user_id: emp.line_user_id ?? `dev-${employee_number}`,
  });
  return NextResponse.redirect(new URL(to, request.url), { status: 303 });
}
