# 績效評核系統 — 資料庫 Schema 設計 v0.1

> **版本日期**:2026-05-05
> **設計者**:Becca(產品設計) + Claude(實作建議)
> **對應規格書**:`spec_v0.2.md`
> **狀態**:第 1 階段(8 張表)設計完成,待 SQL DDL 落地

---

## 目錄

1. [設計哲學](#一設計哲學)
2. [資料表總覽](#二資料表總覽)
3. [Table 1 — `organizations`(組織)](#table-1--organizations組織)
4. [Table 2 — `employees`(員工)](#table-2--employees員工)
5. [Table 3 — `evaluation_periods`(評核期)](#table-3--evaluation_periods評核期)
6. [Table 4 — `evaluations`(評核紀錄)](#table-4--evaluations評核紀錄)
7. [Table 5 — `evaluation_logs`(評核稽核 log)](#table-5--evaluation_logs評核稽核-log)
8. [Table 6 — `transfer_history`(員工異動歷史)](#table-6--transfer_history員工異動歷史)
9. [Table 7 — `line_binding_history`(LINE 綁定歷史)](#table-7--line_binding_history線綁定歷史)
10. [Table 8 — `deletion_log`(誤建員工刪除紀錄)](#table-8--deletion_log誤建員工刪除紀錄)
11. [跨表關係速查](#三跨表關係速查)
12. [待補完事項](#四待補完事項)

---

## 一、設計哲學

整套 schema 設計圍繞四個核心原則:

| # | 原則 | 在 schema 上的具體展現 |
|---|---|---|
| 1 | **資料完整收集,顯示精準分流** | 評核 row 月初就預先建檔,沒填也留紀錄(不是「沒填 = 沒 row」) |
| 2 | **最小權限原則** | 每張表的 RLS(Row Level Security)按組織與角色嚴格隔離 |
| 3 | **Default + Override 兩層彈性** | 規則有預設值(系統自動套用),邊緣情境留人工覆蓋空間(會計/超管手動處理) |
| 4 | **留痕極大化,規則最小化** | log/history 表 append-only,不允許修改;但業務規則「鼓勵不強制」(信任使用者) |

---

## 二、資料表總覽

8 張表分成 3 個層次:

### 主資料(Master Data)— 4 張
| # | 表名 | 中文 | 用途 |
|---|---|---|---|
| 1 | `organizations` | 組織 | 三家公司的基本資料與設定 |
| 2 | `employees` | 員工 | 所有員工的個資、職位、管理者身分 |
| 3 | `evaluation_periods` | 評核期 | 每月的「評核活動容器」(誰啟動、何時截止、現狀) |
| 4 | `evaluations` | 評核紀錄 | 系統的心臟 — 每筆評核動作(自評/主管/執行長) |

### 稽核 Log — 1 張
| # | 表名 | 中文 | 用途 |
|---|---|---|---|
| 5 | `evaluation_logs` | 評核稽核 log | 對 `evaluations` 的所有動作留痕(append-only) |

### 歷史紀錄(History)— 3 張
| # | 表名 | 中文 | 用途 |
|---|---|---|---|
| 6 | `transfer_history` | 員工異動歷史 | 到職、組織異動、離職 |
| 7 | `line_binding_history` | LINE 綁定歷史 | 換手機/被盜重綁的判斷依據 |
| 8 | `deletion_log` | 誤建員工刪除紀錄 | 真刪後的最後一道痕跡 |

---

## Table 1 — `organizations`(組織)

> **它做什麼**:三家公司(Nulla, Inc / 診所 1 / 診所 2)的基本資料,加上每家公司**自己的系統設定**(可調截止前警示時數、預設加權比例等)。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `code` | text | ✅ | — | 組織代碼,唯一,例:`NULLA`、`CLINIC1`(用於員工編號前綴) |
| `name` | text | ✅ | — | 公司全名,例:`Nulla, Inc` |
| `countdown_warning_hours` | smallint | ✅ | 8 | 截止前幾小時跳紅色警示。範圍 4–24,只有超管能改 |
| `default_manager_weight` | smallint | ✅ | 70 | 主管評核預設權重(百分比);CEO 權重 = 100 - 此值 |
| `is_active` | boolean | ✅ | `true` | 組織是否啟用(關閉後該組織員工無法登入) |
| `created_at` | timestamptz | ✅ | `now()` | 建立時間 |
| `updated_at` | timestamptz | ✅ | `now()` | 最後修改時間(trigger 自動更新) |

### 關鍵約束

- `code` UNIQUE
- `countdown_warning_hours` CHECK: 介於 4 到 24 之間(含)
- `default_manager_weight` CHECK: 介於 0 到 100 之間(含)

### 設計重點

- `countdown_warning_hours` 跟 `default_manager_weight` 都是「**這家公司的預設值**」 — 反映 Becca 的 Default+Override 哲學(系統設預設,人類能改)
- CEO 權重不獨立存,直接從 `100 - default_manager_weight` 算,避免兩個欄位不同步

---

## Table 2 — `employees`(員工)

> **它做什麼**:所有員工的基本資料、職位、管理者身分、所屬公司、主管。系統的「人」中心。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `employee_number` | text | ✅ | — | **主鍵**,例:`NULLA0011`(全大寫 + 4 位數字) |
| `name` | text | ✅ | — | 姓名 |
| `org_id` | uuid (FK) | ✅ | — | 所屬組織 |
| `department` | text | ✅ | — | 部門,例:`企劃部`、`護理部` |
| `job_title` | text | ✅ | — | 具體職務,例:`護理師`、`會計` |
| `position` | enum | ✅ | `一般員工` | 三選一:`一般員工` / `主管` / `執行長` |
| `admin_role` | enum | ✅ | `無` | 四選一:`無` / `秘書` / `會計` / `超級管理員` |
| `manager_id` | text (FK) | ❌ | — | 主管的員工編號,可空(直屬執行長者為空) |
| `company_email` | text | ❌ | — | 公司 Email,可空 |
| `line_user_id` | text | ❌ | — | LINE 帳號 ID(綁定後自動填) |
| `status` | enum | ✅ | `在職` | 二選一:`在職` / `已停用`(spec §7.4 規定不刪除,改停用) |
| `hired_at` | date | ✅ | — | 到職日(後台 UI 用 date picker) |
| `left_at` | date | ❌ | — | 離職日,只在 status=已停用 時有值 |
| `created_at` | timestamptz | ✅ | `now()` | 建立時間 |
| `updated_at` | timestamptz | ✅ | `now()` | 最後修改時間 |

### 關鍵約束

- `employee_number` PK、UNIQUE
- `manager_id` 是 FK,指回 `employees.employee_number`(自我參照)
- `status='已停用'` 時 `left_at` 必須有值(CHECK)
- `position` 跟 `admin_role` 是兩個獨立屬性(spec §2.2 v0.2 重要更新)

### 設計重點

- **員工編號是主鍵** — 不用 uuid 是因為員工編號本身就是穩定的業務識別碼,綁定 LINE、做報表都用它
- **manager_id 自我參照** — 同一張表,A 員工的 `manager_id` 指向 B 員工的 `employee_number`
- **執行長的 manager_id 是 NULL** — 沒人是 CEO 的主管
- **直屬執行長者(spec §3.3 100% CEO 評)** = `manager_id = '<CEO 的員工編號>'`,沒有獨立欄位標記
- **`職位` 跟 `管理者身分` 故意分開**:Becca 既是「主管」職位也是「超管」管理者身分;小嫚是「一般員工」職位但「會計+超管」管理者身分(雖然 admin_role 只能單選,會計身分掛在 job_title)

---

## Table 3 — `evaluation_periods`(評核期)

> **它做什麼**:每個月的評核活動「容器」。誰啟動的、何時啟動、何時截止、目前狀態。每筆評核紀錄(Table 4)都掛在某個評核期下面。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `org_id` | uuid (FK) | ✅ | — | 所屬組織(每家公司獨立的評核期) |
| `year` | smallint | ✅ | — | 西元年,例:`2026` |
| `month` | smallint | ✅ | — | 月份,1–12 |
| `status` | enum | ✅ | `待啟動` | 三選一:`待啟動` / `進行中` / `已截止` |
| `activated_by` | text (FK) | ❌ | — | 啟動的秘書員工編號(`待啟動` 時為空) |
| `activated_at` | timestamptz | ❌ | — | 啟動時間 |
| `deadline_at` | timestamptz | ❌ | — | 截止時間(秘書啟動時手動指定;`待啟動` 時為空) |
| `created_at` | timestamptz | ✅ | `now()` | 系統建立時間(月初自動建檔) |
| `updated_at` | timestamptz | ✅ | `now()` | 最後修改時間 |

### 關鍵約束

- UNIQUE: `(org_id, year, month)` — 每家公司每個月只有一筆
- `month` CHECK: 1–12
- `status='進行中'` 或 `'已截止'` 時,`deadline_at` 必須有值(CHECK)
- `status='進行中'` 或 `'已截止'` 時,`activated_by` 跟 `activated_at` 必須有值

### 設計重點

- **月初系統自動建檔**(memory Q8/Q9):day 1 自動產生 `status=待啟動` 的 row
- **秘書手動啟動**(spec 規定): day 20 後才能啟動,啟動時必填 `deadline_at`
- **每家公司獨立評核期**:Nulla 的 5 月跟診所 1 的 5 月是兩筆不同的 row

---

## Table 4 — `evaluations`(評核紀錄)— 系統的心臟

> **它做什麼**:每個評核動作就是一筆 row(自評 / 主管評 / 執行長評)。一個員工一個月通常有 3 筆(直屬執行長者只有 2 筆)。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `period_id` | uuid (FK) | ✅ | — | 對應的評核期 |
| `evaluatee_id` | text (FK) | ✅ | — | 被評核的員工編號 |
| `evaluator_role` | enum | ✅ | — | 三選一:`自評` / `主管` / `執行長` |
| `evaluator_id` | text (FK) | ✅ | — | 評核人員工編號(月初建檔時 snapshot,主管換人偵測用) |
| `score_efficiency` | smallint | ❌ | — | 工作時效(0–30,未填為 NULL) |
| `score_quality` | smallint | ❌ | — | 工作品質(0–25,未填為 NULL) |
| `score_cooperation` | smallint | ❌ | — | 工作配合度(0–25,未填為 NULL) |
| `score_attendance` | smallint | ❌ | — | 出勤狀況(0–20,未填為 NULL) |
| `comment` | text | ❌ | — | 質性評語,可空(Becca 的「保留位置給想填的人」) |
| `status` | enum | ✅ | `待填` | 五選一:`待填` / `已填` / `已解鎖` / `逾期未填` / `作廢` |
| `weight_override` | smallint | ❌ | — | 手動覆蓋權重(NULL = 用組織預設規則),0–100 |
| `filled_at` | timestamptz | ❌ | — | 第一次填寫送出時間 |
| `last_modified_at` | timestamptz | ❌ | — | 最後修改時間(解鎖重填時更新) |
| `unlocked_at` | timestamptz | ❌ | — | 最近一次解鎖時間 |
| `unlocked_by` | text (FK) | ❌ | — | 最近解鎖者員工編號 |
| `voided_at` | timestamptz | ❌ | — | 作廢時間 |
| `voided_by` | text (FK) | ❌ | — | 作廢執行者 |
| `void_type` | enum | ❌ | — | 四選一(作廢時填):`離職` / `組織異動` / `輸入錯誤` / `其他` |
| `void_reason` | text | ❌ | — | 作廢原因(鼓勵不強制) |
| `created_at` | timestamptz | ✅ | `now()` | 系統建檔時間 |
| `updated_at` | timestamptz | ✅ | `now()` | 最後修改時間 |

### 關鍵約束

- UNIQUE: `(period_id, evaluatee_id, evaluator_role)` — 一個員工一個月每個角色只有一筆
- 4 個分數 CHECK:
  - `score_efficiency` BETWEEN 0 AND 30
  - `score_quality` BETWEEN 0 AND 25
  - `score_cooperation` BETWEEN 0 AND 25
  - `score_attendance` BETWEEN 0 AND 20
- `weight_override` CHECK: 介於 0 到 100 之間
- `status='已填'` 時 4 個分數必須有值;`status='待填'` 或 `'逾期未填'` 時必須是 NULL

### 設計重點(這張表的所有重大決策)

| 決策 | 內容 | 出處 |
|---|---|---|
| 長表 / 寬表 | **長表**(每個動作一筆 row) | Becca 2026-05-04 |
| 4 項分數 | 30/25/25/20 = 100,固定欄位 | Becca 2026-05-04 |
| 月初預先建檔 | 評核期啟動時自動產所有 row(空白) | Becca 2026-05-04 |
| 評核順序 | **不強制**,UI 用被動橫條提示 | Becca 2026-05-04 |
| 解鎖機制 | 可解、無時限、留痕、不限次,原因鼓勵不強制 | Becca 2026-05-05 |
| 作廢觸發 | 離職自動作廢,組織異動由秘書手動處理 | Becca 2026-05-05 |
| 加權架構 | **Default + Override**:組織預設 + 個別 row 可覆蓋 | Becca 2026-05-05 |

### 加權計算規則(白話)

當報表計算員工 X 某月的總分時:

1. 抓出該員工該月的所有 `已填` 狀態的 row(`作廢` / `逾期未填` 的 row 不算)
2. 對每筆 row:
   - 若 `weight_override` 有值 → 用這個值
   - 否則 → 看 `evaluator_role` + 該員工 `org_id` 的預設值:
     - `自評` → 0%(自評不計入計算,但是必填)
     - `主管` → `organizations.default_manager_weight`(預設 70%)
     - `執行長` → `100 - default_manager_weight`(預設 30%)
3. 計算 `(score_total × weight) / 100` 加總

**邊緣情境**:
- 主管 row 是 `作廢`(主管換人偵測) → 系統自動把該員工 CEO row 的「實際使用權重」設為 100%(可被會計手動覆蓋)
- 會計可在「特殊調整」頁(報表頁面內)手動改任何 row 的 `weight_override`

---

## Table 5 — `evaluation_logs`(評核稽核 log)

> **它做什麼**:對 `evaluations` 表的所有重要動作留痕。**append-only**,不允許 UPDATE 或 DELETE,連超管也不行。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `evaluation_id` | uuid (FK) | ✅ | — | 對應的評核紀錄 |
| `action_type` | enum | ✅ | — | 六選一:`FILL` / `UNLOCK` / `REFILL` / `VOID` / `UNVOID` / `WEIGHT_OVERRIDE` |
| `actor_id` | text (FK) | ✅ | — | 執行動作的員工編號 |
| `reason` | text | ❌ | — | 原因(各動作規則不同 — 解鎖/作廢「鼓勵不強制」,加權調整「強制」) |
| `score_efficiency_before` | smallint | ❌ | — | 動作前快照 |
| `score_quality_before` | smallint | ❌ | — | 動作前快照 |
| `score_cooperation_before` | smallint | ❌ | — | 動作前快照 |
| `score_attendance_before` | smallint | ❌ | — | 動作前快照 |
| `score_efficiency_after` | smallint | ❌ | — | 動作後快照 |
| `score_quality_after` | smallint | ❌ | — | 動作後快照 |
| `score_cooperation_after` | smallint | ❌ | — | 動作後快照 |
| `score_attendance_after` | smallint | ❌ | — | 動作後快照 |
| `weight_before` | smallint | ❌ | — | 動作前權重 |
| `weight_after` | smallint | ❌ | — | 動作後權重 |
| `status_before` | text | ❌ | — | 動作前狀態(用 text 而非 enum,讓未來新增狀態時 log 不破) |
| `status_after` | text | ❌ | — | 動作後狀態 |
| `created_at` | timestamptz | ✅ | `now()` | 動作發生時間 |

### 關鍵約束

- **No UPDATE permission**(資料庫層面拒絕)
- **No DELETE permission**(同上)
- 自動排程作業:員工 `已停用` 滿 5 年後,清除該員工所有相關 log

### 設計重點

- **訴訟卷宗模式**:每個動作 = 一筆紀錄,寫了不能改。寫錯只能補一筆「更正紀錄」
- **before/after 雙快照**:即使原 row 被反覆修改,任何時點的狀態都能從 log 重建

---

## Table 6 — `transfer_history`(員工異動歷史)

> **它做什麼**:記錄員工的到職、組織異動、離職事件。一個員工從進入到離開公司的完整移動史都在這。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `employee_id` | text (FK) | ✅ | — | 哪個員工 |
| `from_org_id` | uuid (FK) | ❌ | — | 原公司,可空(`到職` 時為空) |
| `to_org_id` | uuid (FK) | ❌ | — | 新公司,可空(`離職` 時為空) |
| `transfer_type` | enum | ✅ | — | 三選一:`到職` / `組織異動` / `離職` |
| `transferred_at` | date | ✅ | — | 變動實際生效日(秘書填) |
| `executed_by` | text (FK) | ✅ | — | 執行者(秘書/超管的員工編號) |
| `reason` | text | ❌ | — | 原因(可空) |
| `created_at` | timestamptz | ✅ | `now()` | 系統紀錄時間 |

### 關鍵約束

- `transfer_type='到職'` → `from_org_id` 必須為空,`to_org_id` 必須有值
- `transfer_type='離職'` → `to_org_id` 必須為空,`from_org_id` 必須有值
- `transfer_type='組織異動'` → 兩者都必須有值,且不能相等

### 設計重點

- 復職就是再多一筆 `到職` 紀錄,同一 `employee_id` 可有多筆(時序排列)
- Table 4 的「主管換人偵測」會查這張表確認某員工某月是否有異動

---

## Table 7 — `line_binding_history`(LINE 綁定歷史)

> **它做什麼**:記錄員工編號 ↔ LINE 帳號的所有綁定/解綁/重綁事件。spec §4.4 換手機/LINE 被盜重綁機制的證據基礎。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `employee_id` | text (FK) | ✅ | — | 哪個員工 |
| `line_user_id` | text | ✅ | — | 該次動作涉及的 LINE 帳號 |
| `binding_action` | enum | ✅ | — | 三選一:`首次綁定` / `解綁` / `重新綁定` |
| `executed_by` | text (FK) | ✅ | — | 執行者(可能是員工本人/秘書/超管) |
| `approved_by` | text (FK) | ❌ | — | 核准者(只有 `重新綁定` 需要,秘書或超管) |
| `reason` | text | ❌ | — | 原因(重綁時鼓勵填,例:「換手機」/「LINE 被盜」) |
| `created_at` | timestamptz | ✅ | `now()` | 系統紀錄時間 |

### 關鍵約束

- `binding_action='重新綁定'` → `approved_by` 必須有值

### 設計重點

- **首次綁定不需要核准**(員工自己掃 QR 完成),`approved_by` 留空
- **重綁需要秘書或超管核准**(spec §4.4 防止 LINE 被盜後接管帳號)

---

## Table 8 — `deletion_log`(誤建員工刪除紀錄)

> **它做什麼**:`employees` 表是真刪(hard delete),為了保留「曾經存在過」的痕跡,刪除事件落在這張表。

### 欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|
| `id` | uuid | ✅ | 自動 | 主鍵 |
| `employee_number` | text | ✅ | — | 被刪除的員工編號(**不是 FK**,因為 employees row 已不存在) |
| `name_snapshot` | text | ✅ | — | 刪除當下的姓名 |
| `org_id_at_deletion` | uuid (FK) | ✅ | — | 刪除時所屬公司 |
| `deleted_by` | text (FK) | ✅ | — | 執行刪除者(秘書/超管的員工編號) |
| `reason` | text | ❌ | — | 原因(鼓勵不強制) |
| `deleted_at` | timestamptz | ✅ | `now()` | 刪除時間 |

### 關鍵約束

- `employee_number` 在這張表**沒有** UNIQUE 約束 — 萬一同一個員工編號被「建立 → 誤建刪除 → 重新建立 → 又誤刪」,可以有多筆

### 設計重點

- **欄位刻意精簡**:只記識別資訊。如果以後需要更完整快照,可加欄位(不會破壞既有資料)
- **deletion_log 永久保留**(不像 evaluation_logs 有 5 年清理規則)— 因為這張表的 row 量極少

---

## 三、跨表關係速查

```
                    ┌─────────────────┐
                    │  organizations  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
       ┌───────────┐  ┌──────────────────┐  │
       │ employees │  │evaluation_periods│  │
       └─────┬─────┘  └────────┬─────────┘  │
             │                 │            │
             ├─────────────────┤            │
             ↓                 ↓            │
       ┌──────────────────────────┐         │
       │      evaluations         │         │
       └────────────┬─────────────┘         │
                    │                       │
                    ↓                       │
       ┌──────────────────────────┐         │
       │    evaluation_logs       │         │
       └──────────────────────────┘         │
                                            │
       ┌─────────────────────┐              │
       │  transfer_history   │──────────────┤
       └─────────────────────┘              │
                                            │
       ┌─────────────────────┐              │
       │ line_binding_history│              │
       └─────────────────────┘              │
                                            │
       ┌─────────────────────┐              │
       │   deletion_log      │──────────────┘
       └─────────────────────┘
```

### 主要 FK 關係

| 從 | 到 | 意義 |
|---|---|---|
| `employees.org_id` | `organizations.id` | 員工屬於哪家公司 |
| `employees.manager_id` | `employees.employee_number` | 員工的主管(自我參照) |
| `evaluation_periods.org_id` | `organizations.id` | 評核期屬於哪家公司 |
| `evaluations.period_id` | `evaluation_periods.id` | 評核紀錄屬於哪個評核期 |
| `evaluations.evaluatee_id` | `employees.employee_number` | 被評核者 |
| `evaluations.evaluator_id` | `employees.employee_number` | 評核者 |
| `evaluation_logs.evaluation_id` | `evaluations.id` | log 屬於哪筆評核紀錄 |
| `transfer_history.employee_id` | `employees.employee_number` | 異動的員工 |
| `line_binding_history.employee_id` | `employees.employee_number` | 綁定的員工 |
| `deletion_log.org_id_at_deletion` | `organizations.id` | 被刪員工原所屬公司 |

---

## 四、待補完事項

### 階段 2 後期(寫 SQL 跟 RLS 政策時補)

- [ ] 各表的 RLS(Row Level Security)規則 — 多租戶隔離與最小權限
- [ ] Index 設計(查詢效能優化)
- [ ] Trigger 設計(`updated_at` 自動更新、月初自動建評核期、**重要**:append-only 強制)

### 階段 3 / Phase 3 可能新增的表(目前 v1 不做)

- [ ] `report_archives` — spec §8.5 報表歷史保存
- [ ] `notification_log` — email/LINE 推播紀錄
- [ ] `system_settings` — 跨組織系統參數(如果有需要的話)

> 上面三張湊滿規格書 §11 提的「11 張表」總數,但本次 v1 不做,等真的有需求再加。

### 仍待設計的開放問題(spec §13)

- [ ] 切換單位介面(超管在三家之間切換時 UI 怎麼長)
- [ ] 補評處理(目前規則:已截止後不可補,但 UX 細節未定)
- [ ] 三家組織完整架構圖

---

## 附錄:重大設計決策時間軸

| 日期 | 決策 | 影響 |
|---|---|---|
| 2026-04-30 | 跳紅警示時數從寫死改為可調(初版定 8 小時寫死) | Table 1 加 `countdown_warning_hours` |
| 2026-05-04 (上午) | 跳紅警示時數改為**每家公司可調**(4–24 小時) | 同上,範圍改 |
| 2026-05-04 | Table 4 採長表 + 4 項分數固定 | 整個 evaluations 結構 |
| 2026-05-04 | Row 月初預先建檔 | `evaluation_periods` 啟動時觸發 |
| 2026-05-04 | 5 個狀態 + 不強制評核順序 | `status` enum + UI 設計 |
| 2026-05-05 (上午) | 解鎖機制完整設計(留痕、無時限、不限次) | Table 5 evaluation_logs |
| 2026-05-05 | 作廢與誤建分離(離職 vs 真刪) | Table 8 deletion_log |
| 2026-05-05 | **Default + Override 加權架構**(Becca 的招牌設計) | Table 1 預設值 + Table 4 weight_override |
| 2026-05-05 | 特殊調整頁面放在報表頁(會計地盤) | UI 設計待 Phase 2 後期 |
| 2026-05-05 | 三張小歷史表設計完成 | Tables 6, 7, 8 |

---

**下一步**:此文件 → SQL DDL(`supabase/migrations/0001_initial_schema.sql`)→ 套用到 Supabase
