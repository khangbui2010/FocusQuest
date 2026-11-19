# BÁO CÁO NGHIỆM THU — MILESTONE 5B.5 / GIAI ĐOẠN 5c

**Giai đoạn:** Milestone 5B.5 — Giai đoạn 5c *(`QuestView` & Nâng cấp `StatsView` — KHÔNG chạm lõi kinh tế/backend/schema, giữ nguyên `Awards` placeholder và nút Upgrade `"Milestone 5C"`)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_5c_prev.md` *(sao lưu nguyên vẹn báo cáo Giai đoạn 2b trước khi chỉnh sửa)*  
**Trạng thái:** `604 / 604` tests PASS 3/3 lần | `npm run lint` PASS | `npm run build` PASS — **CHƯA KIỂM CHỨNG TRỰC QUAN TRÊN CHROME POPUP THẬT** — **DỪNG chờ duyệt Giai đoạn 5c**

---

## 1. BƯỚC 0 — KIỂM TRA TRƯỚC KHI SỬA

### 1.1. Rà soát hợp đồng dữ liệu & hàm sẵn có (không bịa API, không sửa lõi)
- **`src/core/quests/questCatalog.ts`:** Giữ nguyên 100%. UI đọc trực tiếp từ `DAILY_QUEST_CAP` (`40C / 100XP`), `WEEKLY_QUEST_CAP` (`150C / 370XP`), và `getQuestDefinitionsByPeriod('DAILY' | 'WEEKLY')` — tuyệt đối không hardcode danh sách, mục tiêu hay mức thưởng Quest trong JSX.
- **`src/core/quests/questEngine.ts` & `src/background/questCoordinator.ts`:** Tái sử dụng `countUnclaimed`, `GET_QUEST_STATE` (`GetQuestStateResponseData`), `CLAIM_QUEST_REWARD` (`ClaimQuestRewardResponseData`, kèm `MessageResponse.errorCode` cho `QUEST_ALREADY_CLAIMED`, `QUEST_EXPIRED`, v.v.) qua `getQuestStateClient()` và `claimQuestRewardClient()` trong `src/ui/services/extensionClient.ts`.
- **`src/core/stats/statsAggregator.ts` & `src/ui/components/StatsBarChart.tsx`:** Tái sử dụng nguyên vẹn `aggregateDayStats`, `aggregateMonthStats`, `aggregateYearStats`, `calculateFocusStreak`, `addDaysToDateKey`, `isValidDateKey` và `<StatsBarChart />` (SVG thuần).
- **`src/core/civilization/buildingCatalog.ts`:** Kiểm tra công trình có effect `FOCUS_STAT_UNLOCK`: duy nhất `stone_age_elder_hut` (*Elder's Hut / Lều Trưởng lão*) mang `statId = 'focus_metric_streak_analysis'`.
- **Hiển thị số & bản địa hóa:** Tái sử dụng `formatRewardAmount` (`src/ui/utils/formatters.ts` — half-up tối đa 2 chữ số thập phân), `localizeErrorMessage` (`src/i18n/errorTranslator.ts`), `getLocalizedBuildingName` (`src/ui/utils/buildingI18n.ts`), và `getLocalDateKey` (`src/core/utils/dateUtils.ts` — loại bỏ `.toISOString().slice(0, 10)`).

### 1.2. Đánh giá tác động lên bộ test hiện hữu
- `__tests__/ui/fullBilingual.test.ts` kiểm tra chuỗi `'stats.todaySummaryTitle'` (`Today's Focus Summary` / `Tổng kết Tập trung Hôm nay`) → giữ nguyên key này trên mặc định hôm nay của tab `Day` trong `StatsView.tsx`.
- `__tests__/ui/navigationRedesign.test.ts:194` kiểm tra `!html.includes('quest-unclaimed-badge')` khi gọi `<Navbar />` không truyền `unclaimedQuestCount` → đặt mặc định `unclaimedQuestCount = 0` và ẩn hẳn badge khi `<= 0`.
- `__tests__/ui/ux1SessionNavigationAndProfile.test.ts` & `ux4RewardDisplayAndFormatting.test.ts` dựng trực tiếp `<PopupShell />` với bộ props cũ → mọi prop Stage 5c mới thêm vào `PopupShellProps` đều là optional.
- **Kết quả:** **0** test cũ cần chỉnh sửa để chiều theo giao diện mới; tab `Awards` giữ nguyên `data-testid="awards-placeholder-view"` và `"Coming soon"`.

---

## 2. CHI TIẾT TRIỂN KHAI GIAI ĐOẠN 5c

### 2.1. Tab `Quests` & Huy hiệu chưa nhận (`QuestView.tsx`, `questFormatting.ts`, `Navbar.tsx`)
- **`src/ui/utils/questFormatting.ts` (thuần):**
  - `formatDailyResetCountdown(ms)` (`HH:MM:SS`, clamp `<= 0` hoặc `NaN` về `00:00:00`) & `formatWeeklyResetCountdown(ms, t)` (`{days}d {hours}h` / `{days} ngày {hours} giờ` khi `>= 24h`, chuyển `HH:MM:SS` dưới `24h`).
  - `resolveQuestVisualStatus(entry, { isExpired })` phân tách rõ 4 trạng thái: `IN_PROGRESS`, `READY`, `CLAIMED`, `EXPIRED`.
  - `computePeriodClaimedSummary(period, questState)` tính tổng `claimedCoins / maxCoins`, `claimedXp / maxXp` động từ `questCatalog.ts`.
  - `formatQuestProgressLabel(def, progress, t)` bản địa hóa đơn vị `sessions` / `mins` / `days` qua `t()`.
- **`src/ui/components/quests/QuestView.tsx`:**
  - Giao diện hoàn chỉnh (`data-testid="quest-view"`) gồm header `Daily & Weekly Quests` + tóm tắt chờ nhận, banner thành công khi Claim (`quest-claim-feedback`), hộp lỗi `role="alert"` bản địa hóa qua `localizeErrorMessage` (tự refetch khi `errorCode` là `QUEST_ALREADY_CLAIMED` hoặc `QUEST_EXPIRED`), thẻ **Quest Streak** (`quest-streak-card`) kèm ghi chú không sinh Coin thụ động, 2 khu vực **Daily Quests** & **Weekly Quests** với đồng hồ đếm ngược 1s/giây + auto-refetch một lần khi chạm `0`, nút **Claim** có khóa chống bấm đúp theo `period:questId` (`inFlightKeysRef` + `claimingKeys`), thanh tiến độ `role="progressbar"` chuẩn A11y, và trạng thái `Loading` / `Error + Retry` / `Empty`.
- **`src/ui/components/Navbar.tsx`:**
  - Thêm `unclaimedQuestCount = 0`; ẩn hoàn toàn khi `<= 0`, hiển thị `1..9` hoặc `9+` khi `>= 10` (`data-testid="quest-unclaimed-badge"`) kèm `aria-label` song ngữ (`nav.questsBadgeAria`).

### 2.2. Nâng cấp `StatsView.tsx` (`statsPeriod.ts`, `focusStatUnlock.ts`)
- **`src/ui/utils/statsPeriod.ts` (thuần):** Quản lý khóa kỳ `'day' | 'month' | 'year'`, bước kỳ `stepStatsPeriod` & `canStepPeriod` qua ranh giới tháng/năm và năm nhuận (`2024-02` = 29 ngày vs `2025-02` = 28 ngày), khóa cứng không vượt quá `todayDateKey`; chuyển đổi dữ liệu thành thanh cho `<StatsBarChart />` (`dayTrendToBars` 7 ngày, `monthDaysToBars` 28–31 ngày, `yearMonthsToBars` 12 tháng).
- **`src/ui/utils/focusStatUnlock.ts` (thuần):** Đọc catalog thực `getBuildingDefinition` / `getAllBuildingDefinitions` để kiểm tra effect `FOCUS_STAT_UNLOCK` với `statId = 'focus_metric_streak_analysis'` (tự động nhận diện `stone_age_elder_hut`).
- **`src/ui/components/StatsView.tsx`:**
  - Bộ chuyển `Day | Month | Year` (`role="tablist"`), nút `‹` / `›` + nhảy nhanh `Today / This Month / This Year`, neo ngày theo giờ địa phương (`getLocalDateKey()`, bỏ `.toISOString().slice(0, 10)`).
  - Tải lịch sử đầy đủ via `getDailyStatsClient()` và đồng bộ với `todayStats` mới nhất; hiển thị KPI từng khung thời gian (khi `completionRate === null` hoặc chưa có Peak Day / Best Month hiển thị `'—'`, `0` lỗi `NaN`), biểu đồ cột `<StatsBarChart />`, và ghi chú tách riêng thưởng Focus với thưởng Quest (`stats.focusRewardsNote`).
  - Thẻ **Focus Streak** (`stats-focus-streak-card`): khóa cùng gợi ý tên công trình bản địa hóa (`Elder's Hut` / `Lều Trưởng lão`) khi chưa xây; mở khóa `current` & `longest` ngay khi sở hữu công trình.

### 2.3. Kết nối `App.tsx` & Bản địa hóa EN/VI (`en.ts`, `vi.ts`)
- **`src/App.tsx`:** Thay `quests-placeholder-view` bằng `<QuestView />` (giữ nguyên `awards-placeholder-view`); thêm state `civBuildings`, `unclaimedQuestCount`, `questStateVersion` đồng bộ qua `getCivilizationStateClient()` và `getQuestStateClient()` trong `refreshState()`, truyền xuống `<QuestView />`, `<StatsView />` và `<Navbar />`; thêm `handleQuestClaimed` cập nhật ví ngay và làm mới đồng bộ Popup.
- **`src/i18n/locales/en.ts` & `vi.ts`:** Gỡ `quest.placeholder.*`; bổ sung trọn bộ khóa `quests.*`, `stats.*`, `nav.questsBadgeAria`, `quests.daily.*`, `quests.weekly.*` bảo đảm parity 100% EN/VI.

---

## 3. WIREFRAME GIAO DIỆN POPUP 400PX (ASCII)

```text
+----------------------------------------------------+  400px
| Header: Focus Quest | Stone Age | Coins | Lv | ? |
+----------------------------------------------------+
| [TAB: Quests]                                      |
| Daily & Weekly Quests            1 ready to claim  |
| [ok] +10 Coins · +25 XP claimed!              [x]  |  <- banner sau Claim
| +------------------------------------------------+ |
| | [Flame] Quest Streak      Cur: 1d  |  Max: 3d  | |
| | Zero passive Coins — progresses on focus only. | |
| +------------------------------------------------+ |
| DAILY QUESTS                     Resets 06:12:44   |
| Claimed 10/40 Coins · 25/100 XP                    |
| +------------------------------------------------+ |
| | First Spark                          [Claimed] | |
| | [===========] 1/1 sessions      +10 C  +25 XP  | |
| +------------------------------------------------+ |
| | Steady Rhythm                        [ Claim ] | |  <- nút Claim thủ công
| | [===========] 60/60 mins        +15 C  +35 XP  | |
| +------------------------------------------------+ |
| WEEKLY QUESTS                    Resets 3d 06h     |
| Claimed 0/150 Coins · 0/370 XP                     |
| [Habit Builder / Deep Diver / Weekly Tenacity]     |
+----------------------------------------------------+
| [Quests (1)] [Focus] [   Map   ] [Awards] [Stats]  |  <- Navbar 5 tab (h=64px)
+----------------------------------------------------+

+----------------------------------------------------+  400px
| [TAB: Stats]                                       |
| [  Day  |  Month  |  Year  ]                       |  <- role="tablist"
| < 2026-11-18 >                           [ Today ] |  <- Next khóa ở hôm nay
| Daily Focus Summary                     2026-11-18 |
| +----------------------+ +-----------------------+ |
| | Focus Time: 50 mins  | | Sessions: 2           | |
| +----------------------+ +-----------------------+ |
| | Focus Coins: +100    | | Focus XP: +250        | |
| +----------------------+ +-----------------------+ |
| Last 7 Days / Monthly / Yearly (<StatsBarChart />) |
| +------------------------------------------------+ |
| | (o) Focus Streak                       [Locked]| |  <- Mở khi xây
| | Build Elder's Hut to unlock Focus Streak...    | |     Lều Trưởng lão
| +------------------------------------------------+ |
| Coins & XP above reflect Focus sessions only.      |
+----------------------------------------------------+
```

---

## 4. DANH SÁCH FILE THAY ĐỔI & TEST ĐÃ THÊM

### 4.1. Code sản phẩm (Production)
- **Mới:**
  - `src/ui/utils/questFormatting.ts`
  - `src/ui/utils/focusStatUnlock.ts`
  - `src/ui/utils/statsPeriod.ts`
  - `src/ui/components/quests/QuestView.tsx`
- **Cập nhật (thuần lớp UI & i18n):**
  - `src/ui/components/Navbar.tsx` *(thêm badge `unclaimedQuestCount` tùy chọn, ẩn ở `0`, cap `9+`)*
  - `src/ui/components/StatsView.tsx` *(tab `Day | Month | Year`, stepper, `<StatsBarChart />`, `Focus Streak` + `Elder's Hut`)*
  - `src/App.tsx` *(nối `QuestView`, `civBuildings`, `unclaimedQuestCount`, `handleQuestClaimed`)*
  - `src/i18n/locales/en.ts`, `src/i18n/locales/vi.ts` *(gỡ `quest.placeholder.*`, thêm toàn bộ khóa 5c parity 100%)*
- **Tài liệu:**
  - `PROJECT_STATUS.md`, `README.md`, `ARCHITECTURE.md` (`Version: 1.7.0`), `PRODUCT_SPEC.md`
  - `respond_5c_prev.md` *(sao lưu báo cáo Stage 2b)*, `respond.md` *(báo cáo này)*

### 4.2. Bộ kiểm thử mới (`+9` tests: `595 → 604`, không sửa assertion lõi)
- **`__tests__/ui/questView.test.ts` (`+5` tests):**
  1. `questFormatting`: đếm ngược Daily (`00:00:00` khi `<=0`/`NaN`), Weekly (`2d 6h` vs `05:02:00`), 4 visual statuses, summary cap từ `DAILY_QUEST_CAP`, nhãn đơn vị EN/VI.
  2. `QuestView` SSR EN/VI: kiểm đủ 4 thẻ `CLAIMED` / `READY` / `IN_PROGRESS` / `EXPIRED`, `role="progressbar"`, `Quest Streak`, cap Daily/Weekly, tên & thưởng đọc từ catalog.
  3. `Navbar` unclaimed badge: ẩn ở `0`, hiện `3`, giới hạn `9+` ở `12` kèm `aria-label` EN/VI.
  4. `App` & `PopupShell` wiring: tab `Quests` render `QuestView` (không còn `Coming soon`), tab `Awards` giữ nguyên `awards-placeholder-view`, EN/VI parity 100%.
  5. Simulator `CLAIM_QUEST_REWARD`: cộng phẳng `+10C / +25XP`, **không thay đổi `todayStats`**, claim lại trả `errorCode: 'QUEST_ALREADY_CLAIMED'` dịch chuẩn VI.
- **`__tests__/ui/statsViewUpgrade.test.ts` (`+4` tests):**
  1. `statsPeriod`: bước kỳ qua năm mới (`2026-01-01` → `2025-12-31`, `2026-01` ↔ `2025-12`), chặn tiến quá hôm nay, năm nhuận `2024-02` (`29` cột) vs `2025-02` (`28` cột), `dayTrendToBars` (`7` cột) & `yearMonthsToBars` (`12` cột).
  2. `focusStatUnlock`: xác minh `getUnlockingBuildingDefinition('focus_metric_streak_analysis')` trả về `stone_age_elder_hut`, khóa khi chỉ có `Campfire` và mở khi có `Elder's Hut`.
  3. `StatsView` SSR EN/VI: đủ 3 tab `Day`, `Month`, `Year`, `Focus Streak` khóa/mở (gợi ý `Elder's Hut` / `Lều Trưởng lão`, số liệu khớp `calculateFocusStreak`), tháng rỗng hiển thị `'—'` không `NaN`.
  4. `PopupShell` & Simulator `GET_DAILY_STATS`: truyền `civBuildings` mở khóa streak và trả lịch sử `>= 250` ngày.
- **Sửa 1 lỗi nhỏ trong chính test mới vừa viết (`statsViewUpgrade.test.ts:153-168`):** Lúc chạy kiểm thử lần đầu, chuỗi mock `buildSimulatedDailyStats` đạt chuỗi dài nhất thực tế `20` ngày (thay vì giả định `16`), đã đổi test so khớp trực tiếp với `calculateFocusStreak(records, today)` (vẫn kiểm `>= 16`).

---

## 5. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,753 modules transformed`, **`1.46s`**, tổng dung lượng tệp `dist/`: **`1,167,221 B`**):
  - **So sánh `dist/` Trước 5c (Stage 2b) → Sau 5c:**
    - `dist/background.js`: `93,530 B` (`93.53 kB`, gzip `20.57 kB`) → **`93,534 B` (`93.53 kB`, gzip `20.60 kB`)** *(gần như giữ nguyên tuyệt đối, không đụng Service Worker)*
    - `dist/assets/popup-*.js`: `774,872 B` (`774.87 kB`, gzip `204.59 kB`) → **`818,451 B` (`818.45 kB`, gzip `212.11 kB`)** *(+`43.58 kB` raw / +`7.52 kB` gzip cho `QuestView`, `StatsView` & từ điển 5c)*
    - `dist/assets/popup-*.css`: `88,317 B` (`88.31 kB`, gzip `13.80 kB`) → **`90,982 B` (`90.98 kB`, gzip `14.11 kB`)**
    - `dist/assets/questEngine-*.js`: **`66,805 B`** (`66.80 kB`, gzip `18.48 kB`)
    - `dist/assets/translator-*.js`: **`61,875 B`** (`61.87 kB`, gzip `16.40 kB`)
    - `dist/assets/storageKeys-C4hhw6ET.js`: **`398 B`** (`0.39 kB`, gzip `0.27 kB`)
    - `dist/offscreen.js`: **`3,878 B`**, `dist/blocked.js`: **`1,321 B`**, `dist/manifest.json`: **`984 B`**, `dist/index.html`: **`712 B`**.
- **`npm test` — chạy 3 lần liên tiếp (với `dist/` đã build sẵn):**
  - **Lần 1:** `604 / 604 PASS` (`0` fail, `0` skipped, `0` cancelled, **`39,008.59 ms`**, Exit `0`).
  - **Lần 2:** `604 / 604 PASS` (`0` fail, `0` skipped, `0` cancelled, **`31,786.63 ms`**, Exit `0`).
  - **Lần 3:** `604 / 604 PASS` (`0` fail, `0` skipped, `0` cancelled, **`31,948.09 ms`**, Exit `0`).

---

## 6. RANH GIỚI KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRA TRÊN CHROME POPUP

- **Ranh giới kiểm chứng:** Môi trường hiện tại không chạy trình duyệt Chrome thật; toàn bộ `604` test vừa chạy thực thi trên Node.js (`tsx --test`) dùng React SSR (`renderToString`), mock 2D canvas và simulator `extensionClient.ts`. Giao diện tương tác trực tiếp trên Chrome Popup `400×600` (bấm Claim thực tế, đồng hồ tick trực tiếp, đổi tab `Day | Month | Year`, cuộn ở `400×600`) **chưa kiểm chứng trên trình duyệt thật**.
- **Checklist kiểm tra thủ công trên Chrome (`chrome://extensions` → Load unpacked `/dist` → mở Popup `400×600`):**
  1. **Tab `Quests` & Badge `Navbar`:** Hoàn thành 1 phiên Focus ngắn → kiểm tra huy hiệu đỏ trên icon `Quests` hiện số chờ nhận; mở tab `Quests`, xác nhận `First Spark` hiện nút `Claim`, bấm `Claim` → kiểm tra Header Coins/XP tăng đúng `+10C / +25XP`, banner xanh xuất hiện, huy hiệu giảm đi `1`, và tab `Stats` hôm nay **không** cộng `+10C / +25XP` của Quest vào `Focus Coins` / `Focus XP`.
  2. **Tab `Stats` (`Day | Month | Year`):** Chuyển qua 3 tab, bấm `‹` lùi về ngày/tháng/năm trước (kiểm tra nút `›` bị khóa tại kỳ hiện tại và nút `Today / This Month / This Year` đưa về hiện tại), rê chuột / dùng `Tab` qua các cột `<StatsBarChart />` để kiểm tooltip không tràn mép `400px`.
  3. **Khóa/mở `Focus Streak` theo `Elder's Hut`:** Trước khi xây `Elder's Hut` (*Lều Trưởng lão*), xác nhận thẻ `Focus Streak` hiện trạng thái `Locked` kèm tên công trình đúng ngôn ngữ EN/VI; đặt `Elder's Hut` trên Bản đồ rồi quay lại `Stats` → xác nhận thẻ lập tức mở khóa hiện chuỗi hiện tại & chuỗi dài nhất.
  4. **Chuyển ngôn ngữ EN ↔ VI & Tab `Awards`:** Đổi qua lại `EN | VI` trên Header ở cả `Quests` và `Stats` để kiểm không còn chuỗi sót tiếng Anh/tiếng Việt, và tab `Awards` vẫn hiển thị `"Coming soon"`.

---

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 6
