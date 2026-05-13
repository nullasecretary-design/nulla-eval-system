import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// 月初自動建本月「待啟動」評核期 row(每家 active org 一筆)。
// 由 Vercel Cron 每月 1 號 00:00 UTC(台北 08:00)觸發。
// 規格 §3.4 + schema v0.1 Table 3。

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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: orgs, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, code')
    .eq('is_active', true);

  if (orgErr || !orgs) {
    return NextResponse.json(
      { error: '查詢組織失敗:' + (orgErr?.message ?? '無資料') },
      { status: 500 }
    );
  }

  const created: string[] = [];
  const skipped: { org: string; reason: string }[] = [];

  for (const org of orgs) {
    const { data: existing } = await supabaseAdmin
      .from('evaluation_periods')
      .select('id, status')
      .eq('org_id', org.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (existing) {
      skipped.push({ org: org.code, reason: `已有 row(${existing.status})` });
      continue;
    }

    const { error: insertErr } = await supabaseAdmin
      .from('evaluation_periods')
      .insert({ org_id: org.id, year, month, status: '待啟動' });

    if (insertErr) {
      skipped.push({ org: org.code, reason: `建檔失敗:${insertErr.message}` });
      continue;
    }

    created.push(org.code);
  }

  return NextResponse.json({ ok: true, year, month, created, skipped });
}
