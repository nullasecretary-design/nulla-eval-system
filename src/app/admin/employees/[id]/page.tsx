import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EmployeeForm, type ManagerOption } from '../_components/EmployeeForm';
import { UnbindLineSection } from '../_components/UnbindLineSection';

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employeeNumber = decodeURIComponent(id);

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

  const canSetAdminRole = actor.admin_role === '超級管理員';

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select(
      'employee_number, name, org_id, department, job_title, position, admin_role, manager_id, company_email, status, hired_at, left_at, line_user_id'
    )
    .eq('employee_number', employeeNumber)
    .maybeSingle();

  if (!emp) {
    return (
      <Shell title="找不到員工">
        <p className="text-zinc-600 dark:text-zinc-400">
          編號 {employeeNumber} 不存在。
        </p>
      </Shell>
    );
  }

  // 秘書 只能編輯自家公司
  if (actor.admin_role === '秘書' && emp.org_id !== actor.org_id) {
    redirect('/admin/employees');
  }

  // 主管候選人 — 同 org、在職、職位是「主管」(直屬執行長 = 不選任何人)
  const { data: managerCandidates } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name')
    .eq('org_id', emp.org_id)
    .eq('status', '在職')
    .eq('position', '主管')
    .order('employee_number', { ascending: true });
  const managers: ManagerOption[] = managerCandidates ?? [];

  // LINE 解綁權限:秘書 不能解高權限者(會計 / 執行長 / 超管),超管 都可以
  const targetIsHighPriv =
    emp.position === '執行長' ||
    emp.admin_role === '會計' ||
    emp.admin_role === '超級管理員';
  const canUnbindLine = canSetAdminRole || !targetIsHighPriv;
  const disabledReason = !canUnbindLine
    ? '高權限者(會計 / 執行長 / 超管)只能由超級管理員解綁'
    : undefined;

  return (
    <Shell title={`編輯:${emp.name}`} subtitle={emp.employee_number}>
      <EmployeeForm
        mode="edit"
        initial={{
          employee_number: emp.employee_number,
          name: emp.name,
          department: emp.department,
          job_title: emp.job_title,
          position: emp.position,
          manager_id: emp.manager_id,
          company_email: emp.company_email ?? '',
          admin_role: emp.admin_role,
          hired_at: emp.hired_at,
          status: emp.status,
          left_at: emp.left_at,
        }}
        managers={managers}
        canSetAdminRole={canSetAdminRole}
      />
      <UnbindLineSection
        employeeNumber={emp.employee_number}
        employeeName={emp.name}
        hasLine={!!emp.line_user_id}
        canUnbind={canUnbindLine}
        disabledReason={disabledReason}
      />
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/admin/employees"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回員工列表
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
