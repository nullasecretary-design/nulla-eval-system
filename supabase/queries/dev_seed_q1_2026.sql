-- ============================================================================
-- DEV: 建立 NULLA 2026 Q1(1/2/3 月)假歷史評核
-- ============================================================================
-- 用途:讓歷史紀錄頁有真實的過去資料可以顯示
--
-- 跑這個 SQL 會做三件事:
--   1. 清掉 NULLA Q1 2026 任何已存在的 period + evals + logs(可重跑)
--   2. 建立 1/2/3 月各一個 period(status='已截止')
--   3. 為每個月建 14 張完整填好的評核(自評 6 + 主管 2 + 執行長 6 = 42 列)
--
-- 分數設計:
--   - 每位員工有自己的「程度」基準(NULLA0011 最高,NULLA0016 較低)
--   - 二月稍降、三月稍升 — 讓三個月看起來有變化
--   - 自評跟主管/執行長評有差距(NULLA0012 低估自己、NULLA0016 高估自己)
-- ============================================================================

DO $$
DECLARE
    v_org_id  uuid;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'NULLA';

    -- ------------------------------------------------------------------------
    -- 1) 清掉舊資料(暫時關掉 append-only trigger)
    -- ------------------------------------------------------------------------

    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs DISABLE TRIGGER trg_prevent_evaluation_logs_update;

    DELETE FROM evaluation_logs
    WHERE evaluation_id IN (
        SELECT e.id FROM evaluations e
        JOIN evaluation_periods p ON e.period_id = p.id
        WHERE p.org_id = v_org_id AND p.year = 2026 AND p.month BETWEEN 1 AND 3
    );

    DELETE FROM evaluations
    WHERE period_id IN (
        SELECT id FROM evaluation_periods
        WHERE org_id = v_org_id AND year = 2026 AND month BETWEEN 1 AND 3
    );

    DELETE FROM evaluation_periods
    WHERE org_id = v_org_id AND year = 2026 AND month BETWEEN 1 AND 3;

    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_delete;
    ALTER TABLE evaluation_logs ENABLE TRIGGER trg_prevent_evaluation_logs_update;


    -- ------------------------------------------------------------------------
    -- 2) 建立 1/2/3 月評核期(都已截止)
    -- ------------------------------------------------------------------------

    INSERT INTO evaluation_periods
        (org_id, year, month, status, activated_by, activated_at, deadline_at)
    SELECT
        v_org_id, 2026, m, '已截止', 'NULLA0011',
        make_timestamptz(2026, m, 20, 9, 0, 0),
        (date_trunc('month', make_date(2026, m, 1)) + interval '1 month - 1 second')::timestamptz
    FROM generate_series(1, 3) AS m;


    -- ------------------------------------------------------------------------
    -- 3) 建立 14 × 3 = 42 張評核 + 對應 logs
    -- ------------------------------------------------------------------------

    WITH score_template(evaluatee_id, evaluator_role, evaluator_id, eff, qua, coo, att) AS (
        VALUES
            -- 自評 6
            ('NULLA0011', '自評',   'NULLA0011', 27, 23, 22, 18),  -- 90 (Becca 略謙虛)
            ('NULLA0008', '自評',   'NULLA0008', 25, 22, 22, 18),  -- 87
            ('NULLA0012', '自評',   'NULLA0012', 20, 18, 21, 17),  -- 76 (低估自己)
            ('NULLA0003', '自評',   'NULLA0003', 28, 24, 23, 19),  -- 94 (略高估)
            ('NULLA0013', '自評',   'NULLA0013', 23, 21, 21, 18),  -- 83 (略高估)
            ('NULLA0016', '自評',   'NULLA0016', 22, 20, 20, 17),  -- 79 (高估)
            -- 主管 2(Becca 評下屬)
            ('NULLA0008', '主管',   'NULLA0011', 26, 22, 22, 19),  -- 89
            ('NULLA0012', '主管',   'NULLA0011', 23, 21, 22, 18),  -- 84
            -- 執行長 6(老闆評全部)
            ('NULLA0011', '執行長', 'NULLA0001', 28, 23, 23, 19),  -- 93
            ('NULLA0008', '執行長', 'NULLA0001', 25, 22, 21, 18),  -- 86
            ('NULLA0012', '執行長', 'NULLA0001', 23, 20, 22, 17),  -- 82
            ('NULLA0003', '執行長', 'NULLA0001', 27, 23, 22, 19),  -- 91
            ('NULLA0013', '執行長', 'NULLA0001', 21, 19, 19, 17),  -- 76
            ('NULLA0016', '執行長', 'NULLA0001', 19, 17, 17, 15)   -- 68
    ),
    month_jitter(month, delta) AS (
        VALUES (1, 0), (2, -1), (3, 1)
    ),
    inserted_evals AS (
        INSERT INTO evaluations (
            period_id, evaluatee_id, evaluator_role, evaluator_id,
            score_efficiency, score_quality, score_cooperation, score_attendance,
            status, filled_at, last_modified_at
        )
        SELECT
            p.id,
            st.evaluatee_id,
            st.evaluator_role::evaluator_role_type,
            st.evaluator_id,
            LEAST(GREATEST(st.eff + mj.delta, 0), 30),
            LEAST(GREATEST(st.qua + mj.delta, 0), 25),
            LEAST(GREATEST(st.coo + mj.delta, 0), 25),
            LEAST(GREATEST(st.att + mj.delta, 0), 20),
            '已填',
            make_timestamptz(2026, p.month, 25, 14, 0, 0),
            make_timestamptz(2026, p.month, 25, 14, 0, 0)
        FROM score_template st
        CROSS JOIN evaluation_periods p
        JOIN month_jitter mj ON mj.month = p.month
        WHERE p.org_id = v_org_id AND p.year = 2026 AND p.month BETWEEN 1 AND 3
        RETURNING id, evaluator_id,
                  score_efficiency, score_quality, score_cooperation, score_attendance,
                  filled_at
    )
    INSERT INTO evaluation_logs (
        evaluation_id, action_type, actor_id,
        score_efficiency_after, score_quality_after,
        score_cooperation_after, score_attendance_after,
        status_before, status_after, created_at
    )
    SELECT
        ie.id, 'FILL', ie.evaluator_id,
        ie.score_efficiency, ie.score_quality, ie.score_cooperation, ie.score_attendance,
        '待填', '已填', ie.filled_at
    FROM inserted_evals ie;
END $$;


-- ============================================================================
-- 檢查
-- ============================================================================
-- 預期:每月各 14 張(自評 6 + 主管 2 + 執行長 6),總共 42 張,全 已填
-- ============================================================================

SELECT
    p.year, p.month,
    e.evaluator_role,
    COUNT(*) AS row_count
FROM evaluations e
JOIN evaluation_periods p ON e.period_id = p.id
WHERE p.org_id = (SELECT id FROM organizations WHERE code = 'NULLA')
  AND p.year = 2026 AND p.month BETWEEN 1 AND 3
GROUP BY p.year, p.month, e.evaluator_role
ORDER BY p.month, e.evaluator_role;
