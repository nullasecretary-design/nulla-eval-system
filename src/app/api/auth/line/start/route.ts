import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';

function getCallbackUrl(): string {
  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return `${base}/api/auth/line/callback`;
}

export async function GET() {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json(
      { error: 'LINE_CHANNEL_ID 沒設定' },
      { status: 500 }
    );
  }

  // CSRF protection: random state, store in cookie, verify on callback
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('line_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: getCallbackUrl(),
    state,
    scope: 'profile openid',
  });

  return NextResponse.redirect(`${LINE_AUTHORIZE_URL}?${params.toString()}`);
}
