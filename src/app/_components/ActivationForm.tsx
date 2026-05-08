'use client';

import { useState } from 'react';

function formatLocal(value: string): string {
  // value is 'YYYY-MM-DDTHH:mm' (datetime-local format)
  if (!value) return '';
  const [date, time] = value.split('T');
  if (!date || !time) return value;
  const [y, m, d] = date.split('-');
  return `${y}/${m}/${d} ${time}`;
}

export function ActivationForm({
  initialDeadlineLocal,
  year,
  month,
}: {
  initialDeadlineLocal: string;
  year: number;
  month: number;
}) {
  const [deadline, setDeadline] = useState(initialDeadlineLocal);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = `${month} 月`;
  const valid = deadline.length > 0 && new Date(deadline).getTime() > Date.now();

  async function activate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/eval-periods/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deadline_at: new Date(deadline).toISOString(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || '啟動失敗');
        setSubmitting(false);
        setShowConfirm(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '啟動失敗');
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-6 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
          啟動本月評核
        </h2>
        <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
          {year} 年 {monthLabel}
        </span>
      </div>
      <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-300/80">
        按下「啟動」會建立本月評核 row,所有員工就能開始填自評。
      </p>

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          截止日 / 時間
        </label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={!valid || submitting}
        className="mt-4 w-full rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        啟動 {monthLabel} 評核
      </button>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
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
              確認啟動 {monthLabel} 評核?
            </h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              啟動後系統會建立本月所有評核 row,員工就能開始填自評。
            </p>
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
              <span className="text-zinc-600 dark:text-zinc-400">截止日:</span>{' '}
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                {formatLocal(deadline)}
              </span>
            </div>
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
                onClick={activate}
                disabled={submitting}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? '啟動中⋯' : '確認啟動'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
