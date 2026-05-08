export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-50 to-zinc-200 px-6 text-center dark:from-zinc-900 dark:to-black">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Hello, Nulla
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">
          績效評核系統
        </p>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
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
