'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

type ParsedRow = {
  rowNum: number;
  year: number;
  month: number;
  evaluatee_name: string;
  role: string;
  evaluator_name: string;
  score_efficiency: number | null;
  score_quality: number | null;
  score_cooperation: number | null;
  score_attendance: number | null;
  comment: string | null;
  errors: string[];
};

type ImportResult = {
  inserted: number;
  skipExisting: number;
  skipEmpty: number;
  message?: string;
};

function parseInt0(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN as unknown as number; // 用 NaN 標示「不是數字」,讓後續驗證抓到
  return Math.round(n);
}

function parseFile(buf: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (aoa.length < 2) return [];

  const rows: ParsedRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] as unknown[];
    if (r.every((v) => String(v ?? '').trim() === '')) continue;

    const year = Number(r[0]);
    const month = Number(r[1]);
    const evaluatee_name = String(r[2] ?? '').trim();
    const role = String(r[3] ?? '').trim();
    const evaluator_name = String(r[4] ?? '').trim();
    const eff = parseInt0(r[5]);
    const qua = parseInt0(r[6]);
    const coo = parseInt0(r[7]);
    const att = parseInt0(r[8]);
    const comment = String(r[9] ?? '').trim() || null;

    const errors: string[] = [];
    if (!Number.isInteger(year)) errors.push('年份要填數字');
    if (!Number.isInteger(month) || month < 1 || month > 12)
      errors.push('月份要 1-12');
    if (!evaluatee_name) errors.push('缺被評核者');
    if (!role) errors.push('缺角色');
    else if (!['自評', '主管', '執行長'].includes(role))
      errors.push(`角色「${role}」不合法`);
    if (!evaluator_name) errors.push('缺評核者');

    const scoreFields: [number | null, number, number, string][] = [
      [eff, 0, 30, '時效'],
      [qua, 0, 25, '品質'],
      [coo, 0, 25, '配合'],
      [att, 0, 20, '出勤'],
    ];
    for (const [v, lo, hi, label] of scoreFields) {
      if (v === null) continue;
      if (Number.isNaN(v) || !Number.isInteger(v) || v < lo || v > hi) {
        errors.push(`${label}要 ${lo}-${hi} 整數`);
      }
    }
    // 四個分數要全填或全空
    const allNull =
      eff === null && qua === null && coo === null && att === null;
    const anyNull =
      eff === null || qua === null || coo === null || att === null;
    if (anyNull && !allNull) errors.push('四個分數要全填或全空');

    rows.push({
      rowNum: i + 1,
      year,
      month,
      evaluatee_name,
      role,
      evaluator_name,
      score_efficiency: eff,
      score_quality: qua,
      score_cooperation: coo,
      score_attendance: att,
      comment,
      errors,
    });
  }
  return rows;
}

const CURRENT_YEAR = new Date().getFullYear();

export function ImportHistoryClient() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quarter, setQuarter] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverRowErrors, setServerRowErrors] = useState<Record<number, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/admin/import-history/template?year=${year}&quarter=${quarter}`
      );
      if (!res.ok) {
        alert((await res.text()) || '下載失敗');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${year}Q${quarter}_evaluation_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setServerError(null);
    setServerRowErrors({});
    setResult(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseFile(buf);
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
    setResult(null);
  }

  const totalRows = rows?.length ?? 0;
  const errorRows = rows?.filter((r) => r.errors.length > 0).length ?? 0;
  const willInsert = rows?.filter(
    (r) =>
      r.errors.length === 0 &&
      !(
        r.score_efficiency === null &&
        r.score_quality === null &&
        r.score_cooperation === null &&
        r.score_attendance === null
      )
  ).length ?? 0;
  const willSkipEmpty = rows?.filter(
    (r) =>
      r.errors.length === 0 &&
      r.score_efficiency === null &&
      r.score_quality === null &&
      r.score_cooperation === null &&
      r.score_attendance === null
  ).length ?? 0;
  const allClean = totalRows > 0 && errorRows === 0;

  async function submit() {
    if (!rows || !allClean) return;
    setSubmitting(true);
    setServerError(null);
    setServerRowErrors({});
    try {
      const payload = rows.map((r) => ({
        rowNum: r.rowNum,
        year: r.year,
        month: r.month,
        evaluatee_name: r.evaluatee_name,
        role: r.role,
        evaluator_name: r.evaluator_name,
        score_efficiency: r.score_efficiency,
        score_quality: r.score_quality,
        score_cooperation: r.score_cooperation,
        score_attendance: r.score_attendance,
        comment: r.comment,
      }));
      const res = await fetch('/api/admin/import-history/import', {
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
            setServerError(json.message || '部分列有問題');
          } else {
            setServerError(text || '匯入失敗');
          }
        } catch {
          setServerError(text || '匯入失敗');
        }
        return;
      }
      const json = (await res.json()) as ImportResult;
      setResult(json);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : '匯入失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* 步驟 1:選季度 + 下載範本 */}
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          1. 選季度 + 下載範本
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          範本會幫妳預填年、月、員工姓名、角色,妳/會計只要填四個分數 + 備註(可不填)。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              年
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || CURRENT_YEAR)}
              className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              季度
            </label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="mt-1 w-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value={1}>Q1(1/2/3 月)</option>
              <option value={2}>Q2(4/5/6 月)</option>
              <option value={3}>Q3(7/8/9 月)</option>
              <option value={4}>Q4(10/11/12 月)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={downloading}
            className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"
          >
            {downloading ? '產生中⋯' : '⬇ 下載 ' + year + 'Q' + quarter + ' 範本'}
          </button>
        </div>
      </section>

      {/* 步驟 2:上傳 */}
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
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
          <li>四個分數要全填或全空(空白整列匯入時直接跳過)</li>
          <li>已存在的(年、月、被評核者、角色)會自動跳過,不覆蓋</li>
          <li>備註可不填</li>
        </ul>
      </section>

      {/* 步驟 3:預覽 + 確認 */}
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
                  ✓ 格式都 OK
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

          {allClean && (
            <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
              準備寫入 <strong>{willInsert}</strong> 筆,跳過{' '}
              <strong>{willSkipEmpty}</strong> 列(空白)。已存在的會在送出後自動跳過,結果會顯示在下方。
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="pb-2 pr-2 font-medium">列</th>
                  <th className="pb-2 px-2 font-medium">年/月</th>
                  <th className="pb-2 px-2 font-medium">被評核</th>
                  <th className="pb-2 px-2 font-medium">角色</th>
                  <th className="pb-2 px-2 font-medium">評核者</th>
                  <th className="pb-2 px-2 font-medium">時效</th>
                  <th className="pb-2 px-2 font-medium">品質</th>
                  <th className="pb-2 px-2 font-medium">配合</th>
                  <th className="pb-2 px-2 font-medium">出勤</th>
                  <th className="pb-2 pl-2 font-medium">錯誤</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const serverErr = serverRowErrors[r.rowNum];
                  const allErrors = serverErr ? [...r.errors, serverErr] : r.errors;
                  const hasErr = allErrors.length > 0;
                  const isEmpty =
                    r.score_efficiency === null &&
                    r.score_quality === null &&
                    r.score_cooperation === null &&
                    r.score_attendance === null;
                  return (
                    <tr
                      key={r.rowNum}
                      className={`border-b border-zinc-100 dark:border-zinc-900 ${
                        hasErr
                          ? 'bg-red-50/60 dark:bg-red-950/20'
                          : isEmpty
                            ? 'text-zinc-400 dark:text-zinc-600'
                            : ''
                      }`}
                    >
                      <td className="py-2 pr-2 text-zinc-400">{r.rowNum}</td>
                      <td className="py-2 px-2">
                        {r.year}/{r.month}
                      </td>
                      <td className="py-2 px-2">{r.evaluatee_name || '—'}</td>
                      <td className="py-2 px-2">{r.role || '—'}</td>
                      <td className="py-2 px-2">{r.evaluator_name || '—'}</td>
                      <td className="py-2 px-2">{r.score_efficiency ?? '—'}</td>
                      <td className="py-2 px-2">{r.score_quality ?? '—'}</td>
                      <td className="py-2 px-2">{r.score_cooperation ?? '—'}</td>
                      <td className="py-2 px-2">{r.score_attendance ?? '—'}</td>
                      <td className="py-2 pl-2 text-red-700 dark:text-red-300">
                        {allErrors.join('、') || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {serverError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {serverError}
            </p>
          )}

          {result && (
            <div className="mt-4 rounded-md bg-emerald-50 px-3 py-3 text-sm dark:bg-emerald-950/30">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">
                ✓ 匯入完成
              </p>
              <ul className="mt-1 list-disc pl-5 text-emerald-900/90 dark:text-emerald-300/90">
                <li>新增:{result.inserted} 筆</li>
                <li>跳過已存在:{result.skipExisting} 筆</li>
                <li>跳過空白:{result.skipEmpty} 列</li>
              </ul>
            </div>
          )}

          {!result && (
            <button
              type="button"
              onClick={submit}
              disabled={!allClean || submitting}
              className="mt-4 w-full rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? '匯入中⋯'
                : allClean
                  ? `確認匯入 ${willInsert} 筆`
                  : `請先修正錯誤(${errorRows} 列)`}
            </button>
          )}
        </section>
      )}
    </>
  );
}
