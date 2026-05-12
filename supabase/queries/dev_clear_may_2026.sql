-- ============================================================================
-- DEV: 清空 NULLA 2026 年 5 月評核(只刪不重建,讓 UI 進入「未啟動」狀態)
-- ============================================================================
-- 用途:測試 /admin/evaluations 跟首頁 Card A 在「本月尚未啟動」時的畫面
-- 清完之後:秘書/超管 進 /admin/evaluations 會看到啟動表單
-- 想重建本月評核 → 跑 dev_launch_may_2026.sql 或直接從 UI 啟動
-- ============================================================================

DO $$
DECLARE
    v_org_id uuid;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'NULLA';

    -- 暫時關掉 append-only trigger 才能刪 logs
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
END $$;

-- 驗證:應該看到 0 row
SELECT COUNT(*) AS remaining_period_rows
FROM evaluation_periods
WHERE org_id = (SELECT id FROM organizations WHERE code = 'NULLA')
  AND year = 2026 AND month = 5;
