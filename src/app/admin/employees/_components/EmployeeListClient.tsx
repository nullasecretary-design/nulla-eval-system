'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EmployeeRow } from '../page';

const POSITION_CHIP: Record<EmployeeRow['position'], string> = {
  一般員工: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  主管: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  執行長: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function EmployeeListClient({
  rows,
  showAdminRole,
}: {
  rows: EmployeeRow[];
  showAdminRole: boolean;
}) {
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showDisabled && r.status === '已停用') return false;
      if (showDisabled && r.status !== '已停用') return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.employee_number.toLowerCase().includes(term) ||
        r.department.toLowerCase().includes(term) ||
        r.job_title.toLowerCase().includes(term)
      );
    });
  }, [rows, search, showDisabled]);

  const activeCount = rows.filter((r) => r.status === '在職').length;
  const disabledCount = rows.length - activeCount;

  return (
    <>
      {/* 過濾列 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋姓名 / 員工編號 / 部門 / 職務"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="inline-flex rounded-md border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setShowDisabled(false)}
            className={`rounded-l-md px-3 py-2 text-sm font-medium transition ${
              !showDisabled
                ? 'bg-sky-600 text-white'
                : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            在職 {activeCount}
          </button>
          <button
            type="button"
            onClick={() => setShowDisabled(true)}
            className={`rounded-r-md px-3 py-2 text-sm font-medium transition ${
              showDisabled
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            已停用 {disabledCount}
          </button>
        </div>
      </div>

      {/* 列表 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {search ? '沒有符合的員工' : showDisabled ? '沒有已停用的員工' : '沒有在職員工'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((r) => (
              <li key={r.employee_number}>
                <Link
                  href={`/admin/employees/${encodeURIComponent(r.employee_number)}`}
                  className="block px-5 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {r.name}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {r.employee_number}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${POSITION_CHIP[r.position]}`}
                        >
                          {r.position}
                        </span>
                        {showAdminRole && r.admin_role !== '無' && (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            {r.admin_role}
                          </span>
                        )}
                        {r.status === '已停用' && (
                          <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            已停用
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {r.department} · {r.job_title}
                        {r.manager_name && (
                          <span className="ml-1 text-zinc-400">
                            (主管:{r.manager_name})
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-zinc-400">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
