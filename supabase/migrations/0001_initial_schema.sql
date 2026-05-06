-- ============================================================================
-- 績效評核系統 — Initial Schema
-- ============================================================================
-- Version: v0.1
-- Created: 2026-05-05
-- Designer: Becca (product) + Claude (implementation)
-- Reference: docs/schema_v0.1.md, docs/spec_v0.2.md
--
-- This migration creates 8 tables in dependency order:
--   Master data:    organizations, employees, evaluation_periods, evaluations
--   Audit log:      evaluation_logs (append-only)
--   History:        transfer_history, line_binding_history, deletion_log
--
-- IMPORTANT: This migration does NOT include RLS (Row Level Security) policies.
-- RLS will be added in 0002_rls_policies.sql in the next session.
-- ============================================================================


-- ============================================================================
-- ENUM types
-- ============================================================================

CREATE TYPE position_type        AS ENUM ('一般員工', '主管', '執行長');
CREATE TYPE admin_role_type      AS ENUM ('無', '秘書', '會計', '超級管理員');
CREATE TYPE employee_status      AS ENUM ('在職', '已停用');
CREATE TYPE period_status        AS ENUM ('待啟動', '進行中', '已截止');
CREATE TYPE evaluator_role_type  AS ENUM ('自評', '主管', '執行長');
CREATE TYPE evaluation_status    AS ENUM ('待填', '已填', '已解鎖', '逾期未填', '作廢');
CREATE TYPE void_type_enum       AS ENUM ('離職', '組織異動', '輸入錯誤', '其他');
CREATE TYPE log_action_type      AS ENUM ('FILL', 'UNLOCK', 'REFILL', 'VOID', 'UNVOID', 'WEIGHT_OVERRIDE');
CREATE TYPE transfer_type_enum   AS ENUM ('到職', '組織異動', '離職');
CREATE TYPE binding_action_type  AS ENUM ('首次綁定', '解綁', '重新綁定');


-- ============================================================================
-- Helper functions
-- ============================================================================

-- Auto-update updated_at column on UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Block UPDATE / DELETE for append-only tables
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'This table is append-only — UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Table 1: organizations
-- ============================================================================

CREATE TABLE organizations (
    id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     text         NOT NULL UNIQUE,
    name                     text         NOT NULL,
    countdown_warning_hours  smallint     NOT NULL DEFAULT 8
                                          CHECK (countdown_warning_hours BETWEEN 4 AND 24),
    default_manager_weight   smallint     NOT NULL DEFAULT 70
                                          CHECK (default_manager_weight BETWEEN 0 AND 100),
    is_active                boolean      NOT NULL DEFAULT true,
    created_at               timestamptz  NOT NULL DEFAULT now(),
    updated_at               timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE  organizations IS '三家公司的基本資料與系統設定';
COMMENT ON COLUMN organizations.code IS '組織代碼,例:NULLA;用於員工編號前綴';
COMMENT ON COLUMN organizations.countdown_warning_hours IS '截止前幾小時跳紅警示;範圍 4-24;只有超管能改';
COMMENT ON COLUMN organizations.default_manager_weight IS '主管評核預設權重(%);CEO 權重 = 100 - 此值';


-- ============================================================================
-- Table 2: employees
-- ============================================================================

CREATE TABLE employees (
    employee_number  text              PRIMARY KEY,
    name             text              NOT NULL,
    org_id           uuid              NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    department       text              NOT NULL,
    job_title        text              NOT NULL,
    position         position_type     NOT NULL DEFAULT '一般員工',
    admin_role       admin_role_type   NOT NULL DEFAULT '無',
    manager_id       text              REFERENCES employees(employee_number) ON DELETE SET NULL,
    company_email    text,
    line_user_id     text              UNIQUE,
    status           employee_status   NOT NULL DEFAULT '在職',
    hired_at         date              NOT NULL,
    left_at          date,
    created_at       timestamptz       NOT NULL DEFAULT now(),
    updated_at       timestamptz       NOT NULL DEFAULT now(),
    CONSTRAINT employees_status_left_at_consistency CHECK (
        (status = '在職'   AND left_at IS NULL)
        OR (status = '已停用' AND left_at IS NOT NULL)
    )
);

CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_employees_org_id     ON employees(org_id);
CREATE INDEX idx_employees_manager_id ON employees(manager_id);
CREATE INDEX idx_employees_status     ON employees(status);

COMMENT ON TABLE  employees IS '員工資料 — 系統的人中心';
COMMENT ON COLUMN employees.employee_number IS '員工編號,例:NULLA0011;主鍵';
COMMENT ON COLUMN employees.position IS '職位(評分視角);跟 admin_role 是兩個獨立屬性';
COMMENT ON COLUMN employees.admin_role IS '管理者身分(管理視角);跟 position 是兩個獨立屬性';
COMMENT ON COLUMN employees.manager_id IS '主管的員工編號;NULL = 直屬執行長者';
COMMENT ON COLUMN employees.status IS 'spec §7.4:不刪除,改為已停用狀態(歷史評核資料保留)';


-- ============================================================================
-- Table 3: evaluation_periods
-- ============================================================================

CREATE TABLE evaluation_periods (
    id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    year          smallint       NOT NULL,
    month         smallint       NOT NULL CHECK (month BETWEEN 1 AND 12),
    status        period_status  NOT NULL DEFAULT '待啟動',
    activated_by  text           REFERENCES employees(employee_number) ON DELETE SET NULL,
    activated_at  timestamptz,
    deadline_at   timestamptz,
    created_at    timestamptz    NOT NULL DEFAULT now(),
    updated_at    timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT evaluation_periods_unique_per_org_month UNIQUE (org_id, year, month),
    CONSTRAINT evaluation_periods_status_consistency CHECK (
        (status = '待啟動'
            AND activated_by IS NULL
            AND activated_at IS NULL
            AND deadline_at  IS NULL)
        OR (status IN ('進行中', '已截止')
            AND activated_by IS NOT NULL
            AND activated_at IS NOT NULL
            AND deadline_at  IS NOT NULL)
    )
);

CREATE TRIGGER trg_evaluation_periods_updated_at
    BEFORE UPDATE ON evaluation_periods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_evaluation_periods_org_id ON evaluation_periods(org_id);
CREATE INDEX idx_evaluation_periods_status ON evaluation_periods(status);

COMMENT ON TABLE  evaluation_periods IS '每個月的評核活動容器(每家公司獨立)';
COMMENT ON COLUMN evaluation_periods.status IS '月初系統建檔=待啟動;day20+ 秘書手動啟動=進行中;deadline 過=已截止';


-- ============================================================================
-- Table 4: evaluations (system core)
-- ============================================================================

CREATE TABLE evaluations (
    id                  uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id           uuid                 NOT NULL REFERENCES evaluation_periods(id) ON DELETE RESTRICT,
    evaluatee_id        text                 NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    evaluator_role      evaluator_role_type  NOT NULL,
    evaluator_id        text                 NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    score_efficiency    smallint             CHECK (score_efficiency  BETWEEN 0 AND 30),
    score_quality       smallint             CHECK (score_quality     BETWEEN 0 AND 25),
    score_cooperation   smallint             CHECK (score_cooperation BETWEEN 0 AND 25),
    score_attendance    smallint             CHECK (score_attendance  BETWEEN 0 AND 20),
    comment             text,
    status              evaluation_status    NOT NULL DEFAULT '待填',
    weight_override     smallint             CHECK (weight_override BETWEEN 0 AND 100),
    filled_at           timestamptz,
    last_modified_at    timestamptz,
    unlocked_at         timestamptz,
    unlocked_by         text                 REFERENCES employees(employee_number) ON DELETE SET NULL,
    voided_at           timestamptz,
    voided_by           text                 REFERENCES employees(employee_number) ON DELETE SET NULL,
    void_type           void_type_enum,
    void_reason         text,
    created_at          timestamptz          NOT NULL DEFAULT now(),
    updated_at          timestamptz          NOT NULL DEFAULT now(),
    CONSTRAINT evaluations_unique_per_evaluatee_role UNIQUE (period_id, evaluatee_id, evaluator_role)
);

CREATE TRIGGER trg_evaluations_updated_at
    BEFORE UPDATE ON evaluations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_evaluations_period_id    ON evaluations(period_id);
CREATE INDEX idx_evaluations_evaluatee_id ON evaluations(evaluatee_id);
CREATE INDEX idx_evaluations_evaluator_id ON evaluations(evaluator_id);
CREATE INDEX idx_evaluations_status       ON evaluations(status);

COMMENT ON TABLE  evaluations IS '評核紀錄 — 長表設計,每個評核動作一筆 row';
COMMENT ON COLUMN evaluations.weight_override IS 'NULL=用組織預設規則;有值=覆蓋預設(會計手動調整)';
COMMENT ON COLUMN evaluations.evaluator_id IS '評核者 snapshot;主管換人偵測時跟 employees.manager_id 比對';


-- ============================================================================
-- Table 5: evaluation_logs (APPEND-ONLY)
-- ============================================================================

CREATE TABLE evaluation_logs (
    id                       uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id            uuid             NOT NULL REFERENCES evaluations(id) ON DELETE RESTRICT,
    action_type              log_action_type  NOT NULL,
    actor_id                 text             NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    reason                   text,
    score_efficiency_before  smallint,
    score_quality_before     smallint,
    score_cooperation_before smallint,
    score_attendance_before  smallint,
    score_efficiency_after   smallint,
    score_quality_after      smallint,
    score_cooperation_after  smallint,
    score_attendance_after   smallint,
    weight_before            smallint,
    weight_after             smallint,
    status_before            text,
    status_after             text,
    created_at               timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluation_logs_evaluation_id ON evaluation_logs(evaluation_id);
CREATE INDEX idx_evaluation_logs_actor_id      ON evaluation_logs(actor_id);
CREATE INDEX idx_evaluation_logs_action_type   ON evaluation_logs(action_type);
CREATE INDEX idx_evaluation_logs_created_at    ON evaluation_logs(created_at);

-- Append-only enforcement (cannot UPDATE or DELETE)
CREATE TRIGGER trg_prevent_evaluation_logs_update
    BEFORE UPDATE ON evaluation_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER trg_prevent_evaluation_logs_delete
    BEFORE DELETE ON evaluation_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE evaluation_logs IS '評核稽核 log;append-only,連超管也不能改';


-- ============================================================================
-- Table 6: transfer_history
-- ============================================================================

CREATE TABLE transfer_history (
    id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     text                NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    from_org_id     uuid                REFERENCES organizations(id) ON DELETE RESTRICT,
    to_org_id       uuid                REFERENCES organizations(id) ON DELETE RESTRICT,
    transfer_type   transfer_type_enum  NOT NULL,
    transferred_at  date                NOT NULL,
    executed_by     text                NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    reason          text,
    created_at      timestamptz         NOT NULL DEFAULT now(),
    CONSTRAINT transfer_history_org_consistency CHECK (
        (transfer_type = '到職'
            AND from_org_id IS NULL
            AND to_org_id   IS NOT NULL)
        OR (transfer_type = '離職'
            AND from_org_id IS NOT NULL
            AND to_org_id   IS NULL)
        OR (transfer_type = '組織異動'
            AND from_org_id IS NOT NULL
            AND to_org_id   IS NOT NULL
            AND from_org_id <> to_org_id)
    )
);

CREATE INDEX idx_transfer_history_employee_id     ON transfer_history(employee_id);
CREATE INDEX idx_transfer_history_transferred_at  ON transfer_history(transferred_at);

COMMENT ON TABLE transfer_history IS '員工到職/組織異動/離職 完整歷史';


-- ============================================================================
-- Table 7: line_binding_history
-- ============================================================================

CREATE TABLE line_binding_history (
    id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     text                  NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    line_user_id    text                  NOT NULL,
    binding_action  binding_action_type   NOT NULL,
    executed_by     text                  NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    approved_by     text                  REFERENCES employees(employee_number) ON DELETE RESTRICT,
    reason          text,
    created_at      timestamptz           NOT NULL DEFAULT now(),
    CONSTRAINT line_binding_rebind_requires_approval CHECK (
        binding_action <> '重新綁定'
        OR approved_by IS NOT NULL
    )
);

CREATE INDEX idx_line_binding_history_employee_id   ON line_binding_history(employee_id);
CREATE INDEX idx_line_binding_history_line_user_id  ON line_binding_history(line_user_id);

COMMENT ON TABLE line_binding_history IS 'spec §4.4 換手機/LINE 被盜重綁機制的證據基礎';


-- ============================================================================
-- Table 8: deletion_log
-- ============================================================================

CREATE TABLE deletion_log (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number      text         NOT NULL,  -- NOT a FK (employees row hard-deleted)
    name_snapshot        text         NOT NULL,
    org_id_at_deletion   uuid         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    deleted_by           text         NOT NULL REFERENCES employees(employee_number) ON DELETE RESTRICT,
    reason               text,
    deleted_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_deletion_log_employee_number   ON deletion_log(employee_number);
CREATE INDEX idx_deletion_log_org_id            ON deletion_log(org_id_at_deletion);

COMMENT ON TABLE deletion_log IS '誤建員工真刪後的痕跡 (employee_number 不是 FK)';


-- ============================================================================
-- End of migration
-- ============================================================================
