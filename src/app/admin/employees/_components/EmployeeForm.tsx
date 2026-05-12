'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Position = '一般員工' | '主管' | '執行長';
type AdminRole = '無' | '秘書' | '會計' | '超級管理員';
type Status = '在職' | '已停用';

const POSITIONS: Position[] = ['一般員工', '主管', '執行長'];
const ADMIN_ROLES: AdminRole[] = ['無', '秘書', '會計', '超級管理員'];

export type ManagerOption = {
  employee_number: string;
  name: string;
};

export type EmployeeFormValues = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
  position: Position;
  manager_id: string | null;
  company_email: string;
  admin_role: AdminRole;
  hired_at: string; // YYYY-MM-DD
  status: Status;
  left_at: string | null;
};

export function EmployeeForm({
  mode,
  initial,
  managers,
  canSetAdminRole,
}: {
  mode: 'new' | 'edit';
  initial: EmployeeFormValues;
  managers: ManagerOption[];
  canSetAdminRole: boolean;
}) {
  const router = useRouter();

  // 若 initial 的 manager_id 不在候選清單裡(常見:存的是 CEO 編號,但下拉
  // 只列「主管」職位的人),視為「直屬執行長」處理,顯示為空白選項
  const validManagerIds = new Set(managers.map((m) => m.employee_number));
  const normalizedInitial: EmployeeFormValues = {
    ...initial,
    manager_id:
      initial.manager_id && validManagerIds.has(initial.manager_id)
        ? initial.manager_id
        : null,
  };

  const [values, setValues] = useState<EmployeeFormValues>(normalizedInitial);
  const [submitting, setSubmitting] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const isDisabled = initial.status === '已停用';

  function setField<K extends keyof EmployeeFormValues>(
    key: K,
    val: EmployeeFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function submit() {
    setError(null);

    // 前端基本檢查
    if (!values.employee_number.trim()) return setError('員工編號必填');
    if (!values.name.trim()) return setError('姓名必填');
    if (!values.department.trim()) return setError('部門必填');
    if (!values.job_title.trim()) return setError('職務必填');
    if (!values.hired_at) return setError('到職日必填');

    setSubmitting(true);

    const payload = {
      employee_number: values.employee_number.trim(),
      name: values.name.trim(),
      department: values.department.trim(),
      job_title: values.job_title.trim(),
      position: values.position,
      manager_id: values.manager_id || null,
      company_email: values.company_email.trim() || null,
      admin_role: canSetAdminRole ? values.admin_role : undefined,
      hired_at: values.hired_at,
    };

    try {
      const url =
        mode === 'new'
          ? '/api/admin/employees'
          : `/api/admin/employees/${encodeURIComponent(initial.employee_number)}`;
      const method = mode === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || '儲存失敗');
        setSubmitting(false);
        return;
      }
      router.push('/admin/employees');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
      setSubmitting(false);
    }
  }

  async function toggleStatus() {
    setError(null);
    setStatusSubmitting(true);
    const next: Status = isDisabled ? '在職' : '已停用';
    try {
      const res = await fetch(
        `/api/admin/employees/${encodeURIComponent(initial.employee_number)}/status`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: next }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || '狀態變更失敗');
        setStatusSubmitting(false);
        setShowDisableConfirm(false);
        return;
      }
      router.push('/admin/employees');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '狀態變更失敗');
      setStatusSubmitting(false);
      setShowDisableConfirm(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="員工編號" required>
          <input
            type="text"
            value={values.employee_number}
            onChange={(e) => setField('employee_number', e.target.value)}
            disabled={mode === 'edit'}
            placeholder="例:NULLA0017"
            className={input(mode === 'edit')}
          />
          {mode === 'edit' && (
            <p className="mt-1 text-[10px] text-zinc-500">員工編號建檔後不可更改</p>
          )}
        </Field>

        <Field label="姓名" required>
          <input
            type="text"
            value={values.name}
            onChange={(e) => setField('name', e.target.value)}
            className={input(false)}
          />
        </Field>

        <Field label="部門" required>
          <input
            type="text"
            value={values.department}
            onChange={(e) => setField('department', e.target.value)}
            placeholder="例:企劃部"
            className={input(false)}
          />
        </Field>

        <Field label="職務" required>
          <input
            type="text"
            value={values.job_title}
            onChange={(e) => setField('job_title', e.target.value)}
            placeholder="例:企劃專員"
            className={input(false)}
          />
        </Field>

        <Field label="職位" required>
          <select
            value={values.position}
            onChange={(e) => setField('position', e.target.value as Position)}
            className={input(false)}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="主管">
          <select
            value={values.manager_id ?? ''}
            onChange={(e) => setField('manager_id', e.target.value || null)}
            className={input(false)}
          >
            <option value="">(無 — 直屬執行長)</option>
            {managers
              .filter((m) => m.employee_number !== initial.employee_number)
              .map((m) => (
                <option key={m.employee_number} value={m.employee_number}>
                  {m.name}({m.employee_number})
                </option>
              ))}
          </select>
        </Field>

        <Field label="公司 Email">
          <input
            type="email"
            value={values.company_email}
            onChange={(e) => setField('company_email', e.target.value)}
            placeholder="選填"
            className={input(false)}
          />
        </Field>

        <Field label="到職日" required>
          <input
            type="date"
            value={values.hired_at}
            onChange={(e) => setField('hired_at', e.target.value)}
            className={input(false)}
          />
        </Field>

        {canSetAdminRole && (
          <Field label="管理者身分">
            <select
              value={values.admin_role}
              onChange={(e) => setField('admin_role', e.target.value as AdminRole)}
              className={input(false)}
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-sky-700 active:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? '儲存中⋯' : mode === 'new' ? '建立員工' : '儲存變更'}
        </button>

        {mode === 'edit' &&
          (isDisabled ? (
            <button
              type="button"
              onClick={toggleStatus}
              disabled={statusSubmitting}
              className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-6 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              {statusSubmitting ? '處理中⋯' : '✓ 重新啟用'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowDisableConfirm(true)}
              disabled={statusSubmitting}
              className="w-full rounded-lg border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              停用此員工
            </button>
          ))}
      </div>

      {showDisableConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !statusSubmitting && setShowDisableConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
          >
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              停用 {initial.name}?
            </h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              停用後該員工無法登入,歷史評核資料會保留。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDisableConfirm(false)}
                disabled={statusSubmitting}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                再想一下
              </button>
              <button
                type="button"
                onClick={toggleStatus}
                disabled={statusSubmitting}
                className="flex-1 rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {statusSubmitting ? '停用中⋯' : '確認停用'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function input(disabled: boolean): string {
  return `w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${
    disabled ? 'cursor-not-allowed opacity-60' : ''
  }`;
}
