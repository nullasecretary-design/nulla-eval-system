import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// 每天掃過所有「進行中」且 deadline 已過的評核期:
//   1) 把 status='待填' / '已解鎖' 的 evaluations 改成 '逾期未填'
//   2) 把該 period status 改成 '已截止'
// 由 Vercel Cron 每天 00:00 UTC(台北 08:00)觸發。
// 規格 §3.4。

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const nowIso = new Date().toISOString();

  const { data: expired, error: periodErr } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, year, month')
    .eq('status', '進行中')
    .lt('deadline_at', nowIso);

  if (periodErr) {
    return NextResponse.json(
      { error: '查詢評核期失敗:' + periodErr.message },
      { status: 500 }
    );
  }

  const closed: {
    period_id: string;
    year: number;
    month: number;
    expired_evals: number;
  }[] = [];
  const failed: { period_id: string; reason: string }[] = [];

  for (const p of expired ?? []) {
    const { data: updatedEvals, error: evalErr } = await supabaseAdmin
      .from('evaluations')
      .update({ status: '逾期未填' })
      .eq('period_id', p.id)
      .in('status', ['待填', '已解鎖'])
      .select('id');

    if (evalErr) {
      failed.push({ period_id: p.id, reason: '更新 evaluations 失敗:' + evalErr.message });
      continue;
    }

    const { error: periodUpdErr } = await supabaseAdmin
      .from('evaluation_periods')
      .update({ status: '已截止' })
      .eq('id', p.id);

    if (periodUpdErr) {
      failed.push({ period_id: p.id, reason: '關閉 period 失敗:' + periodUpdErr.message });
      continue;
    }

    closed.push({
      period_id: p.id,
      year: p.year,
      month: p.month,
      expired_evals: updatedEvals?.length ?? 0,
    });
  }

  return NextResponse.json({
    ok: true,
    closed_count: closed.length,
    closed,
    failed,
  });
}
