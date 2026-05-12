'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as XLSX from 'xlsx';

type RawRow = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  position: string;
  manager_id: string;
  company_email: string;
  admin_role: string;
  hired_at: string;
};

type ParsedRow = RawRow & {
  rowNum: number; // Excel 第幾列(1-based,含 header)
  errors: string[];
};

// 欄位標題加註可填值,提醒填表人別亂寫(伺服器端也會擋)
const COLUMNS_FULL = [
  '員工編號',
  '姓名',
  '部門',
  '職務',
  '職位(一般員工/主管)',
  '主管編號',
  '公司 Email',
  '管理者身分(秘書/會計,留空=無)',
  '到職日',
];

const COLUMNS_SECRETARY = [
  '員工編號',
  '姓名',
  '部門',
  '職務',
  '職位(一般員工/主管)',
  '主管編號',
  '公司 Email',
  '到職日',
];

// 匯入允許的值(執行長 / 超管 故意排除,要建那種人請走單筆新增)
const POSITIONS_IMPORT = ['一般員工', '主管'];
const ADMIN_ROLES_IMPORT = ['無', '秘書', '會計'];

function downloadTemplate(canSetAdminRole: boolean) {
  const columns = canSetAdminRole ? COLUMNS_FULL : COLUMNS_SECRETARY;
  const example = canSetAdminRole
    ? ['NULLA0099', '範例·王小明', '行銷部', '行銷專員', '一般員工', 'NULLA0011', '', '無', '2026-05-01']
    : ['NULLA0099', '範例·王小明', '行銷部', '行銷專員', '一般員工', 'NULLA0011', '', '2026-05-01'];

  const ws = XLSX.utils.aoa_to_sheet([columns, example]);
  // 欄寬
  ws['!cols'] = columns.map((c) => ({ wch: c.length * 2 + 4 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '員工');
  XLSX.writeFile(wb, '員工匯入範本.xlsx');
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function parseFile(buf: ArrayBuffer, canSetAdminRole: boolean): ParsedRow[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (aoa.length < 2) return [];

  // 抓 header 對應的欄位 index — 用 startsWith 比對(欄位名含括號註解也能匹配)
  const header = (aoa[0] as unknown[]).map((v) => cellToString(v));
  const indexOf = (label: string) => header.findIndex((h) => h.startsWith(label));

  const idx = {
    employee_number: indexOf('員工編號'),
    name: indexOf('姓名'),
    department: indexOf('部門'),
    job_title: indexOf('職務'),
    position: indexOf('職位'),
    manager_id: indexOf('主管編號'),
    company_email: indexOf('公司 Email'),
    admin_role: indexOf('管理者身分'),
    hired_at: indexOf('到職日'),
  };

  const get = (row: unknown[], i: number) => (i >= 0 ? cellToString(row[i]) : '');

  const rows: ParsedRow[] = [];
  const seenNumbers = new Map<string, number>(); // 員工編號 → 第幾列(找重複用)

  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] as unknown[];
    // 整列空白略過
    if (r.every((v) => cellToString(v) === '')) continue;

    const row: ParsedRow = {
      rowNum: i + 1, // Excel 1-based + header
      employee_number: get(r, idx.employee_number).toUpperCase(),
      name: get(r, idx.name),
      department: get(r, idx.department),
      job_title: get(r, idx.job_title),
      position: get(r, idx.position) || '一般員工',
      manager_id: get(r, idx.manager_id).toUpperCase(),
      company_email: get(r, idx.company_email),
      admin_role: canSetAdminRole ? get(r, idx.admin_role) || '無' : '無',
      hired_at: get(r, idx.hired_at),
      errors: [],
    };

    // 基本驗證
    if (!row.employee_number) row.errors.push('缺員工編號');
    if (!row.name) row.errors.push('缺姓名');
    if (!row.department) row.errors.push('缺部門');
    if (!row.job_title) row.errors.push('缺職務');
    if (!POSITIONS_IMPORT.includes(row.position)) {
      row.errors.push(
        row.position === '執行長'
          ? '執行長不能用 Excel 匯入,請用「+ 新增員工」單筆建立'
          : `職位「${row.position}」不合法(只能填 一般員工 / 主管)`
      );
    }
    if (canSetAdminRole) {
      if (!ADMIN_ROLES_IMPORT.includes(row.admin_role)) {
        row.errors.push(
          row.admin_role === '超級管理員'
            ? '超級管理員不能用 Excel 匯入,請用「+ 新增員工」單筆建立'
            : `管理者身分「${row.admin_role}」不合法(只能填 秘書 / 會計,留空=無)`
        );
      }
    }
    if (!row.hired_at) {
      row.errors.push('缺到職日');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.hired_at)) {
      row.errors.push(`到職日「${row.hired_at}」格式錯誤(應為 YYYY-MM-DD)`);
    }
    if (row.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.company_email)) {
      row.errors.push('Email 格式錯誤');
    }
    if (row.employee_number) {
      const prev = seenNumbers.get(row.employee_number);
      if (prev !== undefined) {
        row.errors.push(`員工編號重複(已出現在第 ${prev} 列)`);
      } else {
        seenNumbers.set(row.employee_number, row.rowNum);
      }
    }
    if (row.manager_id && row.manager_id === row.employee_number) {
      row.errors.push('主管不能是自己');
    }

    rows.push(row);
  }

  return rows;
}

export function ImportClient({ canSetAdminRole }: { canSetAdminRole: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverRowErrors, setServerRowErrors] = useState<Record<number, string>>({});

  async function onFile(file: File | null) {
    if (!file) return;
    setServerError(null);
    setServerRowErrors({});
    setFileName(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseFile(buf, canSetAdminRole);
      setRows(parsed);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Excel 解析失敗');
      setRows(null);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setRows(null);
    setFileName('');
    setServerError(null);
    setServerRowErrors({});
  }

  const totalRows = rows?.length ?? 0;
  const errorRows = rows?.filter((r) => r.errors.length > 0).length ?? 0;
  const allClean = totalRows > 0 && errorRows === 0;

  async function submit() {
    if (!rows || !allClean) return;
    setSubmitting(true);
    setServerError(null);
    setServerRowErrors({});
    try {
      const payload = rows.map((r) => ({
        rowNum: r.rowNum,
        employee_number: r.employee_number,
        name: r.name,
        department: r.department,
        job_title: r.job_title,
        position: r.position,
        manager_id: r.manager_id || null,
        company_email: r.company_email || null,
        admin_role: canSetAdminRole ? r.admin_role : undefined,
        hired_at: r.hired_at,
      }));
      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (json && Array.isArray(json.rowErrors)) {
            const map: Record<number, string> = {};
            for (const re of json.rowErrors) {
              if (typeof re.rowNum === 'number' && typeof re.message === 'string') {
                map[re.rowNum] = re.message;
              }
            }
            setServerRowErrors(map);
            setServerError(json.message || '部分資料有問題,無法匯入');
          } else {
            setServerError(text || '匯入失敗');
          }
        } catch {
          setServerError(text || '匯入失敗');
        }
        setSubmitting(false);
        return;
      }
      router.push('/admin/employees');
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : '匯入失敗');
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* 步驟 1:範本 + 上傳 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          1. 下載範本、照格式填好
        </h2>
        <button
          type="button"
          onClick={() => downloadTemplate(canSetAdminRole)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"
        >
          ⬇ 下載空白範本
        </button>
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
          <li>員工編號、姓名、部門、職務、到職日 必填</li>
          <li>職位填:一般員工 / 主管 / 執行長</li>
          {canSetAdminRole && <li>管理者身分填:無 / 秘書 / 會計 / 超級管理員</li>}
          <li>主管編號:該人必須已存在於系統,否則整批不匯入</li>
          <li>到職日格式:2026-05-01(YYYY-MM-DD)</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          2. 上傳填好的 Excel
        </h2>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          disabled={parsing || submitting}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:hover:bg-sky-700"
        />
        {fileName && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            選擇的檔案:{fileName}
          </p>
        )}
      </section>

      {/* 預覽 */}
      {rows && (
        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              3. 預覽 — 共 {totalRows} 列
              {errorRows > 0 && (
                <span className="ml-2 rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {errorRows} 列有錯
                </span>
              )}
              {allClean && (
                <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ✓ 全部 OK
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              清除重選
            </button>
          </div>

          {totalRows === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              這個檔案沒有資料列(只有標題或全空白)
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                    <th className="pb-2 pr-2 font-medium">列</th>
                    <th className="pb-2 px-2 font-medium">員工編號</th>
                    <th className="pb-2 px-2 font-medium">姓名</th>
                    <th className="pb-2 px-2 font-medium">部門</th>
                    <th className="pb-2 px-2 font-medium">職務</th>
                    <th className="pb-2 px-2 font-medium">職位</th>
                    <th className="pb-2 px-2 font-medium">主管</th>
                    {canSetAdminRole && (
                      <th className="pb-2 px-2 font-medium">管理者</th>
                    )}
                    <th className="pb-2 px-2 font-medium">到職日</th>
                    <th className="pb-2 pl-2 font-medium">錯誤</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const serverErr = serverRowErrors[r.rowNum];
                    const allErrors = serverErr
                      ? [...r.errors, serverErr]
                      : r.errors;
                    const bad = allErrors.length > 0;
                    return (
                      <tr
                        key={r.rowNum}
                        className={`border-b border-zinc-100 dark:border-zinc-900 ${
                          bad ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="py-2 pr-2 text-zinc-400">{r.rowNum}</td>
                        <td className="py-2 px-2 font-mono">{r.employee_number || '—'}</td>
                        <td className="py-2 px-2">{r.name || '—'}</td>
                        <td className="py-2 px-2">{r.department || '—'}</td>
                        <td className="py-2 px-2">{r.job_title || '—'}</td>
                        <td className="py-2 px-2">{r.position || '—'}</td>
                        <td className="py-2 px-2 font-mono text-zinc-500">
                          {r.manager_id || '—'}
                        </td>
                        {canSetAdminRole && (
                          <td className="py-2 px-2">{r.admin_role || '—'}</td>
                        )}
                        <td className="py-2 px-2 font-mono text-zinc-500">
                          {r.hired_at || '—'}
                        </td>
                        <td className="py-2 pl-2 text-red-700 dark:text-red-300">
                          {allErrors.join('、') || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {serverError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {serverError}
            </p>
          )}

          {totalRows > 0 && (
            <button
              type="button"
              onClick={submit}
              disabled={!allClean || submitting}
              className="mt-4 w-full rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? '匯入中⋯'
                : allClean
                  ? `確認匯入 ${totalRows} 筆`
                  : `請先修正錯誤(${errorRows} 列)`}
            </button>
          )}
        </section>
      )}
    </>
  );
}
