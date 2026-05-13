import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

function bad(message: string, status = 400) {
  return new NextResponse(message, { status });
}

// 範本順序(每月內):自評 6 → 執行長 6 → 主管 2(Becca 紙本順序)
const ROLE_ORDER = ['自評', '執行長', '主管'] as const;

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year'));
  const quarter = Number(url.searchParams.get('quarter'));
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(quarter) ||
    quarter < 1 ||
    quarter > 4
  ) {
    return bad('year / quarter 參數不合法');
  }

  const months = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];

  const { data: emps } = await supabaseAdmin
    .from('employees')
    .select('employee_number, name, position, admin_role, manager_id')
    .eq('org_id', actor.org_id)
    .eq('status', '在職');
  if (!emps) return bad('查不到員工', 500);

  const ceo = emps.find((e) => e.position === '執行長');
  if (!ceo) return bad('本公司沒有執行長,無法產生範本', 500);

  const nameOf = (id: string) =>
    emps.find((e) => e.employee_number === id)?.name ?? id;

  // 表頭
  const rows: (string | number)[][] = [
    [
      '年',
      '月',
      '被評核者',
      '角色',
      '評核者',
      '時效(0-30)',
      '品質(0-25)',
      '配合(0-25)',
      '出勤(0-20)',
      '備註',
    ],
  ];

  for (const m of months) {
    for (const role of ROLE_ORDER) {
      for (const e of emps) {
        // CEO 不被自評/主管/執行長 任何一個評,但他自己會評別人(role=執行長)
        // 會計 不評核也不被評
        if (e.admin_role === '會計') continue;

        if (role === '自評') {
          if (e.position === '執行長') continue; // CEO 不填自評
          rows.push([year, m, e.name, '自評', e.name, '', '', '', '', '']);
        } else if (role === '執行長') {
          if (e.position === '執行長') continue; // CEO 不被自己評
          rows.push([year, m, e.name, '執行長', ceo.name, '', '', '', '', '']);
        } else if (role === '主管') {
          // 主管評:該員工有主管 + 主管不是 CEO 的人才有
          if (e.position === '執行長') continue;
          if (!e.manager_id) continue;
          if (e.manager_id === ceo.employee_number) continue;
          rows.push([
            year,
            m,
            e.name,
            '主管',
            nameOf(e.manager_id),
            '',
            '',
            '',
            '',
            '',
          ]);
        }
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 4 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 11 },
    { wch: 11 },
    { wch: 11 },
    { wch: 11 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${year}Q${quarter}`);
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  const blob = new Blob([new Uint8Array(arr)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return new NextResponse(blob, {
    headers: {
      'Content-Disposition': `attachment; filename="${year}Q${quarter}_evaluation_template.xlsx"`,
    },
  });
}
