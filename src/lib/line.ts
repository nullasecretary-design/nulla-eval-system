import 'server-only';

const LINE_TOKEN = process.env.LINE_MESSAGING_TOKEN;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

if (!LINE_TOKEN) {
  console.warn(
    '[line] LINE_MESSAGING_TOKEN 沒設定,所有 LINE 推播會被略過'
  );
}

const PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

/**
 * 推一則訊息給某個 LINE 使用者。
 * 失敗只 log,不 throw,因為通知不應該擋住主要流程。
 *
 * 注意:對方必須已經把 bot(@315kvthv)加為好友,否則 LINE 會回 400 errors。
 * 回傳值:true = LINE 收下訊息 / false = 沒寄出(token 沒設、user_id 沒填、bot 沒被加好友、其他錯)
 */
export async function pushLine(opts: {
  to: string | null | undefined; // LINE user_id
  text: string;
}): Promise<boolean> {
  if (!LINE_TOKEN) {
    console.warn('[line] skip (沒設 token)');
    return false;
  }
  if (!opts.to) {
    console.warn('[line] skip (沒 line_user_id)');
    return false;
  }
  try {
    const res = await fetch(PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: opts.to,
        messages: [{ type: 'text', text: opts.text }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[line] push failed (${res.status}):`, errText);
      return false;
    }
    console.info('[line] sent to', opts.to.slice(0, 8) + '...');
    return true;
  } catch (e) {
    console.error('[line] push error:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message templates — LINE 純文字,短一點(LINE 訊息超過 5000 字元才會被截,
// 但實務上短訊比較舒服)
// ---------------------------------------------------------------------------

export function buildSelfDoneLine(opts: {
  evaluateeName: string;
  year: number;
  month: number;
}): string {
  const link = `${APP_BASE_URL}/evaluations/me`;
  return [
    `🔔 NULLA 評核提醒`,
    ``,
    `${opts.evaluateeName} 已完成 ${opts.year}/${opts.month} 自評,輪到你填主管評核了。`,
    ``,
    `進系統:${link}`,
  ].join('\n');
}

export function buildKickoffLine(opts: {
  recipientName: string;
  year: number;
  month: number;
  deadlineLabel: string;
}): string {
  const link = `${APP_BASE_URL}/evaluations/me`;
  return [
    `🔔 NULLA 評核啟動`,
    ``,
    `${opts.recipientName} 您好,${opts.year}/${opts.month} 評核已開始,請進系統填寫本月評核表單。`,
    ``,
    `截止:${opts.deadlineLabel}`,
    ``,
    `進系統:${link}`,
  ].join('\n');
}

export function buildReminderLine(opts: {
  recipientName: string;
  year: number;
  month: number;
  pendingItems: string[];
}): string {
  const link = `${APP_BASE_URL}/evaluations/me`;
  return [
    `🔔 NULLA 評核提醒`,
    ``,
    `${opts.recipientName} 您好,${opts.year}/${opts.month} 還有以下評核沒完成:`,
    ...opts.pendingItems.map((p) => `・${p}`),
    ``,
    `進系統:${link}`,
  ].join('\n');
}
