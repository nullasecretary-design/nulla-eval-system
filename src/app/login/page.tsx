export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-50 to-zinc-200 px-6 text-center dark:from-zinc-900 dark:to-black">
      <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Nulla 績效評核系統
      </h1>
      <p className="text-xl text-zinc-600 dark:text-zinc-400">
        請使用 LINE 登入
      </p>

      <a
        href="/api/auth/line/start"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#06C755] px-8 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-[#05B249] active:bg-[#04A040]"
      >
        使用 LINE 登入
      </a>

      <p className="mt-8 text-xs text-zinc-500">
        第一次登入會請你輸入員工編號完成綁定
      </p>
    </main>
  );
}
