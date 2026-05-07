import { redirect } from 'next/navigation';
import { getPendingBind } from '@/lib/session';

type SearchParams = Promise<{ error?: string }>;

export default async function BindPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pending = await getPendingBind();
  if (!pending) {
    redirect('/login');
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-50 to-zinc-200 px-6 text-center dark:from-zinc-900 dark:to-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        歡迎,{pending.line_display_name}
      </h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        第一次登入,請輸入你的員工編號完成綁定。
        <br />
        綁定後以後直接用 LINE 登入就好。
      </p>

      <form
        action="/api/auth/bind"
        method="POST"
        className="mt-4 flex w-full max-w-xs flex-col gap-3"
      >
        <input
          name="employee_number"
          placeholder="例如:NULLA0011"
          required
          autoFocus
          autoComplete="off"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-lg uppercase tracking-wider text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-emerald-700 active:bg-emerald-800"
        >
          完成綁定
        </button>
      </form>

      <p className="mt-6 text-xs text-zinc-500">
        員工編號不知道?請聯絡公司秘書。
      </p>
    </main>
  );
}
