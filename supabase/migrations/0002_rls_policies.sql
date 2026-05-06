-- ============================================================================
-- 績效評核系統 — RLS 政策(階段一)
-- ============================================================================
-- Version: v0.1
-- Created: 2026-05-06
-- Designer: Becca + Claude
-- Reference: docs/spec_v0.2.md §4(登入)、§10(權限速查表)
--
-- 這個 migration 做三件事:
--   1. 在 employees 加 auth_user_id 欄位(LINE Login 綁定流程於首次登入時寫入)
--   2. 建 4 個輔助函數,讓 RLS 可以快速取得「目前登入者的身分」
--   3. 對 8 張表啟用 RLS,並依 spec §10 寫對應的 SELECT 政策
--
-- 範圍說明(YAGNI):
--   - 本次只寫 SELECT 政策(讓使用者「看到」對的資料)+ 一個 UPDATE 政策
--     (讓使用者填自己的評核)
--   - 其他 INSERT/UPDATE/DELETE 暫不開放給前端,由後端 service_role 處理
--   - 等實際做到那個 UI 功能時再回頭補對應的 policy
-- ============================================================================


-- ============================================================================
-- Step 1: employees 加 auth_user_id 欄位
-- ============================================================================
-- spec §4.3 綁定流程:員工首次以 LINE 登入後,輸入員工編號完成綁定。
-- 此欄位於綁定當下寫入(由後端 service_role 執行),之後 auth.uid() 就能對到 employee row。
-- nullable 因為員工建檔當下還沒登入過,先留空。

ALTER TABLE employees
    ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_auth_user_id ON employees(auth_user_id);

COMMENT ON COLUMN employees.auth_user_id IS
    'Supabase auth.users.id — LINE Login 綁定時寫入(spec §4.3)';


-- ============================================================================
-- Step 2: 輔助函數 — 取得目前登入者的身分
-- ============================================================================
-- 用 SECURITY DEFINER 讓函數本身能繞過 RLS 查 employees(避免遞迴)。
-- 函數本體都是純 SELECT,不會被拿來改資料,使用上安全。

CREATE OR REPLACE FUNCTION current_employee_number()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT employee_number FROM employees WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_employee_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id FROM employees WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_employee_admin_role()
RETURNS admin_role_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT admin_role FROM employees WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_employee_position()
RETURNS position_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT position FROM employees WHERE auth_user_id = auth.uid()
$$;

COMMENT ON FUNCTION current_employee_number()     IS '目前登入者的員工編號(透過 auth.uid() 對應)';
COMMENT ON FUNCTION current_employee_org_id()     IS '目前登入者所屬組織';
COMMENT ON FUNCTION current_employee_admin_role() IS '目前登入者的管理者身分(無/秘書/會計/超管)';
COMMENT ON FUNCTION current_employee_position()   IS '目前登入者的職位(一般員工/主管/執行長)';


-- ============================================================================
-- Step 3: 對 8 張表啟用 RLS
-- ============================================================================
-- 啟用後預設「全部拒絕」,需明確寫 policy 才能讓資料通過。
-- service_role(後端 admin key)會自動繞過 RLS,所以系統內部作業(月初建檔、
-- 綁定流程)不受影響。

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_binding_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_log          ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Step 4: SELECT policies(誰能看到什麼)
-- ============================================================================
-- 設計依據:spec §10 權限速查表。實作哲學:「資料完整收集,顯示精準分流」。

-- ----------------------------------------------------------------------------
-- organizations:員工看自家;會計、超管看全部
-- ----------------------------------------------------------------------------
CREATE POLICY "organizations_select" ON organizations
    FOR SELECT
    TO authenticated
    USING (
        id = current_employee_org_id()
        OR current_employee_admin_role() IN ('會計', '超級管理員')
    );


-- ----------------------------------------------------------------------------
-- employees:同 org 互相看得到;會計/超管看全部
-- ----------------------------------------------------------------------------
CREATE POLICY "employees_select" ON employees
    FOR SELECT
    TO authenticated
    USING (
        org_id = current_employee_org_id()
        OR current_employee_admin_role() IN ('會計', '超級管理員')
    );


-- ----------------------------------------------------------------------------
-- evaluation_periods:同 org 看;會計/超管全部
-- ----------------------------------------------------------------------------
CREATE POLICY "evaluation_periods_select" ON evaluation_periods
    FOR SELECT
    TO authenticated
    USING (
        org_id = current_employee_org_id()
        OR current_employee_admin_role() IN ('會計', '超級管理員')
    );


-- ----------------------------------------------------------------------------
-- evaluations(系統核心,可見度規則最複雜)
--   spec §10 對照:
--     - 員工:看自己當 evaluator 或 evaluatee 的 row
--     - 主管:看自家(目前簡化為「主管職位 + 同 org」,不查遞迴下屬鏈)
--     - 執行長:看自家全部
--     - 秘書:看自家(進度監看)
--     - 會計:看全部(報表用)
--     - 超管:看全部
-- ----------------------------------------------------------------------------
CREATE POLICY "evaluations_select" ON evaluations
    FOR SELECT
    TO authenticated
    USING (
        -- 自己是評核者或被評核者
        evaluator_id  = current_employee_number()
        OR evaluatee_id = current_employee_number()

        -- 同 org 的主管以上職位(透過 evaluatee 的 org 判斷)
        OR (
            current_employee_position() IN ('主管', '執行長')
            AND EXISTS (
                SELECT 1 FROM employees e
                WHERE e.employee_number = evaluations.evaluatee_id
                  AND e.org_id = current_employee_org_id()
            )
        )

        -- 秘書:同 org
        OR (
            current_employee_admin_role() = '秘書'
            AND EXISTS (
                SELECT 1 FROM employees e
                WHERE e.employee_number = evaluations.evaluatee_id
                  AND e.org_id = current_employee_org_id()
            )
        )

        -- 會計、超管:全部
        OR current_employee_admin_role() IN ('會計', '超級管理員')
    );


-- ----------------------------------------------------------------------------
-- evaluations UPDATE:只有評核者本人可以填自己的 row,且只能在「待填」狀態下
--   送出後系統會把 status 改成「已填」,之後再次 UPDATE 會被擋下
--   解鎖 / 作廢 / 加權覆蓋等動作走後端 service_role,不在此處放行
-- ----------------------------------------------------------------------------
CREATE POLICY "evaluations_update_self" ON evaluations
    FOR UPDATE
    TO authenticated
    USING (
        evaluator_id = current_employee_number()
        AND status = '待填'
    )
    WITH CHECK (
        evaluator_id = current_employee_number()
    );


-- ----------------------------------------------------------------------------
-- evaluation_logs:超管全部;會計、秘書同 org;一般員工看不到
-- ----------------------------------------------------------------------------
CREATE POLICY "evaluation_logs_select" ON evaluation_logs
    FOR SELECT
    TO authenticated
    USING (
        current_employee_admin_role() = '超級管理員'
        OR (
            current_employee_admin_role() IN ('會計', '秘書')
            AND EXISTS (
                SELECT 1 FROM evaluations ev
                JOIN employees e ON e.employee_number = ev.evaluatee_id
                WHERE ev.id = evaluation_logs.evaluation_id
                  AND e.org_id = current_employee_org_id()
            )
        )
    );


-- ----------------------------------------------------------------------------
-- transfer_history:本人可看自己的;同 org 主管以上;超管全部
-- ----------------------------------------------------------------------------
CREATE POLICY "transfer_history_select" ON transfer_history
    FOR SELECT
    TO authenticated
    USING (
        employee_id = current_employee_number()
        OR current_employee_admin_role() IN ('秘書', '會計', '超級管理員')
        OR (
            current_employee_position() IN ('主管', '執行長')
            AND EXISTS (
                SELECT 1 FROM employees e
                WHERE e.employee_number = transfer_history.employee_id
                  AND e.org_id = current_employee_org_id()
            )
        )
    );


-- ----------------------------------------------------------------------------
-- line_binding_history:本人看自己的;超管全部
-- ----------------------------------------------------------------------------
CREATE POLICY "line_binding_history_select" ON line_binding_history
    FOR SELECT
    TO authenticated
    USING (
        employee_id = current_employee_number()
        OR current_employee_admin_role() = '超級管理員'
    );


-- ----------------------------------------------------------------------------
-- deletion_log:只有超管能看
-- ----------------------------------------------------------------------------
CREATE POLICY "deletion_log_select" ON deletion_log
    FOR SELECT
    TO authenticated
    USING (
        current_employee_admin_role() = '超級管理員'
    );


-- ============================================================================
-- 結束說明
-- ============================================================================
-- 此 migration 完成後:
--   ✅ 多租戶隔離(三家公司不會互相看到對方的資料)
--   ✅ 員工只能填自己的評核
--   ✅ 主管/執行長/秘書/會計/超管 各自看到對應範圍
--   ✅ 稽核 log 可被適當角色檢視
--
-- 還沒處理的(等對應功能上線時再補):
--   - 秘書/超管 解鎖評核(需要 UPDATE policy on evaluations.status)
--   - 秘書 啟動評核期(需要 UPDATE policy on evaluation_periods)
--   - 秘書 新增/修改員工(需要 INSERT/UPDATE policies on employees)
--   - 主管下屬遞迴鏈(目前用「同 org + 主管職位」近似)
-- ============================================================================
