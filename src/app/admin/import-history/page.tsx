import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ImportHistoryClient } from './_components/ImportHistoryClient';

export default async function AdminImportHistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) redirect('/login');
  if (actor.status !== '在職') redirect('/');
  if (!['秘書', '會計', '超級管理員'].includes(actor.admin_role)) {
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 回首頁
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            歷史評核分數匯入
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            把過去月份的紙本評核分數匯入系統(每季一張 Excel)
          </p>
        </header>
        <ImportHistoryClient />
      </div>
    </main>
  );
}
