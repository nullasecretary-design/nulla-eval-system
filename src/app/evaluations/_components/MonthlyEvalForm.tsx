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

export type SubordinateSelfView = {
  status: '待填' | '已填';
  scores: Scores;
  comment: string | null;
};

export type SubordinateManagerView = {
  status: '待填' | '已填';
  scores: Scores;
  comment: string | null;
};

export type SubordinateProfile = {
  employee_number: string;
  name: string;
  department: string;
  job_title: string;
};

export type Section =
  | {
      kind: 'self';
      evalId: string;
      status: '待填' | '已填';
      scores: Scores;
      comment: string;
    }
  | {
      kind: 'manager';
      evalId: string;
      status: '待填' | '已填';
      scores: Scores;
      comment: string;
      subordinate: SubordinateProfile;
      subordinateSelf: SubordinateSelfView;
    }
  | {
      kind: 'executive';
      evalId: string;
      status: '待填' | '已填';
      scores: Scores;
      comment: string;
      subordinate: SubordinateProfile;
      subordinateSelf: SubordinateSelfView;
      subordinateManager: SubordinateManagerView | null;
    };

function totalScores(s: Scores): number {
  return ITEMS.reduce((sum, it) => sum + s[it.key], 0);
}

// ---------------------------------------------------------------------------
// Scores grid (editable)
// ---------------------------------------------------------------------------

type Accent = 'blue' | 'purple' | 'green';

const INPUT_STYLES: Record<Accent, {
  card: string;
  input: string;
  track: string;
  fill: string;
}> = {
  blue: {
    card: 'border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20',
    input:
      'border-blue-300 text-blue-700 focus:border-blue-500 dark:border-blue-700 dark:text-blue-300',
    track: 'bg-blue-100 dark:bg-blue-950',
    fill: 'bg-blue-500 dark:bg-blue-400',
  },
  purple: {
    card: 'border-purple-200 bg-purple-50/40 dark:border-purple-900/40 dark:bg-purple-950/20',
    input:
      'border-purple-300 text-purple-700 focus:border-purple-500 dark:border-purple-700 dark:text-purple-300',
    track: 'bg-purple-100 dark:bg-purple-950',
    fill: 'bg-purple-500 dark:bg-purple-400',
  },
  green: {
    card: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    input:
      'border-emerald-300 text-emerald-700 focus:border-emerald-500 dark:border-emerald-700 dark:text-emerald-300',
    track: 'bg-emerald-100 dark:bg-emerald-950',
    fill: 'bg-emerald-500 dark:bg-emerald-400',
  },
};

const READOUT_STYLES: Record<Accent, { row: string; track: string; fill: string }> = {
  blue: {
    row: 'text-blue-700 dark:text-blue-300',
    track: 'bg-blue-100 dark:bg-blue-950',
    fill: 'bg-blue-500 dark:bg-blue-400',
  },
  purple: {
    row: 'text-purple-700 dark:text-purple-300',
    track: 'bg-purple-100 dark:bg-purple-950',
    fill: 'bg-purple-500 dark:bg-purple-400',
  },
  green: {
    row: 'text-emerald-700 dark:text-emerald-300',
    track: 'bg-emerald-100 dark:bg-emerald-950',
    fill: 'bg-emerald-500 dark:bg-emerald-400',
  },
};

function ScoreInputs({
  scores,
  onChange,
  accent,
}: {
  scores: Scores;
  onChange: (key: ScoreKey, raw: string, max: number) => void;
  accent: Accent;
}) {
  const styles = INPUT_STYLES[accent];

  return (
    <div className="space-y-3">
      {ITEMS.map((item) => {
        const score = scores[item.key];
        const pct = (score / item.max) * 100;
        return (
          <div key={item.key} className={`rounded-xl border p-3 ${styles.card}`}>
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
                  onChange={(e) => onChange(item.key, e.target.value, item.max)}
                  className={`w-16 rounded-md border bg-white px-2 py-1 text-right text-lg font-bold focus:outline-none dark:bg-zinc-900 ${styles.input}`}
                />
                <span className="text-sm text-zinc-500">/ {item.max}</span>
              </div>
            </div>
            <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${styles.track}`}>
              <div
                className={`h-full rounded-full transition-all ${styles.fill}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scores grid (read-only)
// ---------------------------------------------------------------------------

function ScoreReadout({
  scores,
  accent,
  compact,
}: {
  scores: Scores;
  accent: Accent;
  compact?: boolean;
}) {
  const styles = READOUT_STYLES[accent];
  const barH = compact ? 'h-1.5' : 'h-2';

  return (
    <div className="space-y-2">
      {ITEMS.map((item) => {
        const s = scores[item.key];
        const pct = (s / item.max) * 100;
        return (
          <div key={item.key} className="flex items-center gap-3">
            <span className="w-24 text-sm text-zinc-700 dark:text-zinc-300">
              {item.label}
            </span>
            <div className={`flex-1 overflow-hidden rounded-full ${styles.track} ${barH}`}>
              <div className={`h-full rounded-full ${styles.fill}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`w-14 text-right text-sm font-bold ${styles.row}`}>
              {s} / {item.max}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Self block
// ---------------------------------------------------------------------------

function SelfBlock({
  section,
  onScore,
  onComment,
}: {
  section: Extract<Section, { kind: 'self' }>;
  onScore: (key: ScoreKey, raw: string, max: number) => void;
  onComment: (val: string) => void;
}) {
  const total = totalScores(section.scores);

  if (section.status === '已填') {
    return (
      <section className="rounded-2xl border-2 border-blue-300 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-blue-700 dark:text-blue-300">自評(已送出)</h3>
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
            ✓ 已送出
          </span>
        </div>
        <div className="mt-4">
          <ScoreReadout scores={section.scores} accent="blue" />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-blue-200 pt-3 dark:border-blue-900/40">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">總計</span>
          <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{total} / 100</span>
        </div>
        {section.comment && (
          <div className="mt-3 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
            <span className="text-xs text-zinc-500">備註:</span> {section.comment}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-blue-200 bg-white/80 p-5 shadow-sm dark:border-blue-900/40 dark:bg-zinc-900/60">
      <ScoreInputs
        scores={section.scores}
        onChange={onScore}
        accent="blue"
      />

      <div className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-white shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-sm uppercase tracking-wider opacity-80">自評總計</span>
          <span className="text-2xl font-bold">{total} / 100</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          備註(選填)
        </label>
        <textarea
          value={section.comment}
          onChange={(e) => onComment(e.target.value)}
          rows={3}
          placeholder="本月有話要說"
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Manager block
// ---------------------------------------------------------------------------

function ManagerBlock({
  section,
  onScore,
  onComment,
}: {
  section: Extract<Section, { kind: 'manager' }>;
  onScore: (key: ScoreKey, raw: string, max: number) => void;
  onComment: (val: string) => void;
}) {
  const total = totalScores(section.scores);
  const subSelf = section.subordinateSelf;
  const subSelfTotal = totalScores(subSelf.scores);
  const submitted = section.status === '已填';
  const blocked = !submitted && subSelf.status === '待填';

  // ------- 員工還沒自評,鎖住整張 -------
  if (blocked) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50/60 p-5 dark:border-zinc-700 dark:bg-zinc-900/30">
        <header className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div>
            <h3 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">
              {section.subordinate.name}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {section.subordinate.department} · {section.subordinate.job_title}
            </p>
          </div>
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            🔒 暫不可填
          </span>
        </header>
        <div className="mt-4 rounded-xl bg-white/60 px-4 py-5 text-center text-sm text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
          等 {section.subordinate.name} 填完自評,你才能評他。
          <br />
          <span className="text-xs text-zinc-500">(這張不會算進「送出本月評核」的件數)</span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`rounded-2xl border-2 p-5 shadow-sm ${
        submitted
          ? 'border-purple-300 bg-purple-50/40 dark:border-purple-900/50 dark:bg-purple-950/20'
          : 'border-purple-200 bg-white/80 dark:border-purple-900/40 dark:bg-zinc-900/60'
      }`}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {section.subordinate.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {section.subordinate.department} · {section.subordinate.job_title}
          </p>
        </div>
        {submitted && (
          <span className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white">
            ✓ 已送出
          </span>
        )}
      </header>

      {/* 員工自評唯讀 */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">員工自評</h4>
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
          <ScoreReadout scores={subSelf.scores} accent="blue" compact />
          <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-sm dark:border-blue-900/40">
            <span className="text-zinc-600 dark:text-zinc-400">自評總計</span>
            <span className="font-bold text-blue-700 dark:text-blue-300">{subSelfTotal} / 100</span>
          </div>
          {subSelf.comment && (
            <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
              <span className="text-xs text-zinc-500">員工備註:</span> {subSelf.comment}
            </div>
          )}
        </div>
      </div>

      {/* 主管評 */}
      <div className="mt-5">
        <h4 className="mb-2 text-sm font-semibold text-purple-700 dark:text-purple-300">主管評</h4>

        {submitted ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
            <ScoreReadout scores={section.scores} accent="purple" compact />
            <div className="mt-2 flex items-center justify-between border-t border-purple-200 pt-2 text-sm dark:border-purple-900/40">
              <span className="text-zinc-600 dark:text-zinc-400">主管總計</span>
              <span className="font-bold text-purple-700 dark:text-purple-300">{total} / 100</span>
            </div>
            {section.comment && (
              <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
                <span className="text-xs text-zinc-500">主管備註:</span> {section.comment}
              </div>
            )}
          </div>
        ) : (
          <>
            <ScoreInputs scores={section.scores} onChange={onScore} accent="purple" />

            <div className="mt-4 rounded-xl bg-purple-600 px-5 py-3 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm uppercase tracking-wider opacity-80">主管總計</span>
                <span className="text-2xl font-bold">{total} / 100</span>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                備註(選填)
              </label>
              <textarea
                value={section.comment}
                onChange={(e) => onComment(e.target.value)}
                rows={2}
                placeholder="本月有話要說"
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Executive block
// ---------------------------------------------------------------------------

function PendingBox({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white/50 px-3 py-2 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
      {label}
    </div>
  );
}

function ExecutiveBlock({
  section,
  onScore,
  onComment,
}: {
  section: Extract<Section, { kind: 'executive' }>;
  onScore: (key: ScoreKey, raw: string, max: number) => void;
  onComment: (val: string) => void;
}) {
  const total = totalScores(section.scores);
  const subSelf = section.subordinateSelf;
  const subMgr = section.subordinateManager;
  const subSelfTotal = totalScores(subSelf.scores);
  const subMgrTotal = subMgr ? totalScores(subMgr.scores) : 0;
  const submitted = section.status === '已填';

  return (
    <section
      className={`rounded-2xl border-2 p-5 shadow-sm ${
        submitted
          ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20'
          : 'border-emerald-200 bg-white/80 dark:border-emerald-900/40 dark:bg-zinc-900/60'
      }`}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {section.subordinate.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {section.subordinate.department} · {section.subordinate.job_title}
          </p>
        </div>
        {submitted && (
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
            ✓ 已送出
          </span>
        )}
      </header>

      {/* 員工自評(唯讀) */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-blue-700 dark:text-blue-300">員工自評</h4>
        {subSelf.status === '已填' ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
            <ScoreReadout scores={subSelf.scores} accent="blue" compact />
            <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-sm dark:border-blue-900/40">
              <span className="text-zinc-600 dark:text-zinc-400">自評總計</span>
              <span className="font-bold text-blue-700 dark:text-blue-300">{subSelfTotal} / 100</span>
            </div>
            {subSelf.comment && (
              <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
                <span className="text-xs text-zinc-500">員工備註:</span> {subSelf.comment}
              </div>
            )}
          </div>
        ) : (
          <PendingBox label="員工尚未填自評" />
        )}
      </div>

      {/* 主管評(唯讀,直屬執行長者不顯示) */}
      {subMgr && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-purple-700 dark:text-purple-300">主管評</h4>
          {subMgr.status === '已填' ? (
            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
              <ScoreReadout scores={subMgr.scores} accent="purple" compact />
              <div className="mt-2 flex items-center justify-between border-t border-purple-200 pt-2 text-sm dark:border-purple-900/40">
                <span className="text-zinc-600 dark:text-zinc-400">主管總計</span>
                <span className="font-bold text-purple-700 dark:text-purple-300">{subMgrTotal} / 100</span>
              </div>
              {subMgr.comment && (
                <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
                  <span className="text-xs text-zinc-500">主管備註:</span> {subMgr.comment}
                </div>
              )}
            </div>
          ) : (
            <PendingBox label="主管尚未評核" />
          )}
        </div>
      )}

      {/* 執行長評 */}
      <div className="mt-5">
        <h4 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">執行長評</h4>
        {submitted ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <ScoreReadout scores={section.scores} accent="green" compact />
            <div className="mt-2 flex items-center justify-between border-t border-emerald-200 pt-2 text-sm dark:border-emerald-900/40">
              <span className="text-zinc-600 dark:text-zinc-400">執行長總計</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">{total} / 100</span>
            </div>
            {section.comment && (
              <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
                <span className="text-xs text-zinc-500">執行長備註:</span> {section.comment}
              </div>
            )}
          </div>
        ) : (
          <>
            <ScoreInputs scores={section.scores} onChange={onScore} accent="green" />

            <div className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm uppercase tracking-wider opacity-80">執行長總計</span>
                <span className="text-2xl font-bold">{total} / 100</span>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                備註(選填)
              </label>
              <textarea
                value={section.comment}
                onChange={(e) => onComment(e.target.value)}
                rows={2}
                placeholder="本月有話要說"
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function MonthlyEvalForm({
  initialSections,
}: {
  initialSections: Section[];
}) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isBlocked(s: Section): boolean {
    return (
      s.kind === 'manager' &&
      s.status === '待填' &&
      s.subordinateSelf.status === '待填'
    );
  }

  const pending = sections.filter((s) => s.status === '待填' && !isBlocked(s));
  const blocked = sections.filter(isBlocked);
  const allDone = pending.length === 0;

  function setScore(evalId: string, key: ScoreKey, raw: string, max: number) {
    let next: number;
    if (raw === '') {
      next = 0;
    } else {
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) return;
      next = n > max ? max : Math.floor(n);
    }
    setSections((prev) =>
      prev.map((s) =>
        s.evalId === evalId
          ? ({ ...s, scores: { ...s.scores, [key]: next } } as Section)
          : s
      )
    );
  }

  function setComment(evalId: string, value: string) {
    setSections((prev) =>
      prev.map((s) => (s.evalId === evalId ? ({ ...s, comment: value } as Section) : s))
    );
  }

  async function submitAll() {
    setSubmitting(true);
    setError(null);

    for (const s of pending) {
      try {
        const res = await fetch(`/api/evaluations/${s.evalId}/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scores: s.scores, comment: s.comment }),
        });
        if (!res.ok) {
          const text = await res.text();
          const who =
            s.kind === 'self'
              ? '你的自評'
              : s.kind === 'manager'
                ? `${s.subordinate.name} 的主管評`
                : `${s.subordinate.name} 的執行長評`;
          setError(`「${who}」送出失敗:${text || '未知錯誤'}`);
          setSubmitting(false);
          setShowConfirm(false);
          return;
        }
        // 標記成功
        setSections((prev) =>
          prev.map((x) =>
            x.evalId === s.evalId ? ({ ...x, status: '已填' } as Section) : x
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : '送出失敗');
        setSubmitting(false);
        setShowConfirm(false);
        return;
      }
    }

    window.location.href = '/';
  }

  const selfSections = sections.filter((s): s is Extract<Section, { kind: 'self' }> => s.kind === 'self');
  const mgrSections = sections.filter((s): s is Extract<Section, { kind: 'manager' }> => s.kind === 'manager');
  const execSections = sections.filter((s): s is Extract<Section, { kind: 'executive' }> => s.kind === 'executive');

  return (
    <div className="flex flex-col gap-6">
      {/* 自評 */}
      {selfSections.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-blue-700 dark:text-blue-300">
            你的自評
          </h2>
          <div className="flex flex-col gap-4">
            {selfSections.map((s) => (
              <SelfBlock
                key={s.evalId}
                section={s}
                onScore={(k, raw, max) => setScore(s.evalId, k, raw, max)}
                onComment={(v) => setComment(s.evalId, v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 下屬評核 */}
      {mgrSections.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-purple-700 dark:text-purple-300">
            下屬評核({mgrSections.length} 人)
          </h2>
          <div className="flex flex-col gap-5">
            {mgrSections.map((s) => (
              <ManagerBlock
                key={s.evalId}
                section={s}
                onScore={(k, raw, max) => setScore(s.evalId, k, raw, max)}
                onComment={(v) => setComment(s.evalId, v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 執行長評核 */}
      {execSections.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-emerald-700 dark:text-emerald-300">
            執行長評核({execSections.length} 人)
          </h2>
          <div className="flex flex-col gap-5">
            {execSections.map((s) => (
              <ExecutiveBlock
                key={s.evalId}
                section={s}
                onScore={(k, raw, max) => setScore(s.evalId, k, raw, max)}
                onComment={(v) => setComment(s.evalId, v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 送出 */}
      {!allDone ? (
        <>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
            className="mt-2 rounded-lg bg-zinc-900 px-6 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-zinc-800 active:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            送出本月評核({pending.length} 件待送)
          </button>
          {error && (
            <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </>
      ) : blocked.length > 0 ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          ✓ 你能送的都送出了。還有 {blocked.length} 位下屬等他們先填自評。
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ 本月所有評核都已送出
        </div>
      )}

      {/* 確認 modal */}
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
              送出後將無法修改。確定要一次送出 {pending.length} 件評核嗎?
            </p>
            <ul className="mt-3 space-y-1 rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
              {pending.map((s) => {
                const t = totalScores(s.scores);
                const who =
                  s.kind === 'self'
                    ? '自評'
                    : s.kind === 'manager'
                      ? `${s.subordinate.name}(主管評)`
                      : `${s.subordinate.name}(執行長評)`;
                return (
                  <li key={s.evalId} className="flex justify-between">
                    <span className="text-zinc-700 dark:text-zinc-300">{who}</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{t} / 100</span>
                  </li>
                );
              })}
            </ul>
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
                onClick={submitAll}
                disabled={submitting}
                className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
