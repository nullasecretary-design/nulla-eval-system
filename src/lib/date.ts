// 日期 / 時間格式化 — 全部用「台北時區」(Asia/Taipei)。
//
// 為什麼要這個 helper:
// Vercel server 跑在 UTC,直接用 `new Date().getHours()` 之類的 getter
// 會回傳 UTC 時間。例如台北早上 10:01 在 server 上看是 UTC 02:01,
// 顯示到使用者畫面就會看到「02:01」這種詭異時間。
// 用 Intl.DateTimeFormat 顯式指定 timeZone 就能避開。
//
// 客戶端 (browser) 用使用者本地時區也大致 OK,但統一用台北能保證
// server-rendered 跟 client-rendered 的字串一致(避免 hydration mismatch)。

const TW_DATETIME_FORMATTER = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const TW_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 把 ISO 字串(例如 DB timestamptz)格式化成「YYYY/MM/DD HH:mm」台北時區。
 * null / 無效輸入回 '—'。
 */
export function formatDateTimeTW(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = TW_DATETIME_FORMATTER.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

/**
 * 回傳「現在台北時區」的 year / month / day(都是 number)。
 * 解掉 Vercel server 跑 UTC 時,凌晨 0-8 點 `new Date().getMonth()` 還停在昨天的 bug。
 */
export function nowInTaipei(): { year: number; month: number; day: number } {
  const parts = TW_DATE_FORMATTER.formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}
