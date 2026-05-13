import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ROLES = ['自評', '主管', '執行長'] as const;
type Role = (typeof ROLES)[number];

type IncomingRow = {
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
};

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

function jsonRowErrors(
  message: string,
  rowErrors: { rowNum: number; message: string }[]
) {
  return NextResponse.json({ message, rowErrors }, { status: 422 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, org_id, admin_role, status')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!['秘書', '會計', '超級管理員'].includes(actor.admin_role)) {
    return bad('沒有匯入歷史的權限', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  const rawRows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return bad('沒有要匯入的資料');
  }
  const rows = rawRows as IncomingRow[];

  // 姓名 → employee_number(本公司所有員工,含已停用 — 歷史評核可能涉及已停用員工)
  const { data: emps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name')
    .eq('org_id', actor.org_id);
  if (!emps) return bad('查員工失敗', 500);

  const nameToId = new Map<string, string>();
  for (const e of emps) {
    if (nameToId.has(e.name)) {
      // 姓名重複會導致對應錯誤 — 先擋住
      return bad(`公司內姓名「${e.name}」有兩人以上,無法用姓名匯入,請聯絡開發者`, 500);
    }
    nameToId.set(e.name, e.employee_number);
  }

  // 解析每列 → 轉成可用 row
  const rowErrors: { rowNum: number; message: string }[] = [];
  type ResolvedRow = {
    rowNum: number;
    year: number;
    month: number;
    evaluatee_id: string;
    role: Role;
    evaluator_id: string;
    scores: {
      efficiency: number;
      quality: number;
      cooperation: number;
      attendance: number;
    } | null; // null = 空白整列,匯入時跳過
    comment: string | null;
  };
  const resolved: ResolvedRow[] = [];

  for (const r of rows) {
    if (!Number.isInteger(r.year) || r.year < 2020 || r.year > 2100) {
      rowErrors.push({ rowNum: r.rowNum, message: '年份不合法' });
      continue;
    }
    if (!Number.isInteger(r.month) || r.month < 1 || r.month > 12) {
      rowErrors.push({ rowNum: r.rowNum, message: '月份不合法' });
      continue;
    }
    if (!ROLES.includes(r.role as Role)) {
      rowErrors.push({ rowNum: r.rowNum, message: `角色「${r.role}」不合法(只能是 自評/主管/執行長)` });
      continue;
    }
    const eeId = nameToId.get(r.evaluatee_name);
    const erId = nameToId.get(r.evaluator_name);
    if (!eeId) {
      rowErrors.push({ rowNum: r.rowNum, message: `找不到被評核者「${r.evaluatee_name}」` });
      continue;
    }
    if (!erId) {
      rowErrors.push({ rowNum: r.rowNum, message: `找不到評核者「${r.evaluator_name}」` });
      continue;
    }

    // 分數驗證:四個都 null = 空白(跳過);任一非 null 則四個都要有
    const all = [
      r.score_efficiency,
      r.score_quality,
      r.score_cooperation,
      r.score_attendance,
    ];
    const allNull = all.every((v) => v === null);
    const anyNull = all.some((v) => v === null);

    if (allNull) {
      resolved.push({
        rowNum: r.rowNum,
        year: r.year,
        month: r.month,
        evaluatee_id: eeId,
        role: r.role as Role,
        evaluator_id: erId,
        scores: null,
        comment: null,
      });
      continue;
    }
    if (anyNull) {
      rowErrors.push({ rowNum: r.rowNum, message: '四個分數要全填或全空' });
      continue;
    }

    const ranges: [number, number, number][] = [
      [r.score_efficiency!, 0, 30],
      [r.score_quality!, 0, 25],
      [r.score_cooperation!, 0, 25],
      [r.score_attendance!, 0, 20],
    ];
    let scoreOk = true;
    const fieldNames = ['時效', '品質', '配合', '出勤'];
    for (let i = 0; i < ranges.length; i++) {
      const [v, lo, hi] = ranges[i];
      if (!Number.isInteger(v) || v < lo || v > hi) {
        rowErrors.push({
          rowNum: r.rowNum,
          message: `${fieldNames[i]}「${v}」超過範圍(${lo}-${hi} 整數)`,
        });
        scoreOk = false;
        break;
      }
    }
    if (!scoreOk) continue;

    resolved.push({
      rowNum: r.rowNum,
      year: r.year,
      month: r.month,
      evaluatee_id: eeId,
      role: r.role as Role,
      evaluator_id: erId,
      scores: {
        efficiency: r.score_efficiency!,
        quality: r.score_quality!,
        cooperation: r.score_cooperation!,
        attendance: r.score_attendance!,
      },
      comment: r.comment && r.comment.trim() ? r.comment.trim() : null,
    });
  }

  if (rowErrors.length > 0) {
    return jsonRowErrors('部分列有問題,整批不匯入', rowErrors);
  }

  // 涉及的 (year, month) 組合 → 補建 period 如有需要
  const ymKeys = Array.from(new Set(resolved.map((r) => `${r.year}-${r.month}`)));
  const periodIdMap = new Map<string, string>();

  for (const ym of ymKeys) {
    const [y, m] = ym.split('-').map(Number);
    const { data: existingPeriod } = await supabaseAdmin
      .from('evaluation_periods')
      .select('id, status')
      .eq('org_id', actor.org_id)
      .eq('year', y)
      .eq('month', m)
      .maybeSingle();

    if (existingPeriod) {
      periodIdMap.set(ym, existingPeriod.id);
    } else {
      const lastDay = new Date(y, m, 0).getDate();
      // 補建 status='已截止' period(歷史匯入語意 = 該月已過、評核已結束)
      const { data: newPeriod, error: insErr } = await supabaseAdmin
        .from('evaluation_periods')
        .insert({
          org_id: actor.org_id,
          year: y,
          month: m,
          status: '已截止',
          activated_by: actor.employee_number,
          activated_at: new Date(y, m - 1, 20, 9, 0, 0).toISOString(),
          deadline_at: new Date(y, m - 1, lastDay, 23, 59, 59).toISOString(),
        })
        .select('id')
        .single();
      if (insErr || !newPeriod) {
        return bad(`補建 ${y}/${m} period 失敗:${insErr?.message ?? ''}`, 500);
      }
      periodIdMap.set(ym, newPeriod.id);
    }
  }

  // 查既有 evaluations(避免覆蓋)
  const periodIds = Array.from(new Set(periodIdMap.values()));
  const { data: existingEvals } = await supabaseAdmin
    .from('evaluations')
    .select('period_id, evaluatee_id, evaluator_role')
    .in('period_id', periodIds);

  const existingKey = (pid: string, eeId: string, role: string) =>
    `${pid}::${eeId}::${role}`;
  const existingSet = new Set(
    (existingEvals ?? []).map((e) =>
      existingKey(e.period_id, e.evaluatee_id, e.evaluator_role)
    )
  );

  // 過濾:空白整列跳過、已存在跳過
  const toInsert: {
    period_id: string;
    evaluatee_id: string;
    evaluator_role: Role;
    evaluator_id: string;
    score_efficiency: number;
    score_quality: number;
    score_cooperation: number;
    score_attendance: number;
    comment: string | null;
    status: '已填';
    filled_at: string;
    last_modified_at: string;
  }[] = [];
  let skipExisting = 0;
  let skipEmpty = 0;

  for (const r of resolved) {
    const pid = periodIdMap.get(`${r.year}-${r.month}`)!;
    if (r.scores === null) {
      skipEmpty++;
      continue;
    }
    if (existingSet.has(existingKey(pid, r.evaluatee_id, r.role))) {
      skipExisting++;
      continue;
    }
    // 補建月份的「假填寫時間」:該月 25 號 14:00(學長 seed_q1 模式)
    const filledAt = new Date(r.year, r.month - 1, 25, 14, 0, 0).toISOString();
    toInsert.push({
      period_id: pid,
      evaluatee_id: r.evaluatee_id,
      evaluator_role: r.role,
      evaluator_id: r.evaluator_id,
      score_efficiency: r.scores.efficiency,
      score_quality: r.scores.quality,
      score_cooperation: r.scores.cooperation,
      score_attendance: r.scores.attendance,
      comment: r.comment,
      status: '已填',
      filled_at: filledAt,
      last_modified_at: filledAt,
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      inserted: 0,
      skipExisting,
      skipEmpty,
      message: '沒有新資料要寫入(全部空白或已存在)',
    });
  }

  // Insert evaluations + logs
  const { data: inserted, error: evalErr } = await supabaseAdmin
    .from('evaluations')
    .insert(toInsert)
    .select(
      'id, evaluator_id, score_efficiency, score_quality, score_cooperation, score_attendance, filled_at'
    );

  if (evalErr) {
    return bad(`匯入 evaluations 失敗:${evalErr.message}`, 500);
  }

  const logs = (inserted ?? []).map((e) => ({
    evaluation_id: e.id,
    action_type: 'FILL' as const,
    actor_id: actor.employee_number,
    score_efficiency_after: e.score_efficiency,
    score_quality_after: e.score_quality,
    score_cooperation_after: e.score_cooperation,
    score_attendance_after: e.score_attendance,
    status_before: '待填',
    status_after: '已填',
    reason: '歷史 Excel 匯入',
  }));

  if (logs.length > 0) {
    const { error: logErr } = await supabaseAdmin
      .from('evaluation_logs')
      .insert(logs);
    if (logErr) {
      console.error('[import-history] log insert failed:', logErr.message);
    }
  }

  return NextResponse.json({
    inserted: toInsert.length,
    skipExisting,
    skipEmpty,
  });
}
