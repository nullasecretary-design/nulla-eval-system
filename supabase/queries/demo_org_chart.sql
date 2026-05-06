-- ============================================================================
-- Demo 查詢:列出每位員工的主管(組織圖)
-- ============================================================================
-- 這個查詢「結合」(JOIN)兩張表 — employees 跟自己 — 把每個員工的
-- manager_id 對應回去,找出對應的主管姓名。
-- 這是資料庫的核心魔法:用「關聯」建立資訊網。
-- ============================================================================

SELECT
    e.employee_number      AS 員工編號,
    e.name                 AS 姓名,
    e.department           AS 部門,
    e.job_title            AS 職務,
    e.position             AS 職位,
    e.admin_role           AS 管理者身分,
    m.name                 AS 主管姓名
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.employee_number
ORDER BY
    CASE e.position
        WHEN '執行長' THEN 1
        WHEN '主管'   THEN 2
        ELSE 3
    END,
    e.employee_number;
