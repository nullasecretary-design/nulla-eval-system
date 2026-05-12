import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EmployeeListClient } from './_components/EmployeeListClient';

type AdminRole = '無' | '秘書' | '會計' | '超級管理員';
type Position = '一般員工' | '主管' | '執行長';
type Status = '在職' | '已停用';

export type EmployeeRow = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  position: Position;
  admin_role: AdminRole;
  manager_id: string | null;
  manager_name: string | null;
  status: Status;
};

export default async function AdminEmployeesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  if (actor.admin_role !== '秘書' && actor.admin_role !== '超級管理員') {
    redirect('/');
  }

  const isSuperAdmin = actor.admin_role === '超級管理員';

  // 秘書 只看自家;超管看全部
  let query = supabaseAdmin
    .from('employees')
    .select('employee_number, name, department, job_title, position, admin_role, manager_id, status')
    .order('status', { ascending: true })
    .order('employee_number', { ascending: true });
  if (!isSuperAdmin) {
    query = query.eq('org_id', actor.org_id);
  }
  const { data: emps } = await query;
  const employees = emps ?? [];

  // 主管姓名
  const managerIds = Array.from(
    new Set(employees.map((e) => e.manager_id).filter((v): v is string => !!v))
  );
  const { data: mgrs } = managerIds.length
    ? await supabaseAdmin
        .from('employees')
        .select('employee_number, name')
        .in('employee_number', managerIds)
    : { data: [] };
  const nameMap = new Map<string, string>(
    (mgrs ?? []).map((m) => [m.employee_number, m.name])
  );

  const rows: EmployeeRow[] = employees.map((e) => ({
    employee_number: e.employee_number,
    name: e.name,
    department: e.department,
    job_title: e.job_title,
    position: e.position as Position,
    admin_role: e.admin_role as AdminRole,
    manager_id: e.manager_id,
    manager_name: e.manager_id ? nameMap.get(e.manager_id) ?? null : null,
    status: e.status as Status,
  }));

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <header className="flex items-end justify-between gap-3">
          <div>
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ← 回首頁
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              員工管理
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              共 {rows.length} 人
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/employees/import"
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"
            >
              ⬇ Excel 匯入
            </Link>
            <Link
              href="/admin/employees/new"
              className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              + 新增員工
            </Link>
          </div>
        </header>

        <EmployeeListClient rows={rows} showAdminRole={isSuperAdmin} />
      </div>
    </main>
  );
}
