import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  canViewReports,
  loadQuarter,
  quarterMonths,
} from '@/app/admin/reports/_lib/quarter';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtNum(n: number | null): string {
  return n === null ? '—' : n.toFixed(1);
}

// Asia/Taipei = UTC+8(台灣沒有夏令時間,固定偏移)
function nowInTaipei(): { display: string; filename: string } {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = tw.getUTCFullYear();
  const m = String(tw.getUTCMonth() + 1).padStart(2, '0');
  const d = String(tw.getUTCDate()).padStart(2, '0');
  const hh = String(tw.getUTCHours()).padStart(2, '0');
  const mi = String(tw.getUTCMinutes()).padStart(2, '0');
  return {
    display: `${y}/${m}/${d} ${hh}:${mi}`,
    filename: `${y}${m}${d}_${hh}${mi}`,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string; quarter: string }> }
) {
  const session = await getSession();
  if (!session) return bad('未登入', 401);

  const { year: yearStr, quarter: quarterStr } = await params;
  const year = Number(yearStr);
  const quarter = Number(quarterStr) as 1 | 2 | 3 | 4;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(quarter) ||
    quarter < 1 ||
    quarter > 4
  ) {
    return bad('網址有誤');
  }

  const { data: actor } = await supabaseAdmin
    .from('employees')
    .select('employee_number, position, admin_role, status, org_id')
    .eq('employee_number', session.employee_number)
    .single();
  if (!actor) return bad('找不到使用者', 404);
  if (actor.status !== '在職') return bad('帳號已停用', 403);
  if (!canViewReports(actor)) return bad('沒有看報表的權限', 403);

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name, code')
    .eq('id', actor.org_id)
    .single();

  const data = await loadQuarter(actor.org_id, year, quarter);
  if (!data) return bad('這個季度尚無資料', 404);

  const months = quarterMonths(quarter);

  // 表頭
  const header = [
    '員工編號',
    '姓名',
    '部門',
    '職務',
    ...months.flatMap((m) => [
      `${m}月 自評`,
      `${m}月 主管`,
      `${m}月 執行長`,
      `${m}月 加權`,
    ]),
    '季度加權平均',
    '是否缺評',
  ];

  const now = nowInTaipei();

  const lines: string[] = [];
  // 開頭幾筆 metadata,讓使用者光看檔頭就知道資料是何時下載的
  lines.push(['下載時間', now.display].map(csvCell).join(','));
  lines.push(['季度', `${year} Q${quarter}`].map(csvCell).join(','));
  lines.push(['公司', org?.name ?? '—'].map(csvCell).join(','));
  lines.push(''); // 空白列分隔
  lines.push(header.map(csvCell).join(','));

  for (const r of data.rows) {
    const cells: (string | number)[] = [
      r.employee_number,
      r.name,
      r.department,
      r.job_title,
    ];
    for (const md of r.monthly) {
      const selfTotal =
        md.evals.self === null
          ? null
          : md.evals.self.efficiency +
            md.evals.self.quality +
            md.evals.self.cooperation +
            md.evals.self.attendance;
      const mgrTotal =
        md.evals.mgr === null
          ? null
          : md.evals.mgr.efficiency +
            md.evals.mgr.quality +
            md.evals.mgr.cooperation +
            md.evals.mgr.attendance;
      const ceoTotal =
        md.evals.ceo === null
          ? null
          : md.evals.ceo.efficiency +
            md.evals.ceo.quality +
            md.evals.ceo.cooperation +
            md.evals.ceo.attendance;
      cells.push(fmtNum(selfTotal), fmtNum(mgrTotal), fmtNum(ceoTotal), fmtNum(md.weightedTotal));
    }
    cells.push(fmtNum(r.quarterAvg));
    cells.push(r.hasMissing ? '是' : '否');
    lines.push(cells.map(csvCell).join(','));
  }

  // BOM 讓 Excel 開繁中不亂碼
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const filename = `${org?.code ?? 'ORG'}_${year}_Q${quarter}_report_${now.filename}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
