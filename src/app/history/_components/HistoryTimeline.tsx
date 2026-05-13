'use client';

import Link from 'next/link';
import { useState } from 'react';

export type MonthSummary = {
  year: number;
  month: number;
  selfTotal: number | null;
  weightedTotal: number | null;
};

export type QuarterSummary = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  months: [number, number, number];
  monthData: MonthSummary[];
  selfAvg: number | null;
  weightedAvg: number | null;
};

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return String(Math.round(n));
}

function WeightedHelp() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 text-[10px] font-bold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        aria-label="加權平均說明"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">什麼是加權平均?</p>
          <p className="mt-2 text-zinc-700 dark:text-zinc-300">
            你的考核分數計算方式:
          </p>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            主管評核 × 70% + 執行長評核 × 30%
          </p>
          <p className="mt-1 text-zinc-500 dark:text-zinc-500">
            (直屬執行長者:執行長評核 × 100%)
          </p>
        </div>
      )}
    </span>
  );
}

function MonthCard({ m, basePath }: { m: MonthSummary; basePath: string }) {
  const empty = m.selfTotal === null && m.weightedTotal === null;
  return (
    <div
      className={`rounded-xl border p-3 ${
        empty
          ? 'border-dashed border-zinc-300 bg-zinc-50/40 dark:border-zinc-700 dark:bg-zinc-900/20'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {m.month} 月
        </span>
        {empty ? (
          <span className="text-xs text-zinc-400">無紀錄</span>
        ) : (
          <Link
            href={`${basePath}/${m.year}/${m.month}`}
            className="text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
          >
            查看詳細 →
          </Link>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-blue-50 px-2 py-1.5 dark:bg-blue-950/30">
          <div className="text-[10px] text-blue-700/70 dark:text-blue-300/70">自評</div>
          <div className="font-bold text-blue-700 dark:text-blue-300">
            {fmtScore(m.selfTotal)}
          </div>
        </div>
        <div className="rounded-md bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/30">
          <div className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70">加權</div>
          <div className="font-bold text-emerald-700 dark:text-emerald-300">
            {fmtScore(m.weightedTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuarterCard({
  q,
  expanded,
  onToggle,
  basePath,
}: {
  q: QuarterSummary;
  expanded: boolean;
  onToggle: () => void;
  basePath: string;
}) {
  const monthRange = q.months.map((m) => `${m}月`).join('·');
  return (
    <section className="rounded-2xl border-2 border-zinc-200 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {q.year} Q{q.quarter}
            </span>
            <span className="text-zinc-400">{expanded ? '▼' : '▶'}</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{monthRange}</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] text-blue-700/70 dark:text-blue-300/70">自評平均</div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {fmtScore(q.selfAvg)}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-end text-[10px] text-emerald-700/70 dark:text-emerald-300/70">
              加權平均
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {fmtScore(q.weightedAvg)}
            </div>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="grid grid-cols-3 gap-3">
            {q.monthData.map((m) => (
              <MonthCard key={`${m.year}-${m.month}`} m={m} basePath={basePath} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function HistoryTimeline({
  quarters,
  basePath = '/history',
}: {
  quarters: QuarterSummary[];
  basePath?: string;
}) {
  // 最新季度預設展開
  const [openKey, setOpenKey] = useState<string | null>(
    quarters.length > 0 ? `${quarters[0].year}-Q${quarters[0].quarter}` : null
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end text-xs text-zinc-500 dark:text-zinc-400">
        <span>「加權平均」是什麼?</span>
        <WeightedHelp />
      </div>
      {quarters.map((q) => {
        const key = `${q.year}-Q${q.quarter}`;
        return (
          <QuarterCard
            key={key}
            q={q}
            expanded={openKey === key}
            onToggle={() => setOpenKey(openKey === key ? null : key)}
            basePath={basePath}
          />
        );
      })}
    </div>
  );
}
