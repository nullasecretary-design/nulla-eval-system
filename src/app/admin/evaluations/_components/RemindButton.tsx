'use client';

import { useState } from 'react';

type Mode = 'non-ceo' | 'ceo-only' | 'one';

export function RemindButton({
  mode,
  evaluatorId,
  label,
  className,
}: {
  mode: Mode;
  evaluatorId?: string;
  label: string;
  className?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  async function fire() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, string> = {};
      if (mode === 'one' && evaluatorId) payload.evaluatorId = evaluatorId;
      else if (mode === 'non-ceo') payload.scope = 'non-ceo';
      else if (mode === 'ceo-only') payload.scope = 'ceo-only';
      const res = await fetch('/api/admin/evaluations/remind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || '寄信失敗');
        setSubmitting(false);
        return;
      }
      const json = await res.json();
      const emailSent = json.emailSent ?? 0;
      const emailFailed = json.emailFailed ?? 0;
      const lineSent = json.lineSent ?? 0;
      const lineFailed = json.lineFailed ?? 0;
      const skipped = json.skipped ?? 0;
      const total = emailSent + lineSent + emailFailed + lineFailed + skipped;

      const parts: string[] = [];
      if (emailSent > 0) parts.push(`Email ${emailSent} 封`);
      if (lineSent > 0) parts.push(`LINE ${lineSent} 則`);
      let msg = parts.length > 0 ? `寄出:${parts.join(' + ')}` : '沒寄出';
      if (skipped > 0) msg += ` · ${skipped} 人無聯絡方式略過`;
      if (emailFailed > 0) msg += ` · Email 失敗 ${emailFailed}`;
      if (lineFailed > 0) msg += ` · LINE 失敗 ${lineFailed}(可能沒加 bot 好友)`;
      if (total === 0) {
        msg = json.message ?? '沒有需要提醒的對象';
      }
      setResult(msg);
      setShowConfirm(false);
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '寄信失敗');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={submitting || result !== null}
        className={
          className ??
          'rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
        }
      >
        {result ? '✓ 已寄' : submitting ? '寄出中⋯' : label}
      </button>

      {result && (
        <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
          {result}
        </span>
      )}
      {error && (
        <span className="ml-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </span>
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
              {mode === 'non-ceo'
                ? '寄催繳給全員(不含執行長)?'
                : mode === 'ceo-only'
                  ? '提醒執行長?'
                  : '寄催繳信?'}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {mode === 'non-ceo'
                ? '系統會把本月所有有未完成項目的人(自評 / 主管評)各寄一封,執行長不會收到。'
                : mode === 'ceo-only'
                  ? '只把執行長未完成的執行長評提醒寄給執行長,其他人不會收到。'
                  : '系統會寄一封給這個人,信裡列出他自己所有未完成項目。'}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
              系統會同時用 Email 跟 LINE 寄。對方沒設定的會自動略過。
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
                onClick={fire}
                disabled={submitting}
                className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? '寄出中⋯' : '確認寄出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
