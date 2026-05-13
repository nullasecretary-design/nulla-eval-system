import 'server-only';
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  // Don't throw — let env be missing in some environments;
  // sendEmail() below will short-circuit and log instead.
  console.warn(
    '[email] GMAIL_USER 或 GMAIL_APP_PASSWORD 沒設定,所有寄信會被略過'
  );
}

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_APP_PASSWORD,
        },
      })
    : null;

export const APP_URL = APP_BASE_URL;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * 寄一封信。失敗時不 throw,只 log — 因為通知不該擋住主要流程(送出評核、解鎖等)。
 * Returns true if mail was attempted and accepted by SMTP, false otherwise.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!transporter || !GMAIL_USER) {
    console.warn('[email] skip (沒設定 SMTP):', input.subject, '→', input.to);
    return false;
  }
  if (!input.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    console.warn('[email] skip (收件人 email 不合法):', input.to);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"NULLA 評核系統" <${GMAIL_USER}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    console.info('[email] sent:', input.subject, '→', input.to);
    return true;
  } catch (e) {
    console.error('[email] failed:', input.subject, '→', input.to, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Templates — 統一中文模板,寄件人 = 「NULLA 評核系統」
// ---------------------------------------------------------------------------

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:'PingFang TC',-apple-system,BlinkMacSystemFont,'Microsoft JhengHei',sans-serif;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e4e4e7;">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="font-size:12px;color:#71717a;margin:0;">這封信由 NULLA 評核系統自動寄出,請勿直接回覆。</p>
  </div>
</body>
</html>`;
}

/**
 * 員工填完自評 → 通知該員工的主管。
 */
export function buildSelfDoneNotice(opts: {
  evaluateeName: string;
  year: number;
  month: number;
}): { subject: string; html: string; text: string } {
  const { evaluateeName, year, month } = opts;
  const link = `${APP_BASE_URL}/evaluations/me`;
  const subject = `${evaluateeName} 已完成 ${year}/${month} 自評,輪到你了`;
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">輪到你填主管評核</h2>
    <p style="margin:0 0 12px;">你直屬下屬 <strong>${evaluateeName}</strong> 已完成 ${year} 年 ${month} 月自評。</p>
    <p style="margin:0 0 20px;">請進系統完成你那邊的主管評核。</p>
    <a href="${link}" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">進系統評分 →</a>
  `);
  const text = `${evaluateeName} 已完成 ${year}/${month} 自評,請進系統完成你那邊的主管評核:${link}`;
  return { subject, html, text };
}

/**
 * 秘書啟動本月評核 → 通知全體有評核要填的員工(規格 §3.4)。
 */
export function buildKickoffNotice(opts: {
  recipientName: string;
  year: number;
  month: number;
  deadlineLabel: string; // 已格式化的中文日期 e.g. "2026/05/31 23:59"
}): { subject: string; html: string; text: string } {
  const { recipientName, year, month, deadlineLabel } = opts;
  const link = `${APP_BASE_URL}/evaluations/me`;
  const subject = `${year}/${month} 評核開始,請開始填寫`;
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">本月評核開始</h2>
    <p style="margin:0 0 8px;">${recipientName} 您好,</p>
    <p style="margin:0 0 12px;">${year} 年 ${month} 月評核已經啟動,請進系統填寫本月評核表單。</p>
    <p style="margin:0 0 20px;"><strong>截止時間:${deadlineLabel}</strong></p>
    <a href="${link}" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">進系統填寫 →</a>
  `);
  const text = `${year}/${month} 評核已啟動,請進系統填寫本月評核表單。截止:${deadlineLabel}。${link}`;
  return { subject, html, text };
}

/**
 * 後台動作審計通知:解鎖評核分數(Becca's add 2026-05-13)。
 * 寄給所有秘書 + 超管,actor 也收一份(動作備份)。
 */
export function buildUnlockAuditNotice(opts: {
  actorName: string;
  evaluateeName: string;
  evaluatorName: string;
  evaluatorRole: '自評' | '主管' | '執行長';
  year: number;
  month: number;
  reason: string | null;
}): { subject: string; html: string; text: string } {
  const { actorName, evaluateeName, evaluatorName, evaluatorRole, year, month, reason } = opts;
  const link = `${APP_BASE_URL}/admin/unlocks`;
  const subject = `[NULLA] 評核分數已解鎖:${evaluateeName} 的 ${year}/${month} ${evaluatorRole}評`;
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">評核分數解鎖紀錄</h2>
    <p style="margin:0 0 8px;">${actorName} 剛剛解鎖了一筆評核分數,內容如下:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#3f3f46;">
      <li>被評核者:<strong>${evaluateeName}</strong></li>
      <li>評核者:${evaluatorName}</li>
      <li>評核類別:${evaluatorRole}評</li>
      <li>月份:${year} 年 ${month} 月</li>
      <li>原因:${reason ?? '(未填)'}</li>
    </ul>
    <p style="margin:0 0 16px;">這封信是動作備份,所有秘書 / 超管 都會收到。解鎖後員工的這筆評核會變回「待填」,可以重新送出。</p>
    <a href="${link}" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">查看完整解鎖紀錄 →</a>
  `);
  const text = `${actorName} 解鎖了 ${evaluateeName} 的 ${year}/${month} ${evaluatorRole}評。原因:${reason ?? '(未填)'}。查看:${link}`;
  return { subject, html, text };
}

/**
 * 後台動作審計通知:管理者身分變更(spec §9.1,Becca 2026-05-13 加實作)。
 * 寄給所有超管。建立員工時 before = '(新建立)'。
 */
export function buildAdminRoleChangeNotice(opts: {
  actorName: string;
  targetName: string;
  targetEmpNum: string;
  before: string;
  after: string;
}): { subject: string; html: string; text: string } {
  const { actorName, targetName, targetEmpNum, before, after } = opts;
  const subject = `[NULLA] 管理者身分變更:${targetName} ${before} → ${after}`;
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">管理者身分變更紀錄</h2>
    <p style="margin:0 0 8px;">${actorName} 剛剛變更了一位員工的管理者身分:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#3f3f46;">
      <li>對象:<strong>${targetName}</strong>(${targetEmpNum})</li>
      <li>變更前:${before}</li>
      <li>變更後:<strong>${after}</strong></li>
    </ul>
    <p style="margin:0;font-size:12px;color:#71717a;">這封信是動作備份,所有超管都會收到。可備查信箱搜尋「管理者身分變更」找歷史。</p>
  `);
  const text = `${actorName} 把 ${targetName}(${targetEmpNum})的管理者身分從「${before}」改成「${after}」。`;
  return { subject, html, text };
}

/**
 * 後台動作審計通知:解除 LINE 綁定(Becca's add 2026-05-13)。
 */
export function buildUnbindLineAuditNotice(opts: {
  actorName: string;
  targetName: string;
  targetEmpNum: string;
}): { subject: string; html: string; text: string } {
  const { actorName, targetName, targetEmpNum } = opts;
  const subject = `[NULLA] LINE 綁定已解除:${targetName}`;
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">LINE 綁定解除紀錄</h2>
    <p style="margin:0 0 8px;">${actorName} 剛剛解除了一位員工的 LINE 綁定,內容如下:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#3f3f46;">
      <li>對象:<strong>${targetName}</strong>(${targetEmpNum})</li>
      <li>動作:解除 LINE 綁定</li>
    </ul>
    <p style="margin:0 0 8px;">該員工下次點 LINE 登入時,系統會請他輸入員工編號重新綁定。</p>
    <p style="margin:0;font-size:12px;color:#71717a;">這封信是動作備份,所有秘書 / 超管 都會收到。</p>
  `);
  const text = `${actorName} 解除了 ${targetName}(${targetEmpNum})的 LINE 綁定。該員工下次登入時要重新輸入員工編號綁定。`;
  return { subject, html, text };
}

/**
 * 一鍵 / 單獨催繳:某人本月還有未完成的評核。
 */
export function buildReminderNotice(opts: {
  recipientName: string;
  year: number;
  month: number;
  pendingItems: string[]; // e.g. ['自評', '主管評(對 Eric)']
}): { subject: string; html: string; text: string } {
  const { recipientName, year, month, pendingItems } = opts;
  const link = `${APP_BASE_URL}/evaluations/me`;
  const subject = `提醒:${year}/${month} 評核還沒完成`;
  const itemsHtml = pendingItems
    .map((p) => `<li style="margin:4px 0;">${p}</li>`)
    .join('');
  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;color:#18181b;">本月評核還沒完成</h2>
    <p style="margin:0 0 8px;">${recipientName} 您好,</p>
    <p style="margin:0 0 12px;">${year} 年 ${month} 月的評核還有以下項目沒完成:</p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#3f3f46;">${itemsHtml}</ul>
    <a href="${link}" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">進系統填寫 →</a>
  `);
  const text = `${year}/${month} 評核未完成項目:${pendingItems.join('、')}。請進系統填寫:${link}`;
  return { subject, html, text };
}
