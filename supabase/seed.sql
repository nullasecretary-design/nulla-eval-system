-- ============================================================================
-- 種子資料:Nulla, Inc + 8 位員工
-- ============================================================================
-- 日期: 2026-05-05
-- 說明:
--   - 姓名為 placeholder(實際姓名上線前再改)
--   - 到職日期為估計值,可在 Table Editor 修正
--   - Becca 在 dev 階段 position=主管(便於測試主管評核流程);
--     上線前需改回 position=一般員工
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. 組織:Nulla, Inc
-- ----------------------------------------------------------------------------

INSERT INTO organizations (code, name)
VALUES ('NULLA', 'Nulla, Inc');


-- ----------------------------------------------------------------------------
-- 2. 員工(必須先插 CEO,因為其他人的 manager_id 會指向他)
-- ----------------------------------------------------------------------------

-- 老闆(CEO)
INSERT INTO employees (
    employee_number, name, org_id, department, job_title,
    position, admin_role, manager_id, hired_at, status
) VALUES (
    'NULLA0001', '老闆(待補實名)',
    (SELECT id FROM organizations WHERE code = 'NULLA'),
    '管理層', '執行長',
    '執行長', '超級管理員', NULL,
    '2018-01-01', '在職'
);

-- Becca(dev 階段暫時為主管)
INSERT INTO employees (
    employee_number, name, org_id, department, job_title,
    position, admin_role, manager_id, hired_at, status
) VALUES (
    'NULLA0011', 'Becca',
    (SELECT id FROM organizations WHERE code = 'NULLA'),
    '行銷部', '行銷主管',
    '主管', '超級管理員', 'NULLA0001',
    '2022-03-01', '在職'
);

-- 其他 6 位員工
INSERT INTO employees (
    employee_number, name, org_id, department, job_title,
    position, admin_role, manager_id, hired_at, status
) VALUES
    -- Becca 直屬下屬(2 人)
    ('NULLA0003', '同事A(Becca 直屬,待補實名)',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '行銷部', '行銷專員', '一般員工', '無', 'NULLA0011',
        '2021-04-01', '在職'),

    ('NULLA0008', '同事B(Becca 直屬,待補實名)',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '行銷部', '行銷專員', '一般員工', '無', 'NULLA0011',
        '2023-01-15', '在職'),

    -- 小嫚:會計,行政上掛 NULLA 但 NULLA 評核不產生她的單子
    -- (她實際職務在老闆診所,日後會搬到 CLINIC1/CLINIC2 org 之下)
    ('NULLA0006', '小嫚',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '財務部', '會計', '一般員工', '會計', 'NULLA0001',
        '2020-06-01', '在職'),

    -- 直屬老闆的同事(3 人)
    ('NULLA0012', '同事C(老闆直屬,待補實名)',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '行銷部', '行銷專員', '一般員工', '無', 'NULLA0001',
        '2023-08-01', '在職'),

    ('NULLA0013', '同事D(老闆直屬,待補實名)',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '行銷部', '行銷專員', '一般員工', '無', 'NULLA0001',
        '2024-02-15', '在職'),

    ('NULLA0016', '同事E(老闆直屬,待補實名)',
        (SELECT id FROM organizations WHERE code = 'NULLA'),
        '行銷部', '行銷專員', '一般員工', '無', 'NULLA0001',
        '2025-05-01', '在職');


-- ----------------------------------------------------------------------------
-- 3. 為每位員工建立「到職」歷史紀錄
-- ----------------------------------------------------------------------------

INSERT INTO transfer_history (
    employee_id, from_org_id, to_org_id, transfer_type,
    transferred_at, executed_by, reason
)
SELECT
    employee_number,
    NULL,                              -- 到職時 from_org_id 為空
    org_id,
    '到職'::transfer_type_enum,
    hired_at,
    'NULLA0001',                       -- 由超管(CEO)代為記錄初始建檔
    '系統初始建檔'
FROM employees;


-- ----------------------------------------------------------------------------
-- 完成檢查:跑這段確認筆數正確
-- ----------------------------------------------------------------------------
-- 預期結果:1 organization, 8 employees, 8 transfer_history
-- ----------------------------------------------------------------------------

SELECT 'organizations' AS table_name, COUNT(*) AS row_count FROM organizations
UNION ALL
SELECT 'employees', COUNT(*) FROM employees
UNION ALL
SELECT 'transfer_history', COUNT(*) FROM transfer_history;
