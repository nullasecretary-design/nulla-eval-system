import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('name, department, job_title, position, admin_role, org_id')
    .eq('employee_number', session.employee_number)
    .single();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-50 to-zinc-200 px-6 text-center dark:from-zinc-900 dark:to-black">
      <h1 className="text-6xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Hello, Nulla
      </h1>
      <p className="text-3xl text-zinc-600 dark:text-zinc-400">績效評核系統</p>

      <div className="mt-8 rounded-lg border border-zinc-300 bg-white/70 p-6 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="mb-3 text-base font-semibold text-zinc-700 dark:text-zinc-300">
          歡迎,{emp?.name ?? session.employee_number}
        </p>
        <div className="space-y-1 text-zinc-600 dark:text-zinc-400">
          <p>員工編號:{session.employee_number}</p>
          <p>部門:{emp?.department ?? '—'}</p>
          <p>職務:{emp?.job_title ?? '—'}</p>
          <p>職位:{emp?.position ?? '—'}</p>
          {emp?.admin_role && emp.admin_role !== '無' && (
            <p>管理者身分:{emp.admin_role}</p>
          )}
        </div>
      </div>

      <form action="/api/auth/logout" method="POST" className="mt-4">
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          登出
        </button>
      </form>
    </main>
  );
}
