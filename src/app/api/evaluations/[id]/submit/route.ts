import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX = {
  efficiency: 30,
  quality: 25,
  cooperation: 25,
  attendance: 20,
} as const;

type ScoreKey = keyof typeof MAX;

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('請求格式錯誤');
  }
  if (!body || typeof body !== 'object') return bad('請求格式錯誤');

  const { scores, comment } = body as {
    scores?: Record<ScoreKey, unknown>;
    comment?: unknown;
  };
  if (!scores || typeof scores !== 'object') return bad('缺少分數');

  // Validate each score
  const validated: Record<ScoreKey, number> = {
    efficiency: 0,
    quality: 0,
    cooperation: 0,
    attendance: 0,
  };
  for (const key of Object.keys(MAX) as ScoreKey[]) {
    const v = scores[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX[key]) {
      return bad(`「${key}」分數不合法(必須 0–${MAX[key]} 整數)`);
    }
    validated[key] = v;
  }

  const trimmedComment =
    typeof comment === 'string' && comment.trim() ? comment.trim() : null;

  // Look up evaluation row
  const { data: evalRow, error: lookupErr } = await supabaseAdmin
    .from('evaluations')
    .select('id, evaluator_id, status')
    .eq('id', id)
    .maybeSingle();

  if (lookupErr) return bad('查詢失敗:' + lookupErr.message, 500);
  if (!evalRow) return bad('找不到評核紀錄', 404);

  // Authorization: must be the evaluator
  if (evalRow.evaluator_id !== session.employee_number) {
    return bad('你不是這筆評核的填寫人', 403);
  }

  if (evalRow.status !== '待填') {
    return bad(`這筆評核狀態是「${evalRow.status}」,不能填寫`, 409);
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from('evaluations')
    .update({
      score_efficiency: validated.efficiency,
      score_quality: validated.quality,
      score_cooperation: validated.cooperation,
      score_attendance: validated.attendance,
      comment: trimmedComment,
      status: '已填',
      filled_at: now,
      last_modified_at: now,
    })
    .eq('id', id);

  if (updateErr) return bad('儲存失敗:' + updateErr.message, 500);

  // Append-only log entry
  const { error: logErr } = await supabaseAdmin
    .from('evaluation_logs')
    .insert({
      evaluation_id: id,
      action_type: 'FILL',
      actor_id: session.employee_number,
      score_efficiency_after: validated.efficiency,
      score_quality_after: validated.quality,
      score_cooperation_after: validated.cooperation,
      score_attendance_after: validated.attendance,
      status_before: '待填',
      status_after: '已填',
    });

  if (logErr) {
    // Don't block success, but report
    console.error('evaluation_logs insert failed:', logErr.message);
  }

  return NextResponse.json({ ok: true });
}
