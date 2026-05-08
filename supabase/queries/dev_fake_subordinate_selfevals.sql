-- ============================================================================
-- DEV: 模擬 NULLA0008 + NULLA0012 已填好自評
-- ============================================================================
-- 用途:讓 Becca 在主管評頁面看到員工自評已填的完整樣子
--
-- 規則:
--   - 只動本月 (2026-05) 的「自評」row
--   - 順便寫一筆 evaluation_logs (FILL),跟正式 API 行為一致
-- ============================================================================

DO $$
DECLARE
    v_org_id    uuid;
    v_period_id uuid;
    v_eval_id_8 uuid;
    v_eval_id_12 uuid;
    v_now       timestamptz := now();
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'NULLA';

    SELECT id INTO v_period_id
    FROM evaluation_periods
    WHERE org_id = v_org_id AND year = 2026 AND month = 5;

    -- ------------------------------------------------------------------------
    -- NULLA0008 自評
    -- ------------------------------------------------------------------------
    UPDATE evaluations
    SET
        score_efficiency = 25,
        score_quality = 22,
        score_cooperation = 20,
        score_attendance = 18,
        comment = '本月按時完成所有專案,想多挑戰一點新的領域',
        status = '已填',
        filled_at = v_now,
        last_modified_at = v_now
    WHERE period_id = v_period_id
      AND evaluatee_id = 'NULLA0008'
      AND evaluator_role = '自評'
    RETURNING id INTO v_eval_id_8;

    INSERT INTO evaluation_logs (
        evaluation_id, action_type, actor_id,
        score_efficiency_after, score_quality_after,
        score_cooperation_after, score_attendance_after,
        status_before, status_after
    ) VALUES (
        v_eval_id_8, 'FILL', 'NULLA0008',
        25, 22, 20, 18,
        '待填', '已填'
    );

    -- ------------------------------------------------------------------------
    -- NULLA0012 自評
    -- ------------------------------------------------------------------------
    UPDATE evaluations
    SET
        score_efficiency = 22,
        score_quality = 20,
        score_cooperation = 23,
        score_attendance = 19,
        comment = '還在學習中,跟同事配合很順',
        status = '已填',
        filled_at = v_now,
        last_modified_at = v_now
    WHERE period_id = v_period_id
      AND evaluatee_id = 'NULLA0012'
      AND evaluator_role = '自評'
    RETURNING id INTO v_eval_id_12;

    INSERT INTO evaluation_logs (
        evaluation_id, action_type, actor_id,
        score_efficiency_after, score_quality_after,
        score_cooperation_after, score_attendance_after,
        status_before, status_after
    ) VALUES (
        v_eval_id_12, 'FILL', 'NULLA0012',
        22, 20, 23, 19,
        '待填', '已填'
    );
END $$;


-- ============================================================================
-- 檢查
-- ============================================================================
SELECT
    evaluatee_id,
    status,
    score_efficiency + score_quality + score_cooperation + score_attendance AS total,
    comment
FROM evaluations
WHERE period_id = (
    SELECT id FROM evaluation_periods
    WHERE org_id = (SELECT id FROM organizations WHERE code = 'NULLA')
      AND year = 2026 AND month = 5
)
  AND evaluator_role = '自評'
  AND evaluatee_id IN ('NULLA0008', 'NULLA0012')
ORDER BY evaluatee_id;
