import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { setSession, setPendingBind } from '@/lib/session';

const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';
const CALLBACK_URL = 'http://localhost:3000/api/auth/line/callback';

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

function errorPage(title: string, message: string) {
  const body = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8" /><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, -apple-system, "Microsoft JhengHei", sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: linear-gradient(135deg, #fafafa, #e4e4e7);
         text-align: center; padding: 2rem; }
  h1 { font-size: 1.75rem; color: #dc2626; margin-bottom: 0.5rem; }
  p { color: #52525b; max-width: 480px; }
  a { color: #2563eb; margin-top: 1.5rem; display: inline-block; }
</style></head><body>
  <h1>❌ ${title}</h1>
  <p>${message}</p>
  <a href="/login">回登入頁</a>
</body></html>`;
  return new NextResponse(body, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const lineError = url.searchParams.get('error');
  const lineErrorDesc = url.searchParams.get('error_description');

  if (lineError) {
    return errorPage('登入未完成', lineErrorDesc || lineError);
  }
  if (!code || !state) {
    return errorPage('參數缺漏', '網址裡少了 code 或 state,請重新登入。');
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const cookieState = cookieStore.get('line_oauth_state')?.value;
  if (!cookieState || state !== cookieState) {
    return errorPage('驗證失敗', '安全驗證碼不符,請重新登入。');
  }
  cookieStore.delete('line_oauth_state');

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return errorPage('伺服器設定錯誤', 'LINE_CHANNEL_ID 或 LINE_CHANNEL_SECRET 沒設定。');
  }

  // Exchange code for access token
  const tokenRes = await fetch(LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_URL,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!tokenRes.ok) {
    return errorPage('Token 交換失敗', (await tokenRes.text()).slice(0, 500));
  }
  const token = (await tokenRes.json()) as { access_token: string };

  // Fetch profile
  const profileRes = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) {
    return errorPage('抓取個人資料失敗', `Status ${profileRes.status}`);
  }
  const profile = (await profileRes.json()) as LineProfile;

  // Look up employee by line_user_id
  const { data: emp, error: lookupErr } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, status')
    .eq('line_user_id', profile.userId)
    .maybeSingle();

  if (lookupErr) {
    return errorPage('查詢員工資料失敗', lookupErr.message);
  }

  if (emp) {
    // Already bound — log them in
    if (emp.status !== '在職') {
      return errorPage(
        '帳號已停用',
        `員工編號 ${emp.employee_number} 目前是停用狀態,無法登入。請聯絡秘書。`
      );
    }
    await setSession({
      employee_number: emp.employee_number,
      line_user_id: profile.userId,
    });
    return NextResponse.redirect(new URL('/', request.url));
  }

  // First-time login — go to bind page
  await setPendingBind({
    line_user_id: profile.userId,
    line_display_name: profile.displayName,
  });
  return NextResponse.redirect(new URL('/login/bind', request.url));
}
