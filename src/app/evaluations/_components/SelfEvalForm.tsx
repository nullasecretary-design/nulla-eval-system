'use client';

import { useState } from 'react';

const ITEMS = [
  { key: 'efficiency', label: '工作時效', max: 30 },
  { key: 'quality', label: '工作品質', max: 25 },
  { key: 'cooperation', label: '工作配合度', max: 25 },
  { key: 'attendance', label: '出勤狀況', max: 20 },
] as const;

type ScoreKey = (typeof ITEMS)[number]['key'];
type Scores = Record<ScoreKey, number>;

export function SelfEvalForm({
  evalId,
  initialComment,
}: {
  evalId: string;
  initialComment: string;
}) {
  const [scores, setScores] = useState<Scores>({
    efficiency: 0,
    quality: 0,
    cooperation: 0,
    attendance: 0,
  });
  const [comment, setComment] = useState(initialComment);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = ITEMS.reduce((sum, it) => sum + scores[it.key], 0);

  function setScore(key: ScoreKey, raw: string, max: number) {
    if (raw === '') {
      setScores((p) => ({ ...p, [key]: 0 }));
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    if (n < 0) return;
    const clamped = n > max ? max : Math.floor(n);
    setScores((p) => ({ ...p, [key]: clamped }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/evaluations/${evalId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores, comment }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || '送出失敗');
        setSubmitting(false);
        return;
      }
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : '送出失敗');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {ITEMS.map((item) => {
        const score = scores[item.key];
        const pct = (score / item.max) * 100;
        return (
          <div
            key={item.key}
            className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/30"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={item.max}
                  step={1}
                  value={score}
                  onChange={(e) => setScore(item.key, e.target.value, item.max)}
                  className="w-16 rounded-md border border-blue-300 bg-white px-2 py-1 text-right text-lg font-bold text-blue-700 focus:border-blue-500 focus:outline-none dark:border-blue-700 dark:bg-zinc-900 dark:text-blue-300"
                />
                <span className="text-sm text-zinc-500">/ {item.max}</span>
              </div>
            </div>
            {/* 視覺滑桿(不能拖,只跟著數字動) */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
              <div
                className="h-full rounded-full bg-blue-500 transition-all dark:bg-blue-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}

      {/* 自動加總 */}
      <div className="rounded-xl bg-blue-600 px-5 py-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-sm uppercase tracking-wider opacity-80">
            自動總計
          </span>
          <span className="text-3xl font-bold">{total} / 100</span>
        </div>
      </div>

      {/* 備註 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          備註(選填)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="想對主管或老闆說的話"
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* 送出 */}
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={submitting}
        className="mt-2 rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        送出
      </button>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* 二次確認 modal */}
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
              ⚠️ 確認送出
            </h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              送出後將無法修改。確定要送出嗎?
            </p>
            <div className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">總分:</span>{' '}
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {total} / 100
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
                onClick={submit}
                disabled={submitting}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '送出中⋯' : '確認送出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
