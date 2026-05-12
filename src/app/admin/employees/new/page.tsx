import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EmployeeForm, type ManagerOption } from '../_components/EmployeeForm';

export default async function NewEmployeePage() {
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

  // 主管候選人 — 同 org、在職、職位是「主管」(直屬執行長 = 不選任何人)
  const { data: managerCandidates } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name')
    .eq('org_id', actor.org_id)
    .eq('status', '在職')
    .eq('position', '主管')
    .order('employee_number', { ascending: true });
  const managers: ManagerOption[] = managerCandidates ?? [];

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
            新增員工
          </h1>
        </header>

        <EmployeeForm
          mode="new"
          initial={{
            employee_number: '',
            name: '',
            department: '',
            job_title: '',
            position: '一般員工',
            manager_id: null,
            company_email: '',
            admin_role: '無',
            hired_at: todayStr,
            status: '在職',
            left_at: null,
          }}
          managers={managers}
          canSetAdminRole={canSetAdminRole}
        />
      </div>
    </main>
  );
}
