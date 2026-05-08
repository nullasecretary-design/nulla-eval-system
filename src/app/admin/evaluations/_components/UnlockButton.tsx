'use client';

import { useState } from 'react';

export function UnlockButton({
  evaluationId,
  evaluateeName,
  role,
}: {
  evaluationId: string;
  evaluateeName: string;
  role: '自評' | '主管' | '執行長';
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel =
    role === '自評' ? '自評' : role === '主管' ? '主管評' : '執行長評';

  async function unlock() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || '解鎖失敗');
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '解鎖失敗');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
      >
        解鎖
      </button>
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
              確認解鎖?
            </h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {evaluateeName} 的{roleLabel}會從「已填」變回可填寫。
              這次動作會永久留紀錄。
            </p>
            <div className="mt-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                原因(選填)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="例:分數打錯、員工要求改"
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                再想一下
              </button>
              <button
                type="button"
                onClick={unlock}
                disabled={submitting}
                className="flex-1 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? '解鎖中⋯' : '確認解鎖'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
