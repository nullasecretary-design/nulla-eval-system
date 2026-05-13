import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildAdminRoleChangeNotice, sendEmail } from '@/lib/email';

// spec §9.1:管理者身分變更時寄 email 通知所有超管(Becca 2026-05-13 簡化版,
// 不寫獨立 audit table — email 留底即可)。
// 失敗只 log,不擋主動作。
export async function notifyAdminRoleChange(opts: {
  actorName: string;
  orgId: string;
  targetName: string;
  targetEmpNum: string;
  before: string;
  after: string;
}): Promise<void> {
  const { actorName, orgId, targetName, targetEmpNum, before, after } = opts;

  if (before === after) return; // 沒實質變更不通知

  const { data: admins } = await supabaseAdmin
    .from('employees')
    .select('company_email')
    .eq('org_id', orgId)
    .eq('admin_role', '超級管理員')
    .eq('status', '在職');

  const emails = (admins ?? [])
    .map((a) => a.company_email)
    .filter((v): v is string => !!v);

  if (emails.length === 0) return;

  const mail = buildAdminRoleChangeNotice({
    actorName,
    targetName,
    targetEmpNum,
    before,
    after,
  });

  await Promise.allSettled(
    emails.map((to) =>
      sendEmail({ to, ...mail }).catch((e) =>
        console.error('[admin-role] email to', to, 'failed:', e)
      )
    )
  );
}
