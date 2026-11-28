# BÁO CÁO NGHIỆM THU — MILESTONE 5C — GIAI ĐOẠN 5C-2b: THIẾT KẾ & MÔ PHỎNG CÂN BẰNG BRONZE AGE

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5G** trước đó đã được sao lưu nguyên vẹn tại `respond_5c2b_prev.md`; mọi tệp `respond_*_prev.md` khác trong repo đều được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Milestone 5C — Giai đoạn 5C-2b (CHỈ TÀI LIỆU & MÔ PHỎNG)**: biên soạn đầy đủ bản đặc tả đề xuất **`docs/BRONZE_AGE_DESIGN.md`** (6 mục, chờ duyệt trước khi chạm mã nguồn `5C-2c`), viết và chạy thật script mô phỏng **`scripts/simulateBronzeAge.ts`** tái sử dụng trực tiếp các hàm thuần trong `src/core/`, cập nhật **`PROJECT_STATUS.md`**, giữ nguyên **`0` sửa đổi** trong `src/`, `public/`, `__tests__/`, và kiểm định xanh toàn repo (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`34` tệp**, **`npm test` = `771 / 771 PASS`**).

---

## 1. Tuân Thủ Ràng Buộc Phạm Vi 5C-2b (Design & Simulation Only)

- **Tuyệt đối không sửa mã nguồn sản phẩm & test:**
  - `find src public __tests__ -newer respond_5c2b_prev.md` → **`0` tệp bị sửa đổi**.
  - Không bắt đầu triển khai giai đoạn `5C-2c`.
- **Các tệp đã tạo / cập nhật trong lượt 5C-2b:**
  1. **`docs/BRONZE_AGE_DESIGN.md`** *(tạo mới)* — bản đặc tả đề xuất 6 mục cho Bronze Age.
  2. **`scripts/simulateBronzeAge.ts`** *(tạo mới, nằm ngoài `public/` và `dist/`)* — script mô phỏng CLI nhập trực tiếp `src/core/` (`npx tsx scripts/simulateBronzeAge.ts`).
  3. **`PROJECT_STATUS.md`** *(cập nhật)* — ghi nhận hoàn tất giai đoạn thiết kế & mô phỏng `5C-2b` chờ duyệt.
  4. **`respond_5c2b_prev.md`** *(tạo mới)* — bản sao lưu nguyên vẹn `respond.md` của Milestone 5G.
  5. **`respond.md`** *(cập nhật)* — báo cáo nghiệm thu này.

---

## 2. Tóm Tắt Đề Xuất Thiết Kế Trong `docs/BRONZE_AGE_DESIGN.md`

1. **10 công trình Bronze Age (`id` & `footprint` khớp 100% `bronzeSpriteData.ts`):**
   - `DECORATIVE` *(không nâng cấp, `maxLevel = 1`)*: `bronze_apiary` (`2×2`, lim `2`, `70C`, `Lv.9`), `bronze_watchtower` (`2×3`, lim `2`, `110C`, `Lv.12`, `>= 11` dân).
   - `FOCUS_SUPPORT`: `bronze_longhouse` (`4×2`, lim `1`, `maxLevel = 5`, `120C`, `×1.55`, `Lv.10`, tiền đề `stone_age_study_cave`, `+2` suất dân Bronze/cấp = tối đa `10` dân Bronze), `bronze_scribe_hall` (`2×3`, lim `1`, `maxLevel = 1`, `180C`, `Lv.13`, tiền đề `stone_age_elder_hut`, mở `FOCUS_STAT_UNLOCK`), `bronze_town_hall` (`4×3`, lim `1`, `maxLevel = 1`, `420C`, `Lv.18`, `4` thợ `14,400s`, `>= 14` dân, đủ 3 vai trò Bronze, tiền đề `bronze_longhouse` + `bronze_scribe_hall`, mở `FOCUS_FEATURE_UNLOCK`).
   - `ECONOMY_EFFECT` *(đều `maxLevel = 10`, lim `2` mỗi loại, `0` thu nhập thụ động, chỉ nhân Focus Coins)*: `bronze_market_stall` (`2×2`, `80C`, `×1.28`, `+0.5%/lv`), `bronze_irrigated_field` (`3×3`, `100C`, `×1.28`, `+0.5%/lv`), `bronze_grain_silo` (`2×3`, `120C`, `×1.28`, `+0.5%/lv`), `bronze_craft_workshop` (`3×2`, `150C`, `×1.30`, `+1.0%/lv`), `bronze_forge` (`3×2`, `190C`, `×1.30`, `+1.0%/lv`).
   - **Trần `CoinBonus` đề xuất:** **`+250%` toàn cục** (`+150%` Stone Age giữ nguyên + `+100%` Bronze Age gồm `+70%` từ 10 công trình kinh tế + `+20%` từ 4 Merchant + `+10%` Bronze Guild). Hệ số trần chỉ đi từ `×2.50` lên `×3.50` (`+40.0%` tối đa, thực dụng `+34.0%` ở `+235%`).
2. **3 vai trò dân làng Bronze (`smith`, `merchant`, `mason`):**
   - Sức chứa riêng tại `bronze_longhouse` (`2..10` dân Bronze; tổng dân toàn làng tối đa **`21`** gồm `10` Stone + `1` Founder + `10` Bronze); giá tuyển `round(120 × 1.28^n)` (tổng `4,633 Coins` cho 10 người).
   - `merchant`: `+5%/người`, trần **`+20%`** (`4` người) + **`+10%` Bronze Guild** (đủ 3 vai trò Bronze).
   - `smith`: **`-5%/người` giá đặt công trình mới (`PLACE_BUILDING`)**, trần **`-20%`** (`4` người); **tuyệt đối không cộng dồn với `Elder` (`UPGRADE_BUILDING`)**.
   - `mason`: **`-5%/người` thời gian Focus xây dựng (`place` + `upgrade`)**, trần **`-20%`** (`4` người, sàn `>= 60s`), không ảnh hưởng Coin/XP/thu nhập thụ động.
3. **Liên hệ thống, `5` câu hỏi mở (kèm mặc định khuyến nghị), và kế hoạch `5C-2c`:** trình bày chi tiết tại Mục 3, Mục 5 và Mục 6 của `docs/BRONZE_AGE_DESIGN.md` (giữ nguyên Stone Age `maxLevel <= 5`, tích hợp sẵn skin công cụ hàng `1` từ 5G, và mọi đề xuất Awards tương lai giữ nguyên tắc `0` Coin/XP).

---

## 3. Kết Quả Chạy Thật & Giả Định Mô Phỏng (`npx tsx scripts/simulateBronzeAge.ts`)

### 3.1. Giả Định Mô Phỏng Chính
- Sử dụng trực tiếp `RewardEngine`, `MultiplierRules`, `aggregateCoinBonus`, `calculatePlayerLevel`, `STONE_AGE_BUILDING_DEFINITIONS`, `calculateUpgradeCost`, `getBuildingUpgradeRequiredPlayerLevel`, `evaluateEraAdvance`, `GridMap`, `assignJobsFifo`, `advanceJobs`, `getUpgradeJobSpec`, `getExpansionCost`, `getExpansionRequiredLevel`, `evaluateRecruitment`, `applyCostDiscount`, `applyCompletedSession`, `claimQuest`.
- `Founder Villager = 'crafter'`; chiến lược ưu tiên ROI `CoinBonus` & giảm giá nâng cấp `5 Elders` (`-30%`) → đạt `+235%` ở cuối Bronze (và kiểm tra riêng trần lý thuyết `+250%` trong Bảng c).
- Chạy đủ 3 chế độ độ nhạy: `100%` hoàn thành + Quests (`40C/d`, `150C/w`), `90%` hoàn thành + Quests (bỏ dở 1/10 phiên = 0 Coin/XP/Job), và `100%` hoàn thành chỉ Focus không Quest (`noQ`).

### 3.2. Số Liệu Đo Được Thực Tế

- **Chi phí Bronze Catalog & Dân làng:** `16` công trình (`108` ô bản đồ + `73` ô Stone = `181` ô), `buildingBonusMax = +70.0%`, `floorNet ~= 22,757C`, `maxGross = 54,836C`, `maxNet ~= 38,743C`; `10` dân Bronze = `4,633C`.
- **Tiến độ chính (`100%` completion + Quests):**
  - `1h/d [60]`: **S→B = `18d`** (`Lv.14, +120%`) · Floor = **`+80d`** · Max = **`+108d`** (Tổng `126d`, `Lv.37, +235%`).
  - `1.5h/d [45,45]`: **S→B = `14d`** (`Lv.14, +120%`) · Floor = **`+68d`** · Max = **`+87d`** (Tổng `101d`, `Lv.37, +235%`).
  - `2h/d [60,60]`: **S→B = `10d`** (`Lv.14, +120%`) · Floor = **`+41d`** · Max = **`+57d`** (Tổng `67d`, `Lv.36, +235%`).
  - `2h/d [120]`: **S→B = `9d`** (`Lv.15, +120%`) · Floor = **`+34d`** · Max = **`+46d`** (Tổng `55d`, `Lv.36, +235%`).
  - `3h/d [45,45,45,45]`: **S→B = `8d`** · Floor = `+36d` · Max = **`+45d`** (`53d`).
  - `3h/d [60,60,60]`: **S→B = `7d`** · Floor = `+28d` · Max = **`+38d`** (`45d`).
  - `3h/d [180]`: **S→B = `6d`** · Floor = `+17d` · Max = **`+23d`** (`29d`).
  - *(Độ nhạy `@90%` cho `2h/d`: `[60,60]` đạt Max `+63d`, `[120]` đạt Max `+51d`; Focus thuần `noQ` cho `2h/d [60,60]`: Max `+61d`).*
- **Coin/giờ Focus trước vs sau Bronze (`Stopwatch 25m/60m`, `Countdown 25m..180m`):** Tăng đồng đều **`+34.0%`** ở cấu hình thực dụng (`+235%`) và tối đa **`+40.0%`** ở trần lý thuyết (`+250%`) so với trần Stone (`+150%`). Ví dụ `Countdown 60m (×1.4)`: `315.0 C/h` (`+150%`) → `422.1 C/h` (`+235%`) / `441.0 C/h` (`+250%`).
- **Tổng giây Focus xây dựng (`16` đặt mới + `94` nâng cấp + `7` mở đất):**
  - `Mason = 0`: `285,600s` (`79.33h`) → ở `4 / 6 / 8 / 10..21` thợ cần `45.75h / 30.58h / 23.08h / 20.08h` Wall-Focus (`22.9d / 15.3d / 11.5d / 10.0d` ở `2h/ngày`).
  - `Mason = 3 (-15%)`: `246,540s` (`68.48h`) → ở `10..21` thợ cần `62,535s` (`17.37h`, tức `8.7d` ở `2h/ngày`).
  - `Mason = 4 (-20%)`: `233,520s` (`64.87h`) → ở `10..21` thợ cần `59,280s` (`16.47h`, tức `8.2d` ở `2h/ngày`).

---

## 4. Kết Quả Kiểm Định Toàn Repo Sau Chỉnh Sửa Cuối

| Hạng mục | Lệnh / Công cụ | Kết quả thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Không có lỗi mới |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`34` tệp, `1,341,836 B`)** | `scripts/` & `docs/` nằm ngoài `public/` & `dist/` |
| **Test Suite toàn repo** | `npm test` | **`771 / 771 PASS` (`0` fail, `0` skipped)** | `37,206.84 ms` (~37.2s) |
| **Simulation CLI** | `npx tsx scripts/simulateBronzeAge.ts` | **PASS (Exit 0)** | Đầy đủ 4 bảng `(a)`, `(b)`, `(c)`, `(d)` + kiểm tra độ nhạy |
| **Tính toàn vẹn 5C-2b** | `find src public __tests__ -newer respond_5c2b_prev.md` | **PASS (`0` file thay đổi)** | Mã nguồn giữ nguyên tại Milestone 5G |

---

## 5. Bước Tiếp Theo Chờ Duyệt

1. Rà soát đặc tả **`docs/BRONZE_AGE_DESIGN.md`** (đặc biệt `5` câu hỏi mở tại Mục 5) và cho ý kiến điều chỉnh nếu muốn đổi thông số nào trước khi lập trình.
2. Khi bạn phê duyệt phương án cuối, tôi sẽ triển khai **Milestone 5C — Giai đoạn 5C-2c** theo kế hoạch Mục 6.

**DỪNG — CHỜ DUYỆT MILESTONE 5C-2b.**
