# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER V5.2
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-23  
**Trạng thái:** **HOÀN TẤT MILESTONE VILLAGER V5.2 — `693 / 693` TESTS PASS (`0` FAIL) 3/3 LƯỢT | `npm run lint` (`0` LỖI) | BUILD PASS (`29` TỆP, `0` FILE AUDIO) — Chưa kiểm chứng trên Chrome thật — DỪNG CHỜ DUYỆT**

> **Sao lưu báo cáo cũ:** Bản `respond.md` trước V5.2 (báo cáo Milestone CLEANUP-1) đã được sao lưu nguyên vẹn tại `/respond_v5_2_prev.md`, đồng thời giữ nguyên toàn bộ các tệp `respond_*_prev.md` khác.

---

## 1. Chặng 0 — Kiểm toán Tham số Cũ & Phạm vi Ảnh hưởng

1. **Rà soát nền xanh sau `CLEANUP-1`:** Toàn bộ hằng số V5 cũ trong `src/`, `__tests__/`, và 4 tài liệu (`PRODUCT_SPEC.md`, `PROJECT_STATUS.md`, `README.md`, `ARCHITECTURE.md`) đã được kiểm toán trước khi chỉnh sửa.
2. **Định vị tập trung hằng số V5.2:**
   - Giá công trình Stone Age tập trung duy nhất tại `src/core/civilization/buildingCatalog.ts` (`STONE_AGE_BUILDING_DEFINITIONS`).
   - Giá tuyển dân, trần & tỉ lệ buff dân làng tập trung tại `src/core/civilization/constants.ts`.
   - Điều kiện chuyển kỷ nguyên Stone → Bronze (`STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`, `ERA_LEVEL_RULES`, `evaluateEraAdvance`) tập trung tại `src/core/civilization/eraRules.ts`.
   - UI (`RewardHelpModal.tsx`, `BuildingDetailsModal.tsx`, `LandExpansionModal.tsx`, `BuildingCatalogPanel.tsx`) đọc động từ `constants.ts` & `buildingCatalog.ts`, không hardcode lại số buff hay chi phí V5.
   - Ghi nhận trung thực: tệp đính kèm `economy_sim_v52.py` không có sẵn trong workspace; mô phỏng cân bằng V5.2 được đối chiếu và port trực tiếp sang TypeScript dùng đúng engine thực (`MultiplierRules`, `DEFAULT_REWARD_CONFIG`, `calculatePlayerLevel`, `questEngine`, `buildingCatalog`, `villager`, `villagerBuffs`, `civilizationBonusHelper`, `eraRules`) trong `__tests__/core/economyBalance.test.ts`.

---

## 2. Chi tiết Các Thay đổi Mã nguồn (`src/`)

### 2.1. Giá gốc Công trình Stone Age (`src/core/civilization/buildingCatalog.ts`)
*(Giữ nguyên toàn bộ `upgradeCostMultiplier`, `maxLevel`, `footprint`, `unlockRequirements` và `CoinBonus` `+2%/cấp`, `+3%/cấp`; công thức nâng cấp giữ `Math.round(baseCost × mult^level)`.)*

| Công trình (`definitionId`) | Nhóm | `baseCost` V5 | **`baseCost` V5.2** | `mult` | Chi phí nâng `L1→2..L4→5` | Tổng tối đa / 1 nhà | Giới hạn xây | Tổng trần Stone Age |
|---|---|---:|---:|---:|---|---:|---:|---:|
| *Campfire* (`stone_age_campfire`) | `DECORATIVE` | 8 | **4** | 1.5 | *(không nâng cấp)* | 4 | 1 *(mục tiêu)* | **4** |
| *Ancient Totem* (`stone_age_totem`) | `DECORATIVE` | 15 | **8** | 1.6 | *(không nâng cấp)* | 8 | 1 *(mục tiêu)* | **8** |
| *Meditation Cave* (`stone_age_study_cave`) | `FOCUS_SUPPORT` | 25 | **12** | 1.75 | `21, 37, 64, 113` | **247** | 1 | **247** |
| *Elder's Hut* (`stone_age_elder_hut`) | `FOCUS_SUPPORT` | 40 | **20** | 1.8 | *(không nâng cấp)* | 20 | 1 *(mục tiêu)* | **20** |
| *Foraging Post* (`stone_age_foraging_post`) | `ECONOMY_EFFECT` | 30 | **15** | 1.6 | `24, 38, 61, 98` | **236** | 4 | **944** |
| *Primitive Granary* (`stone_age_food_cache`) | `ECONOMY_EFFECT` | 60 | **30** | 1.8 | `54, 97, 175, 315` | **671** | 4 | **2,684** |
| **Tổng xây + nâng cấp tối đa Đồ Đá** | | | | | | | | **3,907 Coins** |

### 2.2. Dân làng & Buff Vai trò (`src/core/civilization/constants.ts`)
- **Giá tuyển dân (`VILLAGER_BASE_RECRUIT_COST`):** `40` → **`25`** (`Math.round(25 × 1.35^n)` cho `n = 0..9`: `[25, 34, 46, 62, 83, 112, 151, 204, 276, 372]` Coins).
- **Thợ thủ công (`Crafter`):** `+3%` → **`+5%` CoinBonus/người** (`VILLAGER_CRAFTER_COIN_BONUS_RATE = 0.05`), trần `+30%` → **`+40%`** tại `8` người (`VILLAGER_CRAFTER_COIN_BONUS_CAP = 0.4`). *Chỉ nhân Coins, không nhân XP hay Quest.*
- **Trưởng lão (`Elder`):** `-4%` → **`-6%` giảm giá nâng cấp/người** (`VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE = 0.06`), giữ trần **`-30%`** (đạt trần sớm hơn tại `5` người, `VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP = 0.3`).
- **Tiều phu (`Woodworker`):** Giữ nguyên **`-5%` giảm giá mở rộng đất/người** (`0.05`), trần **`-40%`** tại `8` người (`0.4`), giữ nguyên cổng `Player Level >= k + 2`.
- **Bộ tộc đủ 3 vai trò (`Complete Tribe`):** `+5%` → **`+10%` CoinBonus** (`VILLAGER_COMPLETE_TRIBE_COIN_BONUS = 0.1`).
- **Trần `CoinBonus` lý thuyết Thời đại Đồ Đá:** `+100%` (4× Foraging Post L5 + 4× Granary L5) `+ 40%` (8 Crafter) `+ 10%` (Complete Tribe) = **`+150%`**.

### 2.3. Điều kiện Lên Bronze Age (`src/core/civilization/eraRules.ts`) — CHƯA kích hoạt chuyển Era
- **`ERA_LEVEL_RULES.BRONZE_AGE.entryFloor`:** `4` → **`5`**.
- **`STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`:**
  - `minPlayerLevel`: `12` → **`9`**
  - `minTotalFocusMinutes`: `1,500` → **`500`**
  - `feeCoins`: `3,500` → **`500`** Coins
  - `minLandExpansions`: **`3`** ô chunk (kiểm tra mới `land_expansions`)
  - `villagerRequirements`: **`>= 1 crafter`, `>= 1 elder`, `>= 1 woodworker`** (kiểm tra mới `villager:crafter`, `villager:elder`, `villager:woodworker`)
  - `buildingRequirements`: *Campfire* `1×L1`, *Totem* `1×L1`, *Elder's Hut* `1×L1`, *Meditation Cave* `1×` **`>= Lv.5`**, *Foraging Post* `4×` **`>= Lv.5`**, *Primitive Granary* `4×` **`>= Lv.5`** (tổng chi phí xây + nâng cấp sàn = **`3,907 + 500 = 4,407` Coins**).
- Hàm `evaluateEraAdvance` giữ nguyên tính thuần khiết 100% (không đọc storage, không mutate input, xử lý an toàn `null`/`undefined`/frozen inputs). Logic chuyển Era thực tế (`era` chuyển `BRONZE_AGE`, trừ `500` Coins, UI nâng Era) **chưa kích hoạt** và giữ cho **Giai đoạn 5C-2**.

---

## 3. Bộ Kiểm thử Đã Cập nhật (`__tests__/`)

Tất cả các bộ test liên quan đã được cập nhật để đọc từ hằng số V5.2, mở rộng bảng chân trị mới, và **không sử dụng `.skip` hay nới assertion**:
1. **`__tests__/core/eraRules.test.ts` (`3/3` tests):** Kiểm chứng `entryFloor = 5` (`getEntryLevel` `1→5`, `4→5`, `5→5`, `7→7`, `15→10`), ngưỡng `Lv.8/9`, `499/500` phút, `499/500` Coins, thiếu từng vai trò dân làng (`crafter`/`elder`/`woodworker`) → `false`, bỏ trống `villagers` → `false`, mở `2` ô đất → `false` vs `3` ô → `true`, Cave/Foraging/Granary ở `Lv.4` → `false`, và bảo toàn bất biến frozen inputs.
2. **`__tests__/core/economyBalance.test.ts` (`4/4` tests):**
   - Kiểm chứng tổng Stone Age max = **`3,907` Coins** (`4 + 8 + 247 + 20 + 944 + 2,684`) và mở rộng đất đơn điệu `k=20 = 4,163 <= 5,000`.
   - Kiểm chứng hoàn vốn từng bước nâng cấp & Crafter `1..10` (`<= 60` ngày ở `378` Coins/ngày).
   - Port mô phỏng tiến trình Stone → Bronze trên engine thực (lưu ý trung thực: đây là mô phỏng xác định trong test Node.js, không phải phiên chạy thực tế trên Chrome):
     - Mix tối ưu kiểm chứng lệch tối đa `±1` ngày với mục tiêu V5.2: `[180] ≈ 4d` (`[4, 8]`), `[60,60,60] ≈ 7d` (`[5, 7]`), `[45×4] ≈ 7d` (`[4, 8]`), `[120]` trong `[7, 11]`, `[60,60] ≈ 9d`, `[45,45] ≈ 13d` (`[12, 19]`), `[60] ≈ 17d` (`[12, 19]`).
     - Khẳng định **"buff dân làng có ích"**: `withBuffs < noBuffs` trên các hồ sơ `[60]`, `[60,60]`, và `[45,45]`.
   - Kiểm chứng tổng sàn công trình + phí lên Era = **`3,907 + 500 = 4,407` Coins**.
3. **Các bộ test core, storage, background & UI đồng bộ theo giá/buff V5.2 (14 tệp):**
   - Core: `buildingCatalog.test.ts`, `buildingUpgrade.test.ts`, `villager.test.ts`, `villagerBuffs.test.ts` (`+150%` ceiling).
   - Storage: `villagerMigration.test.ts` (hoàn trả Cave trùng/xung đột `12 + 70 = 82` và `12 + 21 = 33`).
   - Background: `recruitVillager.test.ts`, `villagerBuffsIntegration.test.ts`, `upgradeBuilding.test.ts`, `civilizationMessages.test.ts`, `civilizationBonusIntegration.test.ts`, `civilizationTransactionAudit.test.ts`, `civilizationConcurrency.test.ts` (Tests A, B, D, G, H).
   - UI: `villagerBuffsUi.test.ts`, `civilizationView.test.ts`, `upgradeBuildingUi.test.ts`.

---

## 4. Cam kết Bảo toàn Bất biến

- **Không thay đổi** `CURRENT_SCHEMA_VERSION = 4` (`src/storage/migrations/migrationRunner.ts`), `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2` (`fq_civilization`), và `era = 'STONE_AGE'`.
- **Không kích hoạt** chuyển Era sang `BRONZE_AGE`, không trừ `500` `feeCoins`, không thêm message/UI nâng Era (`5C-2`).
- **Không thay đổi** công thức thưởng cơ sở, `MultiplierRules` (`×1.0..×2.5`), XP curve (`calculatePlayerLevel`), công thức Quest, công thức mở rộng đất (`round(60 × 1.25^(k-1))`, cổng `k + 2`), hay hoàn tiền phá dỡ `50%`.
- `CoinBonus` từ dân làng (`Crafter` + `Complete Tribe`) và công trình kinh tế chỉ nhân Coins, **tuyệt đối không nhân XP hay Quest**.

---

## 5. Kết quả Kiểm định Thực tế (Chạy sau khi hoàn tất toàn bộ Mã nguồn & Tài liệu)

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **Typecheck (`tsc`)** | `npm run lint` (`tsc --noEmit`) | **PASS (Exit 0)** | **`0` lỗi TypeScript** trên toàn bộ `src/` và `__tests__/` |
| **Full Suite — Lượt 1** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`25,395.43 ms`** |
| **Full Suite — Lượt 2** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`24,605.89 ms`** |
| **Full Suite — Lượt 3** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`24,401.99 ms`** |
| **Production Build** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,765` modules transformed trong **`842ms`**; `dist/` có **`29` tệp (`1,310,067 B`)**, **`0` file audio** (`.mp3/.ogg/.wav/.m4a/.flac`) |
| **i18n EN/VI Parity** | Kiểm tra `EN_MESSAGES` / `VI_MESSAGES` | **582 / 582 khóa** | Parity `true` 100% khóa & placeholder; rào chắn tĩnh `i18nStaticGuard` PASS |

**Chi tiết chunk chính trong `dist/` sau build sạch:**
- `dist/index.html`: `1.37 kB` (gzip: `0.49 kB`)
- `dist/background.js`: `112.25 kB` (gzip: `25.35 kB`)
- `dist/offscreen.js`: `3.87 kB` (gzip: `1.48 kB`)
- `dist/blocked.js`: `1.32 kB` (gzip: `0.60 kB`)
- `dist/assets/popup-4HyrLthM.js`: `858.80 kB` (gzip: `217.24 kB`)
- `dist/assets/popup-CAdNM5Ro.css`: `96.68 kB` (gzip: `14.74 kB`)
- `dist/assets/questEngine-DPQyF7Ku.js`: `129.21 kB` (gzip: `37.70 kB`)
- `dist/assets/translator-BqVD4RpM.js`: `73.00 kB` (gzip: `21.60 kB`)
- `dist/assets/storageKeys-C4hhw6ET.js`: `0.39 kB` (gzip: `0.27 kB`)

---

## 6. Tài liệu Đã Đồng bộ & Checklist Kiểm thử Chrome Thật (`>= 116`)

- **Tài liệu đã cập nhật:**
  - `PRODUCT_SPEC.md` (`v1.9.0-synced` — giá V5.2 `4/8/12/20/15/30`, tổng `3,907`, tuyển `25×1.35^n`, Crafter `+5%/+40%`, Elder `-6%/-30%`, Tribe `+10%`, trần `+150%`, luật Era `Lv.9 / 500m / 500 Coins / 3 roles / 3 đất / floor Lv.5 / entryFloor = 5`, `582` khóa parity).
  - `PROJECT_STATUS.md` (cập nhật Milestone Villager V5.2 trên nền `CLEANUP-1`, ghi nhận rõ phần chưa kiểm chứng trên Chrome thật).
  - `README.md` & `ARCHITECTURE.md` (`v1.12.2` — đồng bộ hằng số V5.2, kiểm tra mới trong `eraRules.ts`, `693/693` PASS, `0` lỗi lint).
  - `/respond_v5_2_prev.md` (sao lưu nguyên vẹn báo cáo `CLEANUP-1`; giữ nguyên mọi `respond_*_prev.md` khác).

- **Trạng thái kiểm thử trình duyệt:** **Chưa kiểm chứng trên Chrome thật** *(mới xác minh qua Node.js CLI, React SSR, `tsc --noEmit` và Vite build)*. Khi duyệt, vui lòng nạp lại thư mục `dist/` ở `chrome://extensions/` và kiểm tra nhanh:
  1. **Catalog & Giá mới:** Mở bản đồ Stone Age kiểm tra giá xây mới: *Campfire* `4`, *Ancient Totem* `8`, *Meditation Cave* `12`, *Foraging Post* `15`, *Elder's Hut* `20`, *Primitive Granary* `30`.
  2. **Tuyển dân & Buff V5.2:** Xây *Meditation Cave*, xác nhận giá tuyển dân đầu tiên là `25` Coins (`25, 34, 46...`); tuyển đủ `elder`, `crafter`, `woodworker` và kiểm tra panel `Tóm tắt Buff Dân làng` hiển thị `Crafter +5%/người (trần +40%)`, `Elder -6%/người (trần -30%)`, `Woodworker -5%/người (trần -40%)`, `Complete Tribe +10%`.
  3. **Nâng cấp & Mở đất:** Kiểm tra giá nâng cấp gốc bị gạch ngang và giảm đúng `-6%` mỗi `Elder`; mở rộng đất giảm `-5%` mỗi `Woodworker` và vẫn giữ cổng `Player Level >= k + 2`.
  4. **Help `?` & Bảo toàn Era:** Mở **Help `?`** kiểm tra mục **Buff Dân làng** đọc đúng các tỉ lệ mới ở cả EN & VI; hoàn thành 1 phiên Focus ngắn để xác nhận XP không bị nhân bởi `CoinBonus` và Era hiện tại vẫn là **Stone Age** (`era = 'STONE_AGE'`, không trừ `500` Coins).

---

DỪNG — CHỜ DUYỆT VILLAGER V5.2.
