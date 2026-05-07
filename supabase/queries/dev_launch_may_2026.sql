-- ============================================================================
-- DEV: Reset + 啟動 NULLA 2026 年 5 月 評核
-- ============================================================================
-- 跑這個 SQL 會做四件事:
--   1. 修正員工的主管關係(NULLA0003/0008 歸 Becca,其他直屬老闆)
--   2. 把小嫚 (NULLA0006) 的 admin_role 從超管改成會計、主管改成 CEO
--   3. 清掉這個月任何已存在的評核 + log(可重跑)
--   4. 重新建立本月評核期 + 14 張評核空白 row
--
-- 規則(對齊 spec §3.3 + Becca 2026-05-08 修正):
--   - 老闆 (CEO, position=執行長) 不填自評
--   - 會計 (admin_role=會計) 完全跳過 NULLA 評核(留系統權限)
--   - 主管評只給「manager 不是 CEO」的人(直屬執行長者跳過主管那層)
--   - 執行長評給除 CEO 跟會計以外所有在職員工
--
-- 預期結果:自評 6 + 主管 2 + 執行長 6 = 14 張
-- ============================================================================

DO $$
DECLARE
    v_org_id    uuid;
    v_period_id uuid;
    v_ceo_id    text;
BEGIN
    SELECT id INTO v_org_id
    FROM organizations
    WHERE code = 'NULLA';

    SELECT employee_number INTO v_ceo_id
    FROM employees
    WHERE org_id = v_org_id AND position = '執行長' AND status = '在職'
    LIMIT 1;

    -- ------------------------------------------------------------------------
    -- 1) 修正員工結構(idempotent)
    -- ------------------------------------------------------------------------

    -- 小嫚:admin_role 改回會計,主管改成 CEO
    UPDATE employees
    SET admin_role = '會計', manager_id = 'NULLA0001'
    WHERE employee_number = 'NULLA0006';

    -- 3 個直屬老闆的同事:主管改成 CEO
    UPDATE employees
    SET manager_id = 'NULLA0001'
    WHERE employee_number IN ('NULLA0012', 'NULLA0013', 'NULLA0016');

    -- (NULLA0003, NULLA0008 維持 manager=NULLA0011,即 Becca 的兩位下屬)


    -- ------------------------------------------------------------------------
    -- 2) 清掉舊的 logs + evals + period(暫時關掉 append-only trigger)
    -- ------------------------------------------------------------------------

    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_update;

    DELETE FROM evaluation_logs
    WHERE evaluation_id IN (
        SELECT id FROM evaluations
        WHERE period_id IN (
            SELECT id FROM evaluation_periods
            WHERE org_id = v_org_id AND year = 2026 AND month = 5
        )
    );

    DELETE FROM evaluations
    WHERE period_id IN (
        SELECT id FROM evaluation_periods
        WHERE org_id = v_org_id AND year = 2026 AND month = 5
    );

    DELETE FROM evaluation_periods
    WHERE org_id = v_org_id AND year = 2026 AND month = 5;

    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_update;


    -- ------------------------------------------------------------------------
    -- 3) 建立本月評核期
    -- ------------------------------------------------------------------------

    INSERT INTO evaluation_periods
        (org_id, year, month, status, activated_by, activated_at, deadline_at)
    VALUES
        (v_org_id, 2026, 5, '進行中', 'NULLA0011', now(), now() + interval '14 days')
    RETURNING id INTO v_period_id;


    -- ------------------------------------------------------------------------
    -- 4) 自評 — 跳過 CEO 跟會計
    -- ------------------------------------------------------------------------

    INSERT INTO evaluations (period_id, evaluatee_id, evaluator_role, evaluator_id, status)
    SELECT v_period_id, employee_number, '自評', employee_number, '待填'
    FROM employees
    WHERE org_id = v_org_id
      AND status = '在職'
      AND position <> '執行長'
      AND admin_role <> '會計';


    -- ------------------------------------------------------------------------
    -- 5) 主管評 — 只給 manager 不是 CEO 且不是會計的人
    -- ------------------------------------------------------------------------

    INSERT INTO evaluations (period_id, evaluatee_id, evaluator_role, evaluator_id, status)
    SELECT v_period_id, e.employee_number, '主管', e.manager_id, '待填'
    FROM employees e
    WHERE e.org_id = v_org_id
      AND e.status = '在職'
      AND e.manager_id IS NOT NULL
      AND e.manager_id <> v_ceo_id
      AND e.admin_role <> '會計';


    -- ------------------------------------------------------------------------
    -- 6) 執行長評 — 除了 CEO 自己跟會計以外所有人
    -- ------------------------------------------------------------------------

    INSERT INTO evaluations (period_id, evaluatee_id, evaluator_role, evaluator_id, status)
    SELECT v_period_id, e.employee_number, '執行長', v_ceo_id, '待填'
    FROM employees e
    WHERE e.org_id = v_org_id
      AND e.status = '在職'
      AND e.position <> '執行長'
      AND e.admin_role <> '會計';
END $$;


-- ============================================================================
-- 檢查
-- ============================================================================
-- 預期看到:
--   自評    | 6 | NULLA0003, NULLA0008, NULLA0011, NULLA0012, NULLA0013, NULLA0016
--   主管    | 2 | NULLA0003, NULLA0008
--   執行長  | 6 | NULLA0003, NULLA0008, NULLA0011, NULLA0012, NULLA0013, NULLA0016
-- 合計 14 張
-- ============================================================================

SELECT
    evaluator_role,
    COUNT(*) AS row_count,
    STRING_AGG(DISTINCT evaluatee_id, ', ' ORDER BY evaluatee_id) AS evaluatees
FROM evaluations
WHERE period_id = (
    SELECT id FROM evaluation_periods
    WHERE org_id = (SELECT id FROM organizations WHERE code = 'NULLA')
      AND year = 2026 AND month = 5
)
GROUP BY evaluator_role
ORDER BY evaluator_role;
