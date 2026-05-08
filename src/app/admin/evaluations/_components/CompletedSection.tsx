'use client';

import { useState } from 'react';
import { UnlockButton } from './UnlockButton';

type Role = '自評' | '主管' | '執行長';

const CHIP: Record<Role, string> = {
  自評: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  主管: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  執行長: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function CompletedSection({
  rows,
}: {
  rows: {
    id: string;
    role: Role;
    evaluatee: string;
    evaluator: string;
    filledAt: string;
  }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          已完成({rows.length} 件)
        </h2>
        <span className="text-zinc-400">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 px-5 pb-5 dark:border-zinc-800">
          {rows.length === 0 ? (
            <p className="py-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
              還沒有人完成評核。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CHIP[r.role]}`}>
                        {r.role}
                      </span>
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {r.evaluatee}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {r.role === '自評' ? '' : `評核人:${r.evaluator} · `}
                      {r.filledAt}
                    </p>
                  </div>
                  <UnlockButton
                    evaluationId={r.id}
                    evaluateeName={r.evaluatee}
                    role={r.role}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
