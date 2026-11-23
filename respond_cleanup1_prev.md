# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER V5 (BẢN 3)
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-22  
**Trạng thái:** **HOÀN TẤT CHẶNG 0 → PHẦN C — 107/107 V5 SUITES PASS | FULL SUITE 683/692 PASS (9 fail pre-existing ngoài V5) | BUILD PASS (Chưa kiểm chứng trên Chrome thật — DỪNG CHỜ DUYỆT)**

> **Sao lưu báo cáo cũ:** Bản báo cáo V4 trước đó đã được sao lưu nguyên vẹn tại `respond_villager_v5_prev.md` (giữ nguyên toàn bộ các tệp `respond_*_prev.md` khác).

---

## 1. Chặng 0 — Kết quả Kiểm toán (Audit trước khi sửa mã)

1. **Tình trạng mô hình tham chiếu `economy_sim.py`:** Không tồn tại trên ổ đĩa trong workspace hiện tại (ghi nhận trung thực). Toàn bộ phép kiểm toán cân bằng, hoàn vốn `<= 60` ngày và mô phỏng 4 hồ sơ `3 giờ/ngày` (`[180]`, `[90,90]`, `[60,60,60]`, `[45,45,45,45]`) được cài đặt và kiểm chứng trực tiếp bằng TypeScript dùng đúng engine thực (`MultiplierRules`, `DEFAULT_REWARD_CONFIG`, `calculatePlayerLevel`, `questEngine`, `buildingCatalog`, `villager`, `eraRules`) trong `__tests__/core/economyBalance.test.ts`.
2. **Kiểm toán 6 tệp lõi & phát hiện sai lệch tài liệu:**
   - `src/core/civilization/buildingCatalog.ts`: phát hiện công thức nâng cấp chạy thực tế là `Math.round(baseCost * Math.pow(upgradeCostMultiplier, currentLevel))` (tức `upgradeCostMultiplier^L` với `L = currentLevel`), trong khi `PRODUCT_SPEC.md` dòng 146 từng ghi nhầm `upgradeCostMultiplier^(L - 1)`. Đã đính chính trong `PRODUCT_SPEC.md`.
   - `src/core/civilization/{constants,landExpansion,buildingUpgrade,civilizationBonusHelper}.ts` & `src/background/civilizationCoordinator.ts`: kiểm tra đầy đủ ràng buộc bất biến — `CURRENT_SCHEMA_VERSION` giữ nguyên `4`, không đổi base coin/XP, không đổi Stopwatch `5m`, không đổi Multiplier tier, không đổi Quest hay Player Level curve, và không kích hoạt chuyển Era.

---

## 2. Phần A — Tái cân bằng Kinh tế (Stone Age & Mở rộng đất)

### 2.1. Bảng thay đổi `baseCost` Công trình Thời đại Đồ Đá
*(Giữ nguyên toàn bộ `upgradeCostMultiplier`, `maxLevel`, `footprint`, `unlockRequirements` và tỷ lệ `CoinBonus` `+2%/cấp`, `+3%/cấp`)*

| Công trình (`definitionId`) | Nhóm | `baseCost` cũ | `baseCost` mới (V5) | `upgradeCostMultiplier` | Chi phí các bậc nâng (`L1→2..L4→5`) | Tổng tối đa / 1 nhà | Giới hạn xây | Tổng trần Stone Age |
|---|---|---:|---:|---:|---|---:|---:|---:|
| *Campfire* (`stone_age_campfire`) | `DECORATIVE` | 15 | **8** | 1.5 | *(không nâng cấp)* | 8 | 1*(mục tiêu)* | **8** |
| *Ancient Totem* (`stone_age_totem`) | `DECORATIVE` | 30 | **15** | 1.6 | *(không nâng cấp)* | 15 | 1*(mục tiêu)* | **15** |
| *Meditation Cave* (`stone_age_study_cave`) | `FOCUS_SUPPORT` | 50 | **25** | 1.75 | `44, 77, 134, 234` | **514** | 1 | **514** |
| *Elder's Hut* (`stone_age_elder_hut`) | `FOCUS_SUPPORT` | 80 | **40** | 1.8 | *(không nâng cấp)* | 40 | 1*(mục tiêu)* | **40** |
| *Foraging Post* (`stone_age_foraging_post`) | `ECONOMY_EFFECT` | 60 | **30** | 1.6 | `48, 77, 123, 197` | **475** | 4 | **1,900** |
| *Primitive Granary* (`stone_age_food_cache`) | `ECONOMY_EFFECT` | 120 | **60** | 1.8 | `108, 194, 350, 630` | **1,342** | 4 | **5,368** |
| **Tổng xây + nâng cấp tối đa Đồ Đá** | | | | | | | | **7,845 Coins** |

### 2.2. Mở rộng đất (`LAND_EXPANSION_RATIO_CAP = 1.25`)
- **Cập nhật (`src/core/civilization/constants.ts`):** Hạ `LAND_EXPANSION_RATIO_CAP` từ `1.5` xuống **`1.25`** (giữ `LAND_EXPANSION_BASE_COST = 60`, `LAND_EXPANSION_LEVEL_OFFSET = 2` → cổng `Player Level >= k + 2`).
- **Chuỗi giá gốc đơn điệu tăng (`cost(k) = Math.round(60 × 1.25^(k-1))`):**
  - `k=1..10`: `60, 75, 94, 117, 146, 183, 229, 286, 358, 447`
  - `k=20`: **`4,163` Coins** (`<= 5,000` theo mục tiêu V5).

### 2.3. Chứng minh Thời gian Hoàn vốn (`Payback <= 60 ngày` ở mức chuẩn `378` base Coins/ngày)
- Mức cơ sở tham chiếu (`3 × 60p` Countdown `×1.4`): `378` Coins/ngày.
- *Foraging Post* (`+2%/cấp` → `+7.56` Coins/ngày): đặt mới `30 / 7.56 = 3.97d`, nâng `L4→L5` đắt nhất `197 / 7.56 = 26.06d <= 60d`.
- *Primitive Granary* (`+3%/cấp` → `+11.34` Coins/ngày): đặt mới `60 / 11.34 = 5.29d`, nâng `L4→L5` đắt nhất `630 / 11.34 = 55.56d <= 60d`.
- *Crafter* thứ 1..10 (`+3% CoinBonus` → `+11.34` Coins/ngày): dân #1 `40 / 11.34 = 3.53d`, dân #10 `596 / 11.34 = 52.56d <= 60d`.

---

## 3. Bảng Đối chiếu Mô phỏng 4 Hồ sơ 3 giờ/ngày (`Stone → Bronze`)

Chạy trực tiếp trên bộ mô phỏng `economyBalance.test.ts` (bắt đầu Thứ Hai `2026-01-05`, tích lũy XP, Daily/Weekly Quest, mua công trình kinh tế + Crafter theo ROI tối ưu rồi tích lũy đủ `3,500` `feeCoins`):

| Hồ sơ mỗi ngày (3h/ngày) | Multiplier | Coins cơ sở/ngày | Ngày đạt điều kiện (`±1d` mục tiêu) | Coins dư lúc đạt | Level đạt được | Tổng phút Focus | `CoinBonus` cuối | Hạ tầng đạt sàn (`Cave/Forage/Granary/Crafter`) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `1 × 180p` (`[180]`) | `×2.5` | `675` | **Ngày 9** *(mục tiêu 9d)* | `6,040.5` | `Lv. 21` | `1,620p` | `+92%` | `1×Cave L4`, `4×Forage L4`, `4×Granary L4`, `4 Crafter` |
| `2 × 90p` (`[90, 90]`) | `×1.6` | `432` | **Ngày 11** *(mục tiêu 11d)* | `4,054.88` | `Lv. 19` | `1,980p` | `+92%` | `1×Cave L4`, `4×Forage L4`, `4×Granary L4`, `4 Crafter` |
| `3 × 60p` (`[60, 60, 60]`) *(Chuẩn)* | `×1.4` | `378` | **Ngày 12** *(mục tiêu 12d)* | `3,798.46` | `Lv. 18` | `2,160p` | `+92%` | `1×Cave L4`, `4×Forage L4`, `4×Granary L4`, `4 Crafter` |
| `4 × 45p` (`[45, 45, 45, 45]`) | `×1.2` | `324` | **Ngày 14** *(mục tiêu 14d)* | `3,893.04` | `Lv. 19` | `2,520p` | `+92%` | `1×Cave L4`, `4×Forage L4`, `4×Granary L4`, `4 Crafter` |

---

## 4. Phần B — Buff 3 Vai trò Dân làng, Coordinator & Giao diện

### 4.1. Engine thuần (`src/core/civilization/{villagerBuffs,civilizationBonusHelper,buildingUpgrade,landExpansion}.ts`)
- **Thợ thủ công (`crafter`):** `+3%` `CoinBonus`/người (`VILLAGER_CRAFTER_COIN_BONUS_RATE = 0.03`), trần **`+30%`** tại `10` người (`VILLAGER_CRAFTER_COIN_BONUS_CAP = 0.3`). Chỉ áp dụng vào **Focus Coins**, tuyệt đối không tác động lên XP hay Quest.
- **Đủ bộ 3 vai trò (`Complete Tribe`):** Khi có ít nhất `1 elder`, `1 crafter`, `1 woodworker`, cộng thêm **`+5%` `CoinBonus`** (`VILLAGER_COMPLETE_TRIBE_COIN_BONUS = 0.05`). Tổng trần `CoinBonus` lý thuyết Thời đại Đồ Đá: `+100% (công trình) + 30% (10 Crafter) + 5% (Complete Tribe) =` **`+135%`**.
- **Tiều phu (`woodworker`):** `-5%` chi phí mở rộng đất/người (`0.05`), trần **`-40%`** tại `8` người (`0.4`). Áp dụng qua `applyCostDiscount(baseCost, discountRate) = Math.max(1, Math.round(baseCost * (1 - rate)))`; giữ nguyên cổng `Player Level >= k + 2`.
- **Trưởng lão (`elder`):** `-4%` chi phí **nâng cấp** công trình/người (`0.04`), trần **`-30%`** tại `8` người (`0.3`). Chỉ áp dụng trong `evaluateBuildingUpgrade` (không giảm chi phí xây mới hay tuyển dân); hoàn tiền phá dỡ `50%` vẫn tính chuẩn trên chi phí chuẩn xác định của `calculateTotalBuildingCoinsSpent`.

### 4.2. Tích hợp Background & UI (`CivilizationCoordinator`, `extensionClient.ts`, Components, i18n)
- `CivilizationCoordinator`:
  - `ensureInitialized()`, `getCivilizationState()`, `placeBuilding()`, `removeBuilding()`, `upgradeBuilding()`, `recruitVillager()` đều cập nhật `this.cachedBonuses = extractCivilizationCoinBonuses(buildings, villagers)` ngay trong `onCommitted` trước khi nhả `StorageMutex`.
  - `upgradeBuilding()` truyền `buffSummary.upgradeDiscountRate` vào `evaluateBuildingUpgrade`; `expandLand()` truyền `buffSummary.expansionDiscountRate` vào `evaluateExpansion`.
- `extensionClient.ts`: Đồng bộ toàn bộ logic simulator (giá mới, giảm giá Elder/Woodworker, `extractCivilizationCoinBonuses`), nâng `mockState.economy.focusCoins = 120` để web preview trải nghiệm ngay được luồng xây dựng.
- **UI & Song ngữ (`580` khóa EN/VI parity — thêm `17` khóa V5 với `0` chuỗi hardcode trong mã V5):**
  - `BuildingDetailsModal.tsx`: Khối `villager-buff-summary` hiển thị buff thực tế theo từng vai trò + huy hiệu `At cap` / `Đạt trần`, `selected-role-buff-preview` giải thích buff khi chọn vai trò, giá nâng cấp gốc gạch ngang (`upgrade-base-cost-strike`) + badge giảm giá Elder (`upgrade-discount-badge`), sử dụng `getEffectiveMaxLevel`.
  - `LandExpansionModal.tsx`: Truyền `villagers`, hiển thị giá gốc gạch ngang (`expand-base-cost-strike`) + badge giảm giá Woodworker (`expand-discount-badge`).
  - `RewardHelpModal.tsx`: Bổ sung khối `help-villager-buffs` đọc động hằng số từ `constants.ts` (EN & VI).
  - `BuildingCatalogPanel.tsx`, `CivilizationHeader.tsx`, `TimerView.tsx`, `App.tsx`: dùng `getEffectiveMaxLevel` và `extractCivilizationCoinBonuses` đồng bộ tức thời `CoinBonus` trên Header và Running View.

---

## 5. Phần C — Luật Era Thuần (`src/core/civilization/eraRules.ts`) — CHƯA KÍCH HOẠT

1. **Bảng trần & sàn nâng cấp (`ERA_LEVEL_RULES`):**
   - `STONE_AGE`: `upgradeCap = 5`, `entryFloor = 1`, `provisional = false`
   - `BRONZE_AGE`: `upgradeCap = 10`, `entryFloor = 4`, `provisional = false`
   - `IRON_AGE (15)`, `MEDIEVAL (20)`, `EARLY_MODERN (30)`, `MODERN (40)`, `FUTURISTIC (50)`, `INTERPLANETARY (60)`: đều mang cờ **`provisional: true`**.
2. **Hàm thuần & Bộ đánh giá:**
   - `getEraUpgradeCap`, `getEffectiveMaxLevel`, `getEraAdvanceRequirements`, `getEntryLevel` (`max(carriedLevel, entryFloor)` kẹp `[1, upgradeCap]`), `evaluateEraAdvance` (kiểm tra bất biến, an toàn `null`/dữ liệu lỗi).
   - `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`: `minPlayerLevel = 12`, `minTotalFocusMinutes = 1500`, `feeCoins = 3500`, yêu cầu công trình: `Campfire 1×L1`, `Totem 1×L1`, `Elder's Hut 1×L1`, `Cave 1×L4`, `Foraging Post 4×L4`, `Granary 4×L4` → tổng chi phí sàn `4,303 + 3,500 =` **`7,803` Coins**.
3. **Cam kết Chưa Kích Hoạt Chuyển Era:**
   - `CivilizationState.era` luôn giữ nguyên `'STONE_AGE'`.
   - **Không** trừ `3,500` `feeCoins`, **không** thêm extension message hay nút bấm chuyển Era vào `MessageHandler` / UI (giữ trọn cho Giai đoạn `5C-2`).

---

## 6. Bộ Kiểm thử Đã cập nhật & Tạo mới

### Tạo mới (5 bộ test V5)
1. `__tests__/core/villagerBuffs.test.ts` — đếm vai trò an toàn/frozen, Crafter `+30%`, Woodworker `-40%`, Elder `-30%`, Complete Tribe `+5%`, trần lý thuyết `+135%`, `applyCostDiscount` tối thiểu `1` Coin.
2. `__tests__/core/economyBalance.test.ts` — 4 suites kiểm chứng `7,845` tổng Đồ Đá, `k=1..30` đơn điệu & `k=20 = 4,163`, hoàn vốn `<= 60d`, mô phỏng 4 hồ sơ `9 / 11 / 12 / 14` ngày, và tổng sàn `4,303 + 3,500 = 7,803`.
3. `__tests__/core/eraRules.test.ts` — `ERA_LEVEL_RULES` & cờ `provisional`, `getEffectiveMaxLevel`, `getEntryLevel` `[4..10]`, bảng chân lý `evaluateEraAdvance` & bất biến không mutate input.
4. `__tests__/background/villagerBuffsIntegration.test.ts` — cache & rehydrate `CivilizationCoordinator` khi SW restart, nhân `CoinBonus` lên Coins (0 chạm XP/Stats/Quests), tách bạch Elder (chỉ nâng cấp) vs Woodworker (chỉ mở đất, giữ `k+2`), race `Promise.all`, rollback khi ghi storage lỗi.
5. `__tests__/ui/villagerBuffsUi.test.ts` — `BuildingDetailsModal` (`At cap`/`Đạt trần`, preview vai trò, Elder `-20%` gạch ngang), `LandExpansionModal` (Woodworker `-20% Tiều phu`), `RewardHelpModal` `help-villager-buffs` EN/VI, `CivilizationHeader`, `BuildingCatalogPanel`.

### Cập nhật (12 bộ test cũ cho khớp giá & buff V5)
1. `__tests__/core/buildingCatalog.test.ts`
2. `__tests__/core/buildingUpgrade.test.ts`
3. `__tests__/core/landExpansion.test.ts`
4. `__tests__/storage/villagerMigration.test.ts`
5. `__tests__/background/upgradeBuilding.test.ts`
6. `__tests__/background/recruitVillager.test.ts`
7. `__tests__/background/civilizationBonusIntegration.test.ts`
8. `__tests__/background/civilizationMessages.test.ts`
9. `__tests__/background/civilizationConcurrency.test.ts`
10. `__tests__/background/civilizationTransactionAudit.test.ts`
11. `__tests__/ui/civilizationView.test.ts`
12. `__tests__/ui/upgradeBuildingUi.test.ts`

---

## 7. Kết quả Kiểm định Thực tế (CLI Headless)

> *Ghi chú: Toàn bộ lệnh dưới đây được chạy trực tiếp sau khi hoàn tất mọi chỉnh sửa mã nguồn và tài liệu.*

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **17 bộ Test V5** | `npx tsx --test` *(17 tệp V5)* | **PASS (Exit 0)** | **`107 / 107` PASS (`0` fail)** trong `10,335.02 ms` |
| **Full Suite × 3 lượt** | `npm test` *(chạy 3 lần liên tiếp)* | **683 / 692 PASS** *(nhất quán 3/3 lượt)* | Lượt 1: `683 pass / 9 fail` (`33,002.33 ms`) · Lượt 2: `683 pass / 9 fail` (`24,403.91 ms`) · Lượt 3: `683 pass / 9 fail` (`24,166.70 ms`) |
| **Typecheck (`tsc`)** | `npm run lint` (`tsc --noEmit`) | **0 lỗi ở V5** *(Exit 1 do lỗi cũ)* | Lỗi sẵn có không liên quan ngoài V5: `__tests__/background/errorCodesAndTranslator.test.ts` & `src/ui/components/Header.tsx(132,22)` (`"header.levelShort"`) |
| **Production Build** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,765` modules transformed, **`2.67s`**; `dist/` có **`29`** tệp (**`1,309,682 B`**), **`0`** file audio (`.mp3/.ogg/.wav/.m4a/.flac`) |
| **i18n EN/VI V5** | Kiểm tra `EN_MESSAGES`/`VI_MESSAGES` | **580 / 580 khóa** | Parity 100% số khóa (`580` EN / `580` VI) & `0` lỗi hardcoded `aria-label`/`title`/`placeholder` |

**Chi tiết 9 test fail sẵn có trên repo (nằm hoàn toàn ngoài phạm vi Milestone Villager V5, không tự ý sửa):**
1. `__tests__/background/errorCodesAndTranslator.test.ts` (4 tests `#58..61`)
2. `__tests__/ui/i18nStaticGuard.test.ts` (2 tests `#567` dòng 28 `civ.details.effectCaveSupport` & `#569` dòng 76 `MapGridView.tsx`)
3. `__tests__/ui/lofi2MusicUi.test.ts` (1 test `#574` liên quan `Header.tsx`)
4. `__tests__/ui/rewardHelpModal.test.ts:67` (1 test `#600`)
5. `__tests__/ui/ux2PomodoroOutcomeDisplay.test.ts:283` (1 test `#652`)

---

## 8. Tài liệu Đã Đồng bộ
- `PRODUCT_SPEC.md` (cập nhật giá V5, `LAND_EXPANSION_RATIO_CAP = 1.25`, sửa typo `upgradeCostMultiplier^L`, buff dân làng, `+135%`, luật Era `1,500p / Lv.12 / 7,803 Coins` chưa kích hoạt, `580` khóa i18n).
- `ARCHITECTURE.md` (v`1.12.0` — `villagerBuffs.ts`, `eraRules.ts`, `extractCivilizationCoinBonuses`, Elder/Woodworker discounts trong `CivilizationCoordinator`, UI V5).
- `PROJECT_STATUS.md` (cập nhật Milestone Villager V5 ở §1, §3, §4, §5 — ghi rõ `"chưa kiểm chứng trên Chrome thật"`).
- `README.md` (cập nhật Highlights, kinh tế V5, buff dân làng, luật Era chuẩn bị & trạng thái kiểm thử).
- `respond_villager_v5_prev.md` (bản sao lưu `respond.md` của V4; giữ nguyên mọi `respond_*_prev.md` khác).

---

## 9. Checklist Kiểm thử Thủ công trên Chrome Thật (`>= 116`)

> **Trạng thái hiện tại:** **Chưa kiểm chứng trên Chrome thật** (mới xác minh qua Node.js CLI, React SSR, Vite build và TypeScript). Khi duyệt, vui lòng load lại thư mục `dist/` trong `chrome://extensions` và kiểm tra:
1. Mở bản đồ Stone Age kiểm tra giá đặt mới: *Campfire* `8`, *Ancient Totem* `15`, *Meditation Cave* `25`, *Foraging Post* `30`, *Elder's Hut* `40`, *Primitive Granary* `60`.
2. Xây *Meditation Cave*, tuyển đủ `elder`, `crafter`, `woodworker` (hoặc từng vai trò): xác nhận khu vực `Tóm tắt Buff Dân làng` và `Đạt trần` hiện đúng, preview vai trò đổi theo nút chọn.
3. Mở **Chi tiết công trình** của *Foraging Post* / *Granary* / *Cave* khi có ít nhất 1 `Trưởng lão (Elder)`: xác nhận giá gốc bị gạch ngang kèm badge giảm `-X%`, và khi bấm nâng cấp chỉ trừ đúng số Coin đã giảm; đồng thời xác nhận xây mới *Foraging Post* khác vẫn tốn đủ `30` Coin (không bị giảm).
4. Vào **Mở rộng đất** khi có ít nhất 1 `Tiều phu (Woodworker)`: xác nhận giá gốc bị gạch ngang kèm badge `-X% Tiều phu`, **cổng `Player Level >= k + 2` vẫn giữ nguyên**, và sau khi mở rộng chỉ trừ số Coin đã giảm.
5. Chạy 1 phiên Countdown ngắn (hoặc kiểm tra **Help `?` -> Mục CoinBonus & Buff Dân làng**): xác nhận chip `+X%` CoinBonus gồm cả công trình + `Crafter` + `Đủ bộ 3 vai trò`, XP sau phiên vẫn độc lập hoàn toàn, và Kỷ nguyên hiện tại vẫn giữ nguyên **Thời đại Đồ Đá** (`era = STONE_AGE`, không bị trừ `3,500` Coin).

---

DỪNG — CHỜ DUYỆT MILESTONE VILLAGER V5.
