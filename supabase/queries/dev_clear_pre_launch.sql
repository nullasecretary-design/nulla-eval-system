-- ============================================================================
-- DEV: 上線前清空 NULLA 1-5 月測試 + 學長 Q1 假資料
-- ============================================================================
-- 用途:在 2026 上線前把所有 dev / 測試資料清掉,等真實匯入(4 月紙本)+
--      5 月實際啟動。NULLA 6 月以後資料(如有)不會被動。
--
-- 涵蓋:
--   - Q1 (1/2/3 月) 學長 dev_seed_q1_2026.sql 建的假評核
--   - 4 月(如果有空 period 也清掉,等歷史匯入功能重建)
--   - 5 月 Becca 測試的資料
--   - 上述所有 period + evaluations + evaluation_logs
--
-- 跑完之後 NULLA 公司 1-5 月應該完全空白,可以從歷史匯入功能重新建。
-- ============================================================================

DO $$
DECLARE
    v_org_id uuid;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'NULLA';

    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_update;

    DELETE FROM evaluation_logs
    WHERE evaluation_id IN (
        SELECT e.id FROM evaluations e
        JOIN evaluation_periods p ON e.period_id = p.id
        WHERE p.org_id = v_org_id AND p.year = 2026 AND p.month BETWEEN 1 AND 5
    );

    DELETE FROM evaluations
    WHERE period_id IN (
        SELECT id FROM evaluation_periods
        WHERE org_id = v_org_id AND year = 2026 AND month BETWEEN 1 AND 5
    );

    DELETE FROM evaluation_periods
    WHERE org_id = v_org_id AND year = 2026 AND month BETWEEN 1 AND 5;

    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_update;
END $$;

-- 驗證:預期 0 列(所有 1-5 月 period 都已刪)
SELECT p.year, p.month, COUNT(*) AS remaining
FROM evaluation_periods p
WHERE p.org_id = (SELECT id FROM organizations WHERE code = 'NULLA')
  AND p.year = 2026 AND p.month BETWEEN 1 AND 5
GROUP BY p.year, p.month
ORDER BY p.month;
