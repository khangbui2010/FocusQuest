# ĐẶC TẢ THIẾT KẾ & MÔ PHỎNG CÂN BẰNG BRONZE AGE (MILESTONE 5C — GIAI ĐOẠN 5C-2b)

> **Trạng thái tài liệu:** **BẢN ĐỀ XUẤT (PROPOSAL) — CHỜ DUYỆT TRƯỚC KHI TRIỂN KHAI 5C-2c.**  
> **Ràng buộc phạm vi 5C-2b:** Chỉ đặc tả thiết kế & kiểm chứng bằng script mô phỏng (`scripts/simulateBronzeAge.ts`). Chưa chỉnh sửa bất kỳ mã nguồn sản phẩm nào trong `src/`, `public/`, hay `__tests__/`.  
> **Asset đã sẵn sàng từ Milestone 5G:** `src/ui/components/civilization/bronzeSpriteData.ts` (`10` công trình Bronze), `bronzeConstructionSpriteData.ts` (`40` sprite giai đoạn thi công), `public/assets/sprites/villagers/{smith,merchant,mason}.png` (`64×64`), và `public/assets/sprites/era/tool_skins_16.png` (hàng `1` = Bronze Age).

---

## MỤC 1. ĐẶC TẢ 10 CÔNG TRÌNH BRONZE AGE

### 1.1. Bảng Tổng Hợp Thông Số 10 Công Trình

Toàn bộ `id` và `footprint` dưới đây khớp 100% với `BRONZE_AGE_SPRITE_DATA` trong `src/ui/components/civilization/bronzeSpriteData.ts`:

| # | `definitionId` | Tên EN / VI | Footprint | Nhóm (`Category`) | Giới hạn đặt | `baseCost` | Hệ số nâng (`mult`) | `maxLevel` | `minPlayerLevel` | `minTotalFocusMinutes` | Thời gian xây đặt (`placeJob`) | Hiệu ứng theo cấp |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| 1 | `bronze_apiary` | **Apiary** / **Trại Ong** | `2×2` (`4`) | `DECORATIVE` | `2` | `70` | `1.00` *(không nâng)* | `1` | `9` | `540` | `1` thợ · `3,600s` (`1.0h`) | Trang trí, `0` CoinBonus, `0` XP |
| 2 | `bronze_watchtower` | **Watchtower** / **Tháp Canh** | `2×3` (`6`) | `DECORATIVE` | `2` | `110` | `1.00` *(không nâng)* | `1` | `12` | `900` | `2` thợ · `5,400s` (`1.5h`) | Trang trí, `0` CoinBonus, `0` XP |
| 3 | `bronze_longhouse` | **Bronze Longhouse** / **Nhà Dài Đồng** | `4×2` (`8`) | `FOCUS_SUPPORT` | `1` | `120` | `1.55` | `5` | `10` | `600` | `2` thợ · `7,200s` (`2.0h`) | `FOCUS_FEATURE_UNLOCK`: `+2` suất dân làng Bronze / cấp (tối đa `10` dân Bronze ở Lv.5) |
| 4 | `bronze_scribe_hall` | **Scribe Hall** / **Nhà Ghi chép** | `2×3` (`6`) | `FOCUS_SUPPORT` | `1` | `180` | `1.00` *(không nâng)* | `1` | `13` | `1,000` | `2` thợ · `7,200s` (`2.0h`) | `FOCUS_STAT_UNLOCK`: mở chỉ số năng suất theo giờ & Era (`focus_metric_era_productivity`) |
| 5 | `bronze_town_hall` | **Town Hall** / **Tòa Thị chính** | `4×3` (`12`) | `FOCUS_SUPPORT` | `1` | `420` | `1.00` *(không nâng)* | `1` | `18` | `1,800` | `4` thợ · `14,400s` (`4.0h`) | `FOCUS_FEATURE_UNLOCK`: mở preset/kỷ luật Hội đồng Bronze (`focus_preset_bronze_council`) |
| 6 | `bronze_market_stall` | **Market Stall** / **Quầy Chợ Đồng** | `2×2` (`4`) | `ECONOMY_EFFECT` | `2` | `80` | `1.28` | `10` | `9` | `600` | `1` thợ · `3,600s` (`1.0h`) | `COIN_BONUS`: `+0.5%/cấp` (`+5.0%` tại Lv.10; `2` cái = `+10.0%`) |
| 7 | `bronze_irrigated_field` | **Irrigated Field** / **Ruộng Tưới tiêu** | `3×3` (`9`) | `ECONOMY_EFFECT` | `2` | `100` | `1.28` | `10` | `11` | `800` | `2` thợ · `7,200s` (`2.0h`) | `COIN_BONUS`: `+0.5%/cấp` (`+5.0%` tại Lv.10; `2` cái = `+10.0%`) |
| 8 | `bronze_grain_silo` | **Bronze Grain Silo** / **Kho Ngũ cốc Đồng** | `2×3` (`6`) | `ECONOMY_EFFECT` | `2` | `120` | `1.28` | `10` | `13` | `1,000` | `2` thợ · `7,200s` (`2.0h`) | `COIN_BONUS`: `+0.5%/cấp` (`+5.0%` tại Lv.10; `2` cái = `+10.0%`) |
| 9 | `bronze_craft_workshop` | **Craft Workshop** / **Xưởng Thủ công** | `3×2` (`6`) | `ECONOMY_EFFECT` | `2` | `150` | `1.30` | `10` | `15` | `1,300` | `3` thợ · `9,000s` (`2.5h`) | `COIN_BONUS`: `+1.0%/cấp` (`+10.0%` tại Lv.10; `2` cái = `+20.0%`) |
| 10 | `bronze_forge` | **Bronze Forge** / **Lò đúc Đồng** | `3×2` (`6`) | `ECONOMY_EFFECT` | `2` | `190` | `1.30` | `10` | `18` | `1,600` | `3` thợ · `10,800s` (`3.0h`) | `COIN_BONUS`: `+1.0%/cấp` (`+10.0%` tại Lv.10; `2` cái = `+20.0%`) |

> **Quy mô tổng thể Bronze Age:** `16` công trình đặt mới tối đa (`108` ô bản đồ; cộng `73` ô tối đa từ `17` công trình Stone Age = `181` ô xây dựng, cần mở rộng bản đồ lên khoảng `13–15` chunks = `208–240` ô tính cả khoảng trống chèn footprint `4×3`/`4×2`). Tổng chi phí gộp tối đa (`maxGross`) là **`54,836 Coins`**; sau giảm giá Smith/Elder thực tế (`maxNet`) khoảng **`38,743 Coins`**.

---

### 1.2. Chi Tiết Điều Kiện Mở Khóa, Nâng Cấp & Vai Trò Thiết Kế Từng Công Trình

- **Công thức nâng cấp (tái sử dụng `src/core/civilization/` hiện có):**
  - Chi phí nâng cấp `L -> L+1` (`1 <= L < maxLevel`): `calculateUpgradeCost(def, L) = Math.round(baseCost * Math.pow(upgradeCostMultiplier, L))`.
  - Cổng cấp người chơi khi nâng cấp (`getBuildingUpgradeRequiredPlayerLevel`): `def.unlockRequirements.minPlayerLevel + currentLevel * 1`. Ví dụ `bronze_forge` (`minPlayerLevel = 18`) nâng lên Lv.10 cần Player Level `18 + 9 = 27` (hoàn toàn khả thi khi người chơi `2h/ngày` đạt `Lv.36` ở cuối Bronze Age).
  - Thời gian & nhân lực nâng cấp (`getUpgradeJobSpec(L)`): `crew = (L <= 2 ? 1 : 2)`, `durationSeconds = 5 * L * 60` (`300s` ở Lv.1→2 tăng dần tới `2,700s` ở Lv.9→10; tổng `Lv.1→10` là `13,500s` = `3.75h` công thợ mỗi công trình trước giảm thời gian của Thợ đá `Mason`).
- **Chi tiết từng công trình:**
  1. **`bronze_apiary` (Apiary / Trại Ong — `2×2`, `DECORATIVE`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.9`, `540m` Focus. Không có điều kiện dân làng hay tiền đề.
     - *Vai trò thiết kế:* Món trang trí đầu Bronze Age giá rẻ (`70C`, xây `1h`) giúp người chơi vừa lên Era có ngay công trình Bronze đầu tiên đặt quanh ruộng/nhà dân, tạo cảm giác thay đổi thị giác tức thì. Không thể nâng cấp (`maxLevel = 1`).
  2. **`bronze_watchtower` (Watchtower / Tháp Canh — `2×3`, `DECORATIVE`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.12`, `900m` Focus, **tối thiểu `11` dân làng tổng** (`requiredVillagers = 11`).
     - *Vai trò thiết kế:* Điểm nhấn kiến trúc biên giới khu định cư (`110C`), khuyến khích người chơi lấp đầy dân số trước khi mở rộng ra nhiều chunk mới. Không thể nâng cấp (`maxLevel = 1`).
  3. **`bronze_longhouse` (Bronze Longhouse / Nhà Dài Đồng — `4×2`, `FOCUS_SUPPORT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.10`, `600m` Focus, **đã hoàn thành `stone_age_study_cave`** (`prerequisiteBuildingIds: ['stone_age_study_cave']`).
     - *Vai trò thiết kế:* Trục xương sống tuyển dân Bronze Age (tương đương Hang trú ẩn ở Stone Age). Giới hạn `1` nhà, nâng từ `Lv.1..5`, mỗi cấp mở `+2` suất dân làng Bronze (`2 -> 4 -> 6 -> 8 -> 10` suất). Chi phí gộp 1 nhà lên Lv.5 là `1,734 Coins` (~`1,232 Coins` sau giảm giá Elder `-30%` / Smith `-15%`). **Lưu ý:** giống Hang trú ẩn, nhà đang xây lần đầu (`UNDER_CONSTRUCTION`) không cấp suất tuyển dân mới; trong thời gian nâng cấp vẫn giữ sức chứa cấp hiện tại.
  4. **`bronze_scribe_hall` (Scribe Hall / Nhà Ghi chép — `2×3`, `FOCUS_SUPPORT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.13`, `1,000m` Focus, **đã hoàn thành `stone_age_elder_hut`** (`prerequisiteBuildingIds: ['stone_age_elder_hut']`).
     - *Vai trò thiết kế:* Mở rộng giá trị từ `Elder's Hut` (đã mở `Focus Streak`), mở khóa thẻ thống kê mới (`FOCUS_STAT_UNLOCK`: `focus_metric_era_productivity` — hiệu suất theo khung giờ & tỷ trọng đóng góp giữa các kỷ nguyên trong `StatsView`). Xây xong 1 lần là hoàn thiện (`maxLevel = 1`, `180C`).
  5. **`bronze_town_hall` (Town Hall / Tòa Thị chính — `4×3`, `FOCUS_SUPPORT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.18`, `1,800m` Focus (`30h`), **tối thiểu `14` dân làng tổng**, **có đủ cả `3` vai trò Bronze** (`requiredRoles: ['smith', 'merchant', 'mason']`), và **đã hoàn thành `bronze_longhouse` + `bronze_scribe_hall`**.
     - *Vai trò thiết kế:* Công trình biểu tượng đỉnh giai đoạn Bronze (`420C`, `4` thợ, `4h` Focus xây). Mở `FOCUS_FEATURE_UNLOCK`: `focus_preset_bronze_council` (cho phép chọn các preset phiên sâu `75m / 90m / 120m` hoặc đánh dấu mốc hội đồng trong `TimerView`, **tuyệt đối không cộng Coin/XP thụ động**).
  6. **`bronze_market_stall` (Market Stall / Quầy Chợ Đồng — `2×2`, `ECONOMY_EFFECT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.9`, `600m` Focus, **đã hoàn thành `bronze_longhouse`**.
     - *Vai trò thiết kế:* Công trình kinh tế đầu tiên của Bronze Age (`80C`, `×1.28`, `1` thợ `1h`), `+0.5%` mỗi cấp (`+5.0%` ở Lv.10; `2` quầy = `+10.0%`). Tạo bước đệm kinh tế nhẹ nhàng khi người chơi vừa vào Bronze.
  7. **`bronze_irrigated_field` (Irrigated Field / Ruộng Tưới tiêu — `3×3`, `ECONOMY_EFFECT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.11`, `800m` Focus.
     - *Vai trò thiết kế:* Công trình kinh tế nông nghiệp chiếm diện tích lớn (`3×3`), buộc người chơi mở đất hợp lý; `+0.5%` mỗi cấp (`2` ruộng Lv.10 = `+10.0%`).
  8. **`bronze_grain_silo` (Bronze Grain Silo / Kho Ngũ cốc Đồng — `2×3`, `ECONOMY_EFFECT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.13`, `1,000m` Focus, **đã hoàn thành `bronze_irrigated_field`**.
     - *Vai trò thiết kế:* Chuỗi phụ thuộc rõ ràng (`Ruộng Tưới tiêu -> Kho Ngũ cốc Đồng`), `+0.5%` mỗi cấp (`2` kho Lv.10 = `+10.0%`).
  9. **`bronze_craft_workshop` (Craft Workshop / Xưởng Thủ công — `3×2`, `ECONOMY_EFFECT`):**
     - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.15`, `1,300m` Focus, **có tối thiểu `1 smith`**.
     - *Vai trò thiết kế:* Chuyển pha kinh tế giữa Bronze Age sang sản xuất công cụ; tỷ lệ `+1.0%` mỗi cấp (`2` xưởng Lv.10 = `+20.0%`), đòi hỏi `3` thợ và `2.5h` xây dựng.
  10. **`bronze_forge` (Bronze Forge / Lò đúc Đồng — `3×2`, `ECONOMY_EFFECT`):**
      - *Mở khóa:* `era >= BRONZE_AGE`, `Lv.18`, `1,600m` Focus, **tối thiểu `13` dân làng tổng** và **có tối thiểu `1 smith`**.
      - *Vai trò thiết kế:* Công trình kinh tế chủ lực cuối Bronze Age (`190C`, `×1.30`, `+1.0%/cấp`, `2` lò Lv.10 = `+20.0%`, tổng chi phí gộp `8,097C/cái`), đóng vai trò tiền đề tự nhiên để bước tiếp sang Iron Age sau này.

---

### 1.3. Quy Tắc Trần `CoinBonus` Toàn Cục & Chống Lạm Phát

- **Bất biến kinh tế bắt buộc:**
  1. `DECORATIVE` tuyệt đối không nâng cấp (`maxLevel = 1`, `effects = []`).
  2. `ECONOMY_EFFECT` bị khóa giới hạn từng loại (`buildLimit = 2` cho mỗi trong 5 loại = tối đa `10` công trình kinh tế Bronze).
  3. **Zero Passive Income:** mọi công trình và dân làng không bao giờ sinh Coins/XP theo thời gian thực.
  4. **`CoinBonus` chỉ nhân vào Coins của phiên Focus hoàn thành** (`RewardEngine`), **không bao giờ** nhân vào XP hay phần thưởng Daily/Weekly Quests.
  5. **Không nhân kép theo Era:** công trình đang xây lần đầu (`UNDER_CONSTRUCTION`) cho `0%`.
- **Cơ cấu trần `CoinBonus` đề xuất (Cộng dồn tuyến tính — Additive):**
  - **Trần Stone Age giữ nguyên:** **`+150%`** (`4× Foraging Post Lv.5 = +40%`, `4× Granary Lv.5 = +60%`, tối đa `8× Crafter = +40%`, `Complete Tribe = +10%`).
  - **Đóng góp Bronze Age tối đa:** **`+100%`** gồm:
    - `5` loại công trình kinh tế Bronze (`2×` mỗi loại lên `Lv.10`): `10% + 10% + 10% + 20% + 20% = +70%`.
    - `4× Merchant` (`+5%/người`, trần `+20%`) + `Bronze Guild Synergy` (`>= 1` mỗi vai trò Bronze = `+10%`) = `+30%`.
  - **Trần toàn cục Bronze Age (`PROPOSED_BRONZE_GLOBAL_COIN_BONUS_CAP`):** **`+250%`** (`+150%` Stone + `+100%` Bronze).
  - **Lý do cân bằng:** Hệ số Coin tổng chỉ đi từ trần **`×2.50`** (Stone max) lên trần **`×3.50`** (Bronze max) — tức **tăng tối đa `+40.0%` sản lượng Coin/giờ** (và trong thực tế nếu người chơi giữ `5 Elder` lấy `-30%` giảm giá nâng cấp thay vì `8 Crafter`, mức thực dụng đạt `+235%` tức `×3.35`, tăng `+34.0%`). Nhờ biên độ tăng vừa phải này:
    - Không xảy ra lạm phát lũy tiến;
    - `Daily Quests` (`40C/ngày`) & `Weekly Quests` (`150C/tuần`) vẫn chiếm khoảng `15–28%` tổng thu nhập tuần ở người chơi `1–2h/ngày`, giữ nguyên động lực làm Quest;
    - Giá công trình Bronze có thể neo sạch ở mức `70–190C` base / hệ số `1.28–1.30` mà không phải thổi phồng số lên hàng trăm nghìn Coins.

---

## MỤC 2. ĐẶC TẢ 3 VAI TRÒ DÂN LÀNG BRONZE AGE

### 2.1. Nhà Ở, Sức Chứa, Chi Phí Tuyển & Trần Dân Số

| Thuộc tính | Stone Age (giữ nguyên) | Bronze Age (đề xuất) |
|---|---|---|
| Công trình nhà ở | `stone_age_study_cave` (`3×3`, `max 1`, `Lv.1..5`) | `bronze_longhouse` (`4×2`, `max 1`, `Lv.1..5`) |
| Suất tuyển mới | `2` suất / cấp (`2..10` dân Stone trả phí) | `2` suất / cấp (`2..10` dân Bronze trả phí) |
| Dân đặc biệt | `Founder Villager` (`0` Coin, `0` suất Hang) | Không tạo thêm Founder thứ hai |
| Trần dân theo Era | Tối đa `10` dân tuyển + `1` Founder = **`11`** | Tối đa `10` dân Stone + `1` Founder + `10` dân Bronze = **`21`** |
| Công thức giá tuyển | `round(25 × 1.35^n)` (`n = 0..9`, tổng `2,850C`) | `round(120 × 1.28^n)` (`n = 0..9`, tổng **`4,633C`**) |
| Bảng giá từng người | `[25, 34, 46, 62, 83, 112, 152, 205, 277, 373]` *(trên thực tế 10 người = `1,369C` tại `1.35^n`? Không: tính lại — `25..373` tổng `1,369C`)* | **`[120, 154, 197, 252, 322, 412, 528, 676, 865, 1,107]`** (tổng **`4,633C`**) |
| Spritesheet (`5G`) | `{elder,crafter,woodworker}.png` | `{smith,merchant,mason}.png` |

*(Ghi chú: ở Stone Age, tổng giá 10 dân `round(25 × 1.35^n)` cho `n=0..9` đúng bằng `1,369 Coins`).*

### 2.2. Vai Trò, Buff, Trần Buff & Tương Tác Với Dân Stone Age

1. **`merchant` (Thương nhân / Merchant):**
   - **Buff:** `+5%` (`+0.05`) `CoinBonus` cộng dồn mỗi người — chỉ áp dụng cho Focus Coins của phiên hoàn thành, không tác động XP hay Quests.
   - **Trần vai trò:** **`+20%`** (tại `4` Merchant; tuyển thêm Merchant thứ `5+` chỉ tăng thêm `1` nhân công xây dựng, không tăng thêm CoinBonus).
   - **Synergy `Bronze Guild`:** Khi có ít nhất `1 smith`, `1 merchant`, `1 mason` → cộng thêm cố định **`+10%`** (`+0.10`) `CoinBonus` (tương tự `Complete Tribe +10%` của Stone Age, hai synergy độc lập nhau).
   - **Giới hạn cứng:** Dù sở hữu đồng thời `8 Crafter` (`+40%`) + `Complete Tribe` (`+10%`) + `4 Merchant` (`+20%`) + `Bronze Guild` (`+10%`) + toàn bộ công trình Stone (`+100%`) + Bronze (`+70%`), tổng cuối vẫn bị kẹp cứng ở trần **`+250%`** (`PROPOSED_BRONZE_GLOBAL_COIN_BONUS_CAP`).

2. **`smith` (Thợ rèn / Smith):**
   - **Buff:** `-5%` (`-0.05`) chi phí Coin **đặt công trình mới (`PLACE_BUILDING` `baseCost`)** mỗi người.
   - **Trần vai trò:** **`-20%`** (tại `4` Smith; công thức `applyCostDiscount(baseCost, smithDiscountRate)` giữ sàn `>= 1 Coin`).
   - **Quan hệ bất biến với `Elder`:**
     - `Elder` chỉ giảm giá **`UPGRADE_BUILDING`** (`-6%/người`, trần `-30%`).
     - `Smith` chỉ giảm giá **`PLACE_BUILDING`** (`-5%/người`, trần `-20%`).
     - `Woodworker` chỉ giảm giá **`EXPAND_LAND`** (`-5%/người`, trần `-40%`).
     - **Tuyệt đối không cộng dồn 2 nguồn giảm giá trên cùng một giao dịch.** Phá hủy công trình (`DEMOLISH`) hoàn trả theo `paidCoins` thực tế đã lưu hoặc theo công thức an toàn (không bao giờ hoàn lời quá số tiền đã trả).

3. **`mason` (Thợ đá / Mason):**
   - **Buff:** `-5%` (`-0.05`) **thời gian Focus xây dựng** (`durationSeconds`) cho các công việc **`place` và `upgrade`** (khi xếp job mới) mỗi người.
   - **Trần vai trò:** **`-20%`** (tại `4` Mason; sàn tối thiểu **`>= 60` giây** cho mọi job có `baseSeconds > 0`, giữ nguyên `0s` cho job `0s` như Campfire).
   - **Quan hệ với các hệ thống khác:**
     - Không giảm giá Coins (không chồng lên Elder/Smith).
     - Không sinh Coins/XP thụ động và không thay đổi số giây Focus thật mà người chơi tích lũy vào Stats/Quests — chỉ giúp cùng lượng Focus thực tế hoàn tất job xây dựng nhanh hơn tối đa `20%`.
     - Toàn bộ `21` dân làng (gồm cả `Founder`, `Stone`, và `Bronze`) đều tham gia hàng đợi `assignJobsFifo` làm thợ xây dựng (`crew`).

---

## MỤC 3. TÁC ĐỘNG LIÊN HỆ THỐNG KHI CHUYỂN ERA

1. **Bảo toàn 100% tài sản Stone Age:**
   - Khi trả phí nâng cấp Era (`500 Coins`) và đạt đủ điều kiện `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`, toàn bộ `<= 17` công trình Stone Age, lưới `GridMap` đã mở, `<= 10` dân Stone + `Founder Villager`, ví Coins, XP/Level và chuỗi Streak/Quests đều giữ nguyên vẹn, không xóa và không reset bản đồ.
2. **Làm rõ `entryFloor = 5` và `upgradeCap = 10` (`src/core/civilization/eraRules.ts`):**
   - Hiện `ERA_LEVEL_RULES.BRONZE_AGE` đã định nghĩa `{ upgradeCap: 10, entryFloor: 5, provisional: false }`.
   - **`upgradeCap = 10`:** Cho phép các công trình Bronze `ECONOMY_EFFECT` đạt tới `Lv.10`, trong khi `STONE_AGE_BUILDING_DEFINITIONS` giữ nguyên `definition.maxLevel = 5` (hoặc `3` với Decorative). Vì `getEffectiveMaxLevel(def, 'BRONZE_AGE') = min(def.maxLevel, 10)`, **các công trình Stone Age vẫn dừng ở trần `Lv.5` / `Lv.3`**, ngăn việc nâng `Foraging Post` / `Granary` lên Lv.10 phá trần `+150%` Stone.
   - **`entryFloor = 5` (`getEntryLevel`):** Khi bước vào Bronze Age, `Hang trú ẩn`, `4 Foraging Post`, `4 Granary` vốn đã bắt buộc đạt `Lv.5` để qua cổng `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`. Riêng `Elder's Hut` (`minLevel: 1` ở cổng lên Era, `maxLevel: 5`) và các `Campfire`/`Standing Stone` (`maxLevel: 3`) có thể đang ở `Lv.1–4`. *Chi tiết xử lý nâng thẳng lên floor hay giữ cấp thực tế được đưa vào Câu hỏi mở Mục 5.1 để chốt trước 5C-2c.*
3. **Skin công cụ theo Era (`tool_skins_16.png` hàng `1`):**
   - Trong `5G`, `getEraToolSkinRow('BRONZE_AGE') = 1` và `FocusSceneArea` + `Awards` (`builder`, `master_builder`, `land_clearer`) đã nhận prop `era`. Khi `civilization.era` chuyển sang `'BRONZE_AGE'` ở `5C-2c`, toàn bộ dân làng trong cảnh Focus và 3 huy hiệu xây dựng tự động chuyển sang bộ công cụ đồng hàng `1` không cần thêm asset mới.
4. **Hiển thị Catalog xây dựng & Tuyển dân trong Popup `400px`:**
   - `BuildingCatalogPanel` thêm bộ lọc/nhóm tab ngắn **`Stone` | `Bronze`** (mặc định mở tab `Bronze` khi người chơi đang ở Bronze Age) để không tạo danh sách `16` thẻ quá dài trong popup `400×600px`.
   - Khi nhấn `bronze_longhouse` mở `BuildingDetailsModal`, hiển thị khối **Tuyển dân làng Bronze (`Smith | Merchant | Mason`)** tương đồng UX của `stone_age_study_cave`, kèm chỉ báo sức chứa riêng (`0/2 .. 10/10`) và cảnh báo trần buff vai trò (`4/4` = đạt trần).
   - `CivilizationHeader` kích hoạt nút **Tiến hóa Era** (khi ở `STONE_AGE`, hiển thị checklist `evaluateEraAdvance` và nút xác nhận tốn `500 Coins` khi đủ điều kiện).
5. **Đề xuất nối tiếp cho `Quests` & `Awards` (chỉ liệt kê cho giai đoạn sau, KHÔNG sửa trong `5C-2b`/`5C-2c`):**
   - **Quests:** Có thể bổ sung 1–2 Daily/Weekly Quest tùy chọn hoặc giữ nguyên pool `40C/day · 150C/week` hiện tại (mô phỏng bên dưới chứng minh pool Quest hiện tại đã cân bằng hoàn hảo cho cả Bronze Age).
   - **Awards (TUYỆT ĐỐI `0` Coins, `0` XP, `0` buff thụ động):** Bổ sung nhóm thành tựu kỷ nguyên mới thuần danh hiệu như `Bronze Pioneer` (lên Bronze Age), `Longhouse Architect` (nâng Longhouse Lv.5), `Bronze Guild` (đủ Smith + Merchant + Mason), `Council Hall` (xây xong Town Hall), `Bronze Master` (hoàn tất toàn bộ 10 loại công trình Bronze).

---

## MỤC 4. MÔ PHỎNG CÂN BẰNG (CHẠY THẬT BẰNG `npx tsx scripts/simulateBronzeAge.ts`)

### 4.1. Phương Pháp & Các Giả Định Minh Bạch

Script `scripts/simulateBronzeAge.ts` nhập trực tiếp các hàm thuần từ `src/core/` (`RewardEngine`, `MultiplierRules`, `aggregateCoinBonus`, `calculatePlayerLevel`, `STONE_AGE_BUILDING_DEFINITIONS`, `calculateUpgradeCost`, `getBuildingUpgradeRequiredPlayerLevel`, `evaluateEraAdvance`, `GridMap`, `assignJobsFifo`, `advanceJobs`, `getUpgradeJobSpec`, `getExpansionCost`, `getExpansionRequiredLevel`, `evaluateRecruitment`, `applyCostDiscount`, `applyCompletedSession`, `claimQuest`):

1. **Hồ sơ tập trung mỗi ngày:** `1h/d [60m]`, `1.5h/d [45m×2]`, `2h/d [60m×2]` & `[120m]`, `3h/d [45m×4]`, `[60m×3]` & `[180m]`.
2. **Founder Villager:** mặc định chọn `'crafter'` (`+5%` CoinBonus miễn phí từ Ngày 1).
3. **Chiến lược chi tiêu tham chiếu (Optimal ROI Greedy):**
   - *Giai đoạn Stone Age:* ưu tiên tối đa hóa ROI CoinBonus (`Foraging Post`, `Granary`, `Crafter`, `Elder`, `Woodworker`, `Complete Tribe`), mở đủ `3` chunk, nâng `Cave` Lv.5 và đặt đủ `Campfire` + `Standing Stone` + `Elder's Hut`, giữ đủ `500 Coins` lên Bronze Age ngay khi thỏa `evaluateEraAdvance`.
   - *Giai đoạn Bronze Age:* mở rộng tối đa dân Stone lên `11` người (ưu tiên `5 Elders` để lấy **`-30%`** giảm giá nâng cấp, `1 Woodworker`, `5 Crafters` → tổng CoinBonus thực dụng đạt **`+235%`**), xây `bronze_longhouse` lên Lv.5, tuyển **`4 Merchants` + `3 Smiths` + `3 Masons`** (`10` dân Bronze = **`+30%`** CoinBonus, `-15%` giá đặt mới, `-15%` thời gian xây), mở rộng đất tự động mỗi khi thiếu chỗ cho footprint lớn (`4×2`, `4×3`, `3×3`), và nâng toàn bộ `5×2 = 10` công trình kinh tế Bronze lên `Lv.10`.
4. **Độ nhạy giả định:** Chạy 3 bộ đối chiếu:
   - *Kịch bản chuẩn:* tỷ lệ hoàn thành phiên **`100%`** + nhận đều **`Daily/Weekly Quests`** (`40C/ngày`, `150C/tuần`).
   - *Độ nhạy thực tế:* tỷ lệ hoàn thành phiên **`90%`** (cứ `10` phiên có `1` phiên bỏ dở giữa chừng — `0` Coins/XP/Job/Quest, chỉ cộng `50%` phút vào `totalFocusMinutes`).
   - *Độ nhạy chỉ Focus (`noQ`):* **`100%`** hoàn thành phiên nhưng **không claim Quests** để tách riêng vai trò của Quest.

---

### 4.2. Bảng (a) & (b): Tiến Độ Từ Stone → Bronze Và Hoàn Tất Bronze Age

**Kịch bản chuẩn (`100%` hoàn thành phiên + Quests):**

| Hồ sơ Focus / ngày | (a) Stone → Bronze | Entry State | (b1) Đạt sàn Bronze *(sau lên Era)* | (b2) Max 100% Bronze *(sau lên Era)* | Tổng ngày từ Ngày 1 | Cấp độ & CoinBonus cuối | Mở đất (`chunks` thêm) |
|---|---:|---|---:|---:|---:|---|---:|
| `1h/ngày [60m]` | **`18` ngày** | `Lv.14, +120%` | `+80` ngày | **`+108` ngày** | `126` ngày | `Lv.37, +235%` | `+11` |
| `1.5h/ngày [45m×2]` | **`14` ngày** | `Lv.14, +120%` | `+68` ngày | **`+87` ngày** | `101` ngày | `Lv.37, +235%` | `+10` |
| **`2h/ngày [60m×2]` *(chuẩn)*** | **`10` ngày** | `Lv.14, +120%` | **`+41` ngày** | **`+57` ngày** | `67` ngày | `Lv.36, +235%` | `+12` |
| **`2h/ngày [120m]` *(gộp phiên)*** | **`9` ngày** | `Lv.15, +120%` | **`+34` ngày** | **`+46` ngày** | `55` ngày | `Lv.36, +235%` | `+10` |
| `3h/ngày [45m×4]` | **`8` ngày** | `Lv.14, +120%` | `+36` ngày | **`+45` ngày** | `53` ngày | `Lv.36, +235%` | `+10` |
| `3h/ngày [60m×3]` | **`7` ngày** | `Lv.14, +120%` | `+28` ngày | **`+38` ngày** | `45` ngày | `Lv.36, +235%` | `+10` |
| `3h/ngày [180m]` | **`6` ngày** | `Lv.17, +120%` | `+17` ngày | **`+23` ngày** | `29` ngày | `Lv.37, +235%` | `+10` |

> **Kiểm tra mục tiêu:**
> - Bảng (a) tái lập chính xác tuyệt đối mốc `PRODUCT_SPEC.md`: **`6–8` ngày (`3h/ngày`) · `9–10` ngày (`2h/ngày`) · `14` ngày (`1.5h/ngày`) · `18` ngày (`1h/ngày`)**.
> - Bảng (b2) cho nhóm chuẩn **`2h/ngày`**: **`+46` đến `+57` ngày** sau khi lên Bronze Age — nằm chính giữa khung mục tiêu **`~45–60` ngày**.
> - Ghi chú thuật ngữ `(b1) Đạt sàn Bronze`: có tối thiểu `1×` mỗi công trình trang trí & hỗ trợ, `bronze_longhouse` đạt `Lv.5`, `2×` mỗi công trình kinh tế đạt `>= Lv.8`, và có ít nhất `1` người mỗi vai trò `smith`/`merchant`/`mason`.

**Độ nhạy thực tế (`90%` hoàn thành phiên + Quests) và Focus thuần (`100%`, không Quest):**

| Hồ sơ | S→B (`@90%`) | Floor (`@90%`) | Max sau Era (`@90%`) | S→B *(no Quest)* | Floor *(no Quest)* | Max sau Era *(no Quest)* |
|---|---:|---:|---:|---:|---:|---:|
| `1h/d [60]` | `20d` | `+90d` | `+119d` (`139d`) | — | — | — |
| `1.5h/d [45,45]` | `15d` | `+76d` | `+96d` (`111d`) | `16d` | `+74d` | `+95d` (`111d`) |
| `2h/d [60,60]` | `10d` | `+47d` | **`+63d`** (`73d`) | `11d` | `+44d` | **`+61d`** (`72d`) |
| `2h/d [120]` | `10d` | `+38d` | **`+51d`** (`61d`) | — | — | — |
| `3h/d [45,45,45,45]` | `9d` | `+37d` | `+50d` (`59d`) | — | — | — |
| `3h/d [60,60,60]` | `8d` | `+31d` | `+42d` (`50d`) | `7d` | `+30d` | `+41d` (`48d`) |
| `3h/d [180]` | `6d` | `+19d` | `+26d` (`32d`) | — | — | — |

---

### 4.3. Bảng (c): Tốc Độ Kiếm Coin / Giờ Focus Trước Và Sau Bronze (Kiểm Chứng Chống Lạm Phát)

Kết quả trích trực tiếp từ `RewardEngine.calculateReward(...)` với cấu hình thật của repo (`Countdown 1.5C/m`, `Stopwatch 1.0C/m`, `MultiplierRules` từ `×1.0` đến `×2.5`):

| Chế độ Focus (Hệ số thời lượng) | Stone Base (`+0%`) | Stone Entry (`+120%`) | Stone Max (`+150%`) | Bronze Optimal (`+235%`)* | Bronze Cap (`+250%`)** | Tăng vs Stone Max *(Optimal / Cap)* |
|---|---:|---:|---:|---:|---:|---:|
| `Stopwatch 25m` (`×1.0`) | `60.0` | `132.0` | `150.0` | `201.0` | `210.0` | **`+34.0%` / `+40.0%`** |
| `Stopwatch 60m` (`×1.4`) | `84.0` | `184.8` | `210.0` | `281.4` | `294.0` | **`+34.0%` / `+40.0%`** |
| `Countdown 25m` (`×1.0`) | `90.0` | `198.0` | `225.0` | `301.5` | `315.0` | **`+34.0%` / `+40.0%`** |
| `Countdown 45m` (`×1.2`) | `108.0` | `237.6` | `270.0` | `361.8` | `378.0` | **`+34.0%` / `+40.0%`** |
| `Countdown 60m` (`×1.4`) | `126.0` | `277.2` | `315.0` | `422.1` | `441.0` | **`+34.0%` / `+40.0%`** |
| `Countdown 120m` (`×1.8`) | `162.0` | `356.4` | `405.0` | `542.7` | `567.0` | **`+34.0%` / `+40.0%`** |
| `Countdown 180m` (`×2.5`) | `225.0` | `495.0` | `562.5` | `753.8` | `787.5` | **`+34.0%` / `+40.0%`** |

*\*Bronze Optimal (`+235%`): giữ `5 Elders + 5 Crafters + 1 Woodworker` (`+135%` Stone) để hưởng giảm `-30%` giá nâng cấp, cộng `+100%` Bronze.*  
*\*\*Bronze Cap (`+250%`): đội hình `8 Crafters + 1 Elder + 1 Woodworker` (`+150%` Stone) + `+100%` Bronze (`×3.50 / ×2.50 = +40.0%`).*  
*Không có bất kỳ sự bùng nổ Coin hay mất cân bằng nào giữa các chế độ; phần thưởng XP giữ nguyên `100%` không bị ảnh hưởng bởi `CoinBonus`.*

---

### 4.4. Bảng (d): Tổng Giây Focus Xây Dựng & Số Ngày Thực Tế Theo Số Thợ

Tính trên toàn bộ khối lượng công việc tiêu chuẩn của Bronze Age: **`16` công trình đặt mới + `94` lượt nâng cấp** (`4` cấp cho Longhouse + `9×10 = 90` cấp cho `10` công trình kinh tế) **+ `7` lần mở đất** (`3600s/lần`), mô phỏng qua `assignJobsFifo` và `advanceJobs` (tôn trọng trần hệ thống **`MAX_ACTIVE_CONSTRUCTION_JOBS = 4`**):

| Mức giảm tốc `Mason` | Tổng công việc (`JobSeconds`) | Số thợ (`crew`) | Giờ Focus thực (`WallFocus`) | Song song hiệu dụng | `1h/ngày` | `1.5h/ngày` | `2h/ngày` | `3h/ngày` |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `Mason = 0` (`0%`) | `285,600s` (`79.33h`) | `4` thợ *(tối thiểu)* | `164,700s` (`45.75h`) | `1.73×` | `45.8d` | `30.5d` | `22.9d` | `15.3d` |
| `Mason = 0` (`0%`) | `285,600s` (`79.33h`) | `6` thợ | `110,100s` (`30.58h`) | `2.59×` | `30.6d` | `20.4d` | `15.3d` | `10.2d` |
| `Mason = 0` (`0%`) | `285,600s` (`79.33h`) | `8` thợ | `83,100s` (`23.08h`) | `3.44×` | `23.1d` | `15.4d` | `11.5d` | `7.7d` |
| `Mason = 0` (`0%`) | `285,600s` (`79.33h`) | `10..21` thợ *(bão hòa 4 slot)* | `72,300s` (`20.08h`) | `3.95×` | `20.1d` | `13.4d` | `10.0d` | `6.7d` |
| **`Mason = 3` (`-15%`)** | **`246,540s` (`68.48h`)** | `4` thợ | `142,155s` (`39.49h`) | `1.73×` | `39.5d` | `26.3d` | `19.7d` | `13.2d` |
| **`Mason = 3` (`-15%`)** | **`246,540s` (`68.48h`)** | `8` thợ | `71,715s` (`19.92h`) | `3.44×` | `19.9d` | `13.3d` | `10.0d` | `6.6d` |
| **`Mason = 3` (`-15%`)** | **`246,540s` (`68.48h`)** | **`10..21` thợ** | **`62,535s` (`17.37h`)** | **`3.94×`** | **`17.4d`** | **`11.6d`** | **`8.7d`** | **`5.8d`** |
| `Mason = 4` (`-20%` cap) | `233,520s` (`64.87h`) | `10..21` thợ | `59,280s` (`16.47h`) | `3.94×` | `16.5d` | `11.0d` | `8.2d` | `5.5d` |

> **Nhận xét cân bằng tốc độ xây:** Dù song song tối đa đạt `~17.4h` Wall-Focus (`~8.7` ngày ở `2h/ngày`), tổng thời gian thực để hoàn tất Bronze Age vẫn là `46–57` ngày ở `2h/ngày` vì nút thắt chính nằm ở **nguồn Coins** và **cổng Player Level** — đúng triết lý thiết kế Focus Quest (không bị kẹt hàng đợi xây dựng vô tận, nhưng vẫn cần gom đủ Focus Coins và Level). Ở đầu Bronze nếu người chơi chỉ có `4–6` thợ, thời gian xây `30–46h` đóng vai trò động lực rõ rệt để nâng Longhouse và tuyển thêm dân lên `>= 10` thợ.

---

## MỤC 5. CÁC CÂU HỎI MỞ CẦN CHỐT TRƯỚC KHI LÀM 5C-2c

1. **Cách áp dụng `entryFloor = 5` của `ERA_LEVEL_RULES.BRONZE_AGE` lên công trình Stone Age mang sang (`stone_age_elder_hut`):**
   - *Bối cảnh:* `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS` yêu cầu `Cave/Foraging/Granary >= Lv.5`, nhưng `Elder's Hut` chỉ cần `>= Lv.1`. Hàm `getEntryLevel('BRONZE_AGE', carriedLevel)` hiện trả về `max(carriedLevel, 5)`.
   - *Lựa chọn:* (A) Chỉ lưu `entryFloor` làm mức tham chiếu Era / giữ nguyên cấp thực tế của `stone_age_elder_hut` để người chơi tự nâng nếu muốn; hoặc (B) Khi bấm Tiến hóa Era, tự nâng miễn phí `elder_hut` đang có lên `Lv.5` (với `Campfire`/`Standing Stone` kẹp trần `3` giữ nguyên `<= 3`).
   - **Mặc định khuyến nghị:** **Phương án (A)** — giữ nguyên cấp thực tế của công trình cũ (`elder_hut` vẫn có `maxLevel = 5` để nâng tiếp bằng Coins/Focus nếu người chơi muốn), không tặng cấp miễn phí khi bấm chuyển Era.

2. **Phạm vi giảm thời gian của `Mason` (`-5%/người`, trần `-20%`):**
   - *Lựa chọn:* (A) Chỉ áp dụng cho `place` và `upgrade`; hoặc (B) Áp dụng cho cả `place`, `upgrade`, và `expand`.
   - **Mặc định khuyến nghị:** **Phương án (A)** (`place + upgrade`, giữ `expand = 3,600s` cố định) để vai trò `Mason` chuyên về xây dựng công trình, rạch ròi với `Woodworker` chuyên về mở đất.

3. **Phạm vi giảm giá đặt mới của `Smith` (`-5%/người`, trần `-20%`):**
   - *Lựa chọn:* (A) Áp dụng cho mọi lệnh `PLACE_BUILDING` (cả Stone còn sót nếu người chơi đặt bổ sung trong Bronze Age lẫn toàn bộ Bronze); hoặc (B) Chỉ áp dụng cho công trình có `era === 'BRONZE_AGE'`.
   - **Mặc định khuyến nghị:** **Phương án (A)** — nhất quán với `Elder` (`UPGRADE_BUILDING` không phân biệt Era), đơn giản, dễ hiểu trên UI và đã có trần cứng `-20%`.

4. **Cách thực thi trần `CoinBonus` (`+150%` Stone vs `+250%` Bronze):**
   - *Lựa chọn:* (A) Dùng một hàm chuẩn hóa duy nhất `getEraCoinBonusCap(era)` (`1.50` cho Stone, `2.50` cho Bronze) ngay trong `aggregateCoinBonus` / `CivilizationCoordinator`; hoặc (B) Tách 2 trần phụ (`+150%` Stone + `+100%` Bronze) riêng rẽ.
   - **Mặc định khuyến nghị:** **Phương án (A)** — vì riêng định mức giới hạn xây + vai trò (`+150%` Stone và `+70% + 20% + 10% = +100%` Bronze) bản thân đã tách biệt 2 phần, một trần tổng theo Era (`2.50` ở Bronze) vừa đảm bảo bất biến kinh tế vừa tránh người chơi cảm giác bị "rơi mất bonus" nếu họ đổi cấu hình dân giữa Crafter và Merchant.

5. **Phạm vi mở khóa UI thực tế của `bronze_scribe_hall` (`focus_metric_era_productivity`) & `bronze_town_hall` (`focus_preset_bronze_council`) trong `5C-2c`:**
   - *Lựa chọn:* (A) Trong `5C-2c` nối đầy đủ logic hiệu lực `hasFocusStatUnlock` / `hasFocusFeatureUnlock` + hiển thị bảng/chip tinh gọn trong `StatsView` (thống kê theo khung giờ / Era) & `TimerView` (preset phiên sâu `90m`/`120m`); hoặc (B) Chỉ gắn cờ effect trong core & badge trạng thái đã mở ở `BuildingDetailsModal`, tách phần UI phân tích sâu sang `5C-2d`.
   - **Mặc định khuyến nghị:** **Phương án (A)** ở mức tinh gọn (thẻ KPI phụ ở `StatsView` + 2 preset chip `90m / 120m` mở khóa trong `TimerView`) để hai công trình `FOCUS_SUPPORT` có giá trị sử dụng thật ngay khi xây xong.

---

## MỤC 6. KẾ HOẠCH TRIỂN KHAI GIAI ĐOẠN 5C-2c (CHƯA BẮT ĐẦU)

### 6.1. Thứ Tự Các Bước Thực Hiện Đề Xuất

1. **Bước 1 — Types, Hằng số & Catalog Core (`src/core/civilization/` & `src/types/`):**
   - Mở rộng `BuildingUnlockRequirements` thêm các trường tùy chọn: `requiredVillagers?: number`, `requiredRoles?: readonly AnyVillagerRole[]`, `prerequisiteBuildingIds?: readonly string[]`.
   - Thêm các hằng số Bronze vào `constants.ts` (giới hạn đặt từng loại Bronze, giá tuyển `120 × 1.28^n`, buff/cap `Smith`, `Merchant`, `Mason`, `Bronze Guild`, trần `CoinBonus` theo Era).
   - Đăng ký `10` công trình Bronze vào `buildingCatalog.ts` (`BRONZE_AGE_BUILDING_DEFINITIONS` + `ALL_BUILDING_DEFINITIONS`), cập nhật `buildingUpgrade.ts` hỗ trợ limit từng loại Bronze.
2. **Bước 2 — Villager Bronze, Job Duration & Era Advance (`src/core/civilization/`):**
   - Mở rộng `villager.ts` & `villagerBuffs.ts` (hỗ trợ `BronzeVillagerRole`, sức chứa `bronze_longhouse`, hàm `evaluateBronzeRecruitment`, `getBronzeVillagerBuffSummary`, tính gộp `CoinBonus` kèm cap theo Era trong `civilizationBonusHelper.ts`).
   - Cập nhật `jobs.ts` (`CONSTRUCTION_PLACE_SPEC` cho 10 công trình Bronze, `applyMasonTimeDiscount`, tính `totalCrew` bao gồm cả Stone + Founder + Bronze).
   - Thêm hàm thực thi thuần `executeEraAdvance` / kiểm chứng điều kiện mở khóa mở rộng (villagers/roles/prerequisites) trong `eraRules.ts` & `buildingPlacement` validators.
3. **Bước 3 — Storage Schema Migration (`src/storage/`):**
   - Kiểm tra & nâng `CURRENT_SCHEMA_VERSION` (`7 → 8`) nếu lưu tách trường `bronzeVillagers` hoặc cập nhật validator `sanitizeCivilizationState` cho phép `villagers` mang cả vai trò Bronze (`smith | merchant | mason`) bảo toàn 100% save v7 cũ.
4. **Bước 4 — Background Coordinators & Messaging (`src/background/`, `src/types/messages.ts`, `src/i18n/errorCodes.ts`):**
   - Bổ sung message `ADVANCE_ERA` (và tùy chọn `RECRUIT_BRONZE_VILLAGER` hoặc mở rộng `RECRUIT_VILLAGER` kiểm tra đúng nhà ở `Cave` vs `Longhouse`), nối kiểm tra `Smith` discount vào `placeBuilding`, `Mason` discount vào `place/upgrade` job creation, cập nhật `cachedBonuses` + `SessionCoordinator`, và đồng bộ simulator `src/ui/services/extensionClient.ts`.
5. **Bước 5 — Giao diện Civilization, Scene & Catalog (`src/ui/` & `src/i18n/`):**
   - `BuildingCatalogPanel.tsx`: tab `Stone | Bronze`, badge điều kiện chưa đạt (Level, Focus minutes, dân làng, công trình tiền đề).
   - `MapGridView.tsx` & `CivilizationScreen.tsx`: render `BRONZE_AGE_SPRITE_DATA` & `BRONZE_CONSTRUCTION_SPRITE_STAGES` qua `spriteRegistry.ts`, nút/modal **Tiến hóa Bronze Age** (`evaluateEraAdvance`), tuyển dân Bronze tại `bronze_longhouse` trong `BuildingDetailsModal.tsx`, dùng spritesheet Bronze trong `FocusSceneArea.tsx` & `MapGridView.tsx`.
   - `StatsView.tsx` & `TimerView.tsx`: nối mở khóa `bronze_scribe_hall` & `bronze_town_hall` (theo Mục 5.5).
   - Bổ sung đầy đủ khóa EN/VI (`100%` parity) + `ErrorCodes` mới.
6. **Bước 6 — Kiểm định Toàn Diện:**
   - Chạy `npm run lint`, `npm run clean && npm run build`, `npm test` (tuyệt đối không để `jsxDEV` / God Mode rò vào `dist/`).

### 6.2. Các Tệp Dự Kiến Bị Tác Động

- **Core:** `src/core/civilization/{buildingTypes,buildingCatalog,buildingUpgrade,constants,eraRules,jobs,villager,villagerBuffs,civilizationBonusHelper,civilizationState}.ts`, `src/core/economy/coinBonus.ts`.
- **Storage & Types:** `src/types/{civilization,messages,errors}.ts`, `src/storage/{storageManager,migrations/v8_*}.ts`.
- **Background & Simulator:** `src/background/{civilizationCoordinator,messageHandler,sessionCoordinator}.ts`, `src/ui/services/extensionClient.ts`.
- **UI & i18n:** `src/ui/components/civilization/{BuildingCatalogPanel,BuildingDetailsModal,CivilizationHeader,CivilizationScreen,MapGridView,EraAdvanceModal}.tsx`, `src/ui/components/{FocusSceneArea,StatsView,TimerView}.tsx`, `src/i18n/{errorCodes,errorTranslator,locales/en,locales/vi}.ts`.

### 6.3. Rủi Ro Chính & Cách Giảm Thiểu

| Rủi ro | Ảnh hưởng | Biện pháp giảm thiểu |
|---|---|---|
| Công trình `4×3` / `4×2` khó tìm chỗ trống hoặc sai tọa độ âm trên `GridMap` | Không đặt được `Longhouse` / `Town Hall` dù đủ ô tổng | Đảm bảo `MapGridView` & `GridMap` giữ đúng bounding box âm; thêm test đặt footprint `4×3` qua ranh giới chunk âm/dương |
| Lỗi tính gộp `Elder` + `Smith` hoặc tràn trần `CoinBonus` `+250%` | Lạm phát Coins hoặc giá `0` Coin | Unit test ép biên `Smith 4 + Elder 5 + Crafter 8 + Merchant 4 + max buildings` luôn bị kẹp ở `-20% / -30% / +250%` |
| Save v7 hiện tại của người chơi bị reset mất bản đồ/dân khi nâng schema | Mất tiến độ Stone Age | Migration/sanitizer đọc phòng thủ mọi save v7; test migration giữ nguyên `buildings`, `villagers`, `founderRole`, `jobs`, `coins` |
| Tràn chiều rộng popup `400px` hoặc thiếu khóa i18n VI | Gãy UI / fail `i18nStaticGuard` | Tab hóa `Stone | Bronze` trong Catalog; test SSR & static i18n parity 100% |

### 6.4. Bộ Kiểm Thử Bắt Buộc Cho 5C-2c

1. **Core tests (`__tests__/core/`):** mở khóa đủ `10` công trình Bronze (prerequisites, roles, villager count), tính giá `Smith`/`Elder` tách bạch, `Mason` giảm giây giữ sàn `60s`, trần `+250%` toàn cục, `executeEraAdvance` nguyên tử và bất biến giữ Stone Age ở `maxLevel <= 5`.
2. **Storage & Background tests (`__tests__/storage/`, `__tests__/background/`):** migration từ save v7 có dữ liệu thật, `ADVANCE_ERA` dưới `StorageMutex` + rollback khi storage lỗi, `RECRUIT_VILLAGER` cho `smith`/`merchant`/`mason` với sức chứa `bronze_longhouse`, sync `cachedBonuses` sang `SessionCoordinator`.
3. **UI & Packaging tests (`__tests__/ui/`):** hiển thị Catalog `Stone | Bronze` tại `400px`, modal Tiến hóa Era, modal `Longhouse` tuyển 3 vai trò Bronze, `MapGridView` render `bronzeSpriteData` & `bronzeConstructionSpriteData`, `FocusSceneArea` chuyển sang công cụ Bronze (`row = 1`), giữ `0` God Mode / `jsxDEV` trong `dist/`.
