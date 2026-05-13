'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  employeeNumber: string;
  employeeName: string;
  hasLine: boolean;
  canUnbind: boolean; // false 時顯示禁止原因
  disabledReason?: string;
};

export function UnbindLineSection({
  employeeNumber,
  employeeName,
  hasLine,
  canUnbind,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function unbind() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeNumber)}/unbind-line`,
        { method: 'POST' }
      );
      if (!res.ok) {
        setError((await res.text()) || '解綁失敗');
        setSubmitting(false);
        return;
      }
      setDone(true);
      setShowConfirm(false);
      setSubmitting(false);
      // refresh page so 「目前未綁定」狀態顯示出來
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '解綁失敗');
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-2 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        LINE 綁定狀態
      </h2>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          {hasLine ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ 已綁定
              </span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                員工目前用某個 LINE 帳號登入這個系統
              </span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-block rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                — 未綁定
              </span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                員工下次登入時會走「首次綁定」流程
              </span>
            </p>
          )}
        </div>

        {hasLine && canUnbind && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            解除 LINE 綁定
          </button>
        )}
      </div>

      {hasLine && !canUnbind && disabledReason && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {disabledReason}
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        什麼時候會用到:員工換手機、LINE 帳號被盜、或要換 LINE 登入這個系統。解除後員工下次點 LINE 登入,系統會問員工編號重新綁定。
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {done && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ 已解除 {employeeName} 的 LINE 綁定。請通知他/她下次登入要重新輸入員工編號。
        </p>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
          >
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              解除 {employeeName} 的 LINE 綁定?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              解除後該員工目前那個 LINE 帳號**不能**再登入系統。
              他/她下次登入時會走「首次綁定」流程,系統會請他輸入員工編號重新綁。
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
              這個動作會被記錄(誰解、何時、為什麼),不會消失。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                再想一下
              </button>
              <button
                type="button"
                onClick={unbind}
                disabled={submitting}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? '解綁中⋯' : '確認解綁'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
