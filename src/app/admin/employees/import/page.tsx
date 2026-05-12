import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ImportClient } from './_components/ImportClient';

export default async function ImportEmployeesPage() {
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/admin/employees"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回員工列表
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Excel 批次匯入員工
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            適用情境:初始建置、新公司加入。單筆新增請走「+ 新增員工」。
          </p>
        </header>

        <ImportClient canSetAdminRole={canSetAdminRole} />
      </div>
    </main>
  );
}
