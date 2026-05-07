import { supabase } from '@/lib/supabase';

export default async function Home() {
  const { count, error } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-50 to-zinc-200 px-6 text-center dark:from-zinc-900 dark:to-black">
      <h1 className="text-6xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Hello, Nulla
      </h1>
      <p className="text-3xl text-zinc-600 dark:text-zinc-400">
        績效評核系統
      </p>

      <div className="mt-8 rounded-lg border border-zinc-300 bg-white/60 p-6 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">
          Supabase 連線測試
        </p>
        {error ? (
          <p className="text-red-600 dark:text-red-400">
            ❌ 連線失敗:{error.message}
          </p>
        ) : (
          <>
            <p className="text-emerald-700 dark:text-emerald-400">
              ✅ 連線成功
            </p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              匿名身分目前可看到 <strong>{count ?? 0}</strong> 位員工
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              (預期 0 — 因為還沒登入,RLS 把資料擋住了,代表門鎖有作用)
            </p>
          </>
        )}
      </div>
    </main>
  );
}
