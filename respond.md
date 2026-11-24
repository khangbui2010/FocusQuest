# BÁO CÁO NGHIỆM THU — MILESTONE 5D-1: QUEST POOL (DAILY / WEEKLY 3 KHE NGẪU NHIÊN)

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone Villager V5.2** trước đó đã được sao lưu nguyên vẹn sang `respond_5d1_prev.md`; mọi file `respond_*_prev.md` khác (`respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, `respond_2a_prev.md`, `respond_2b_prev.md`, v.v.) vẫn được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã triển khai hoàn chỉnh **Milestone 5D-1 (Quest Pool)** trên nền **Villager V5.2** đã được duyệt (`5C-2 Bronze Age` vẫn tạm hoãn theo chỉ đạo), đồng bộ đầy đủ tài liệu (`PRODUCT_SPEC.md`, `PROJECT_STATUS.md`, `README.md`, `ARCHITECTURE.md`) và kiểm định tự động đạt **`698 / 698 PASS` (3/3 lượt liên tiếp)**, **`npm run lint` = `0` lỗi TypeScript**, **`npm run build` = PASS (`29` tệp, `1,323,885 B`, `0` tệp audio)**. **Kiểm tra trực quan và tương tác thực tế trên Google Chrome (`>= 116`) chưa thực hiện và cần bạn kiểm chứng khi nghiệm thu.**

---

## 1. Khảo sát Chặng 0 & Đối chiếu với Mã Hiện Tại

Khi đối chiếu mô tả đề bài 5D-1 với mã nguồn hiện hành tại Chặng 0, hệ thống ghi nhận 5 điểm khác biệt kỹ thuật quan trọng và đã xử lý theo **mã hiện tại làm chuẩn**:

1. **`QuestOutcomeDelta` chưa có chế độ phiên hay số chu kỳ Pomodoro (`src/types/quests.ts`, `src/core/quests/questEngine.ts`):**
   - Trước 5D-1, `QuestOutcomeDelta` chỉ có `{ completedDateKey, completedFocusMinutes }`. Để hỗ trợ `daily_pomodoro_pair` (`POMODORO_FOCUS_INTERVALS >= 2`) mà vẫn giữ nguyên vẹn All-or-Nothing và không phá snapshot của `COUNTDOWN` / `STOPWATCH`, đã bổ sung trường tùy chọn `pomodoroCompletedIntervals?: number` **chỉ được điền khi phiên `COMPLETED` thuộc chế độ `POMODORO_COUNTDOWN` hoặc `POMODORO_STOPWATCH`** (interval đang dở dang của Pomodoro Stopwatch bị loại hoàn toàn).
2. **`DAILY_QUEST_DEFINITIONS` / `WEEKLY_QUEST_DEFINITIONS` từng được giả định là bộ nhiệm vụ đang hoạt động ở nhiều lớp (`questEngine.ts`, `questFormatting.ts`, `QuestView.tsx`, `extensionClient.ts`):**
   - Đã chuyển toàn bộ logic cập nhật tiến độ, tổng hợp phần thưởng đã nhận, hiển thị UI và sim sang nguồn chân lý duy nhất `getActiveQuestDefinitions(period, state)` đọc trực tiếp bộ 1-nhiệm-vụ-mỗi-khe từ `state.daily` / `state.weekly` theo thứ tự `A -> B -> C`.
3. **`applyCompletedSession` tách riêng metric cho Daily và Weekly:**
   - Mở rộng đủ 5 loại `QuestMetric` (`COMPLETED_SESSIONS`, `FOCUS_MINUTES`, `DEEP_SESSIONS`, `ACTIVE_DAYS` có tùy chọn `minDailyMinutes`, `POMODORO_FOCUS_INTERVALS`) cho cả vòng lặp Daily lẫn Weekly, kèm `weeklyDailyMinutes?: Record<string, number>` để theo dõi chính xác ngưỡng phút/ngày cho `weekly_three_days`.
4. **Tính khả thi (Feasibility) dưới hồ sơ `1×60m` / ngày:**
   - Đề xuất `daily_two_sessions_30` (2 phiên mỗi phiên `>= 30m`) ở Daily Khe B **không thể hoàn thành** với người chơi tập trung `1×60m`/ngày (chỉ có 1 phiên/ngày) → thay bằng **`daily_deep_hour`** (`1` phiên `>= 60m`) để **100% Khe A & Khe B Daily** hoàn thành được bằng `1×60m`.
   - Đề xuất `weekly_eight_sessions` (8 phiên/tuần) và `weekly_tenacity_10` (10 phiên/tuần) không thể xong dưới `1×60m × 7 ngày` (tối đa 7 phiên) → giữ nguyên **`weekly_tenacity_10`** kèm nhãn **`difficulty: 'hard'`** và cung cấp đủ **3 lựa chọn `'standard'`** khả thi với `1×60m × 7d` trong Weekly Khe C (`weekly_six_sessions`, `weekly_seven_sessions`, `weekly_three_hundred_minutes`).
5. **Tách Migration Schema v5 sạch sẽ (`src/storage/migrations/v5_questPoolSchema.ts`):**
   - Nâng `CURRENT_SCHEMA_VERSION = 5` và `CURRENT_QUEST_STATE_VERSION = 2` (giữ `fq_civilization` ở `schemaVersion = 2`, giữ nguyên toàn bộ Villager V5.2). Bản lưu v4 đang dở giữa ngày/tuần giữ nguyên bộ `3 + 3` legacy (cả tiến độ, claim, `recentClaimedKeys`, `streak`) cho tới lần rollover `00:00` / Thứ Hai kế tiếp.

---

## 2. Kiến Trúc & Chi Tiết Triển Khai 5D-1

### 2.1. Bảng Khe (Slot) & Pool 19 Nhiệm Vụ (`questCatalog.ts`)

| Kỳ | Khe | Thưởng Bất Biến | Danh sách Pool (ID · Mục tiêu · Nhãn) |
|---|---|---|---|
| **Daily** | **A — Khởi động** | `10 Coins · 25 XP` | `daily_first_spark` (`1` phiên, *legacy*) · `daily_warm_up` (`1` phiên `>= 25m`) · `daily_quick_start` (`25` phút tổng) |
| **Daily** | **B — Nhịp độ** | `15 Coins · 35 XP` | `daily_steady_rhythm` (`60` phút tổng, *legacy*) · `daily_forty_five` (`45` phút tổng) · `daily_deep_hour` (`1` phiên `>= 60m`, thay thế `daily_two_sessions_30`) |
| **Daily** | **C — Thử thách** | `15 Coins · 40 XP` | `daily_double_tap` (`2` phiên, *legacy*) · `daily_deep_dive` (`1` phiên `>= 45m`) · `daily_pomodoro_pair` (`>= 2` chu kỳ Focus Pomodoro `POMODORO_FOCUS_INTERVALS`) |
| **Weekly** | **A — Đều đặn** | `50 Coins · 120 XP` | `weekly_habit_builder` (`4` ngày phân biệt, *legacy*) · `weekly_five_days` (`5` ngày phân biệt) · `weekly_three_days` (`3` ngày, mỗi ngày `>= 25m` qua `weeklyDailyMinutes`) |
| **Weekly** | **B — Chiều sâu** | `60 Coins · 150 XP` | `weekly_deep_diver` (`3` phiên `>= 45m`, *legacy*) · `weekly_two_long_60` (`2` phiên `>= 60m`) · `weekly_five_half_hour` (`5` phiên `>= 30m`) |
| **Weekly** | **C — Khối lượng** | `40 Coins · 100 XP` | `weekly_tenacity_10` (`10` phiên, *legacy*, **`difficulty: 'hard'`**) · `weekly_six_sessions` (`6` phiên, *standard*) · `weekly_seven_sessions` (`7` phiên, *standard*) · `weekly_three_hundred_minutes` (`300` phút tổng, *standard*) |

- **Bất biến trần thưởng 100% tổ hợp:** Daily `3 × 3 × 3 = 27` tổ hợp luôn cho đúng **`40 Coins · 100 XP`** (`DAILY_QUEST_CAP`); Weekly `3 × 3 × 4 = 36` tổ hợp luôn cho đúng **`150 Coins · 370 XP`** (`WEEKLY_QUEST_CAP`).

### 2.2. Chọn Ngẫu Nhiên Thuần, Chống Lặp & Chống Reroll (`questEngine.ts`, `questCoordinator.ts`)
- **`hashQuestSeed` & `selectQuestsForPeriod`:** Sử dụng FNV-1a 32-bit kết hợp Murmur3 finalizer (`0` lời gọi `Date.now()`, `0` lời gọi `Math.random()` trong toàn bộ `src/core/quests/`). Mỗi kỳ băm `(salt, period, periodKey, slot)` để chọn 1 nhiệm vụ/khe và loại trừ nhiệm vụ của kỳ ngay trước đó (`dailyPreviousSelection` / `weeklyPreviousSelection`) khi pool khe có `>= 2` ứng viên (kiểm chứng `0` lặp liên tiếp qua `30` ngày & `20` tuần, phân phối đồng đều `< 5%` lệch qua `1,000` install salts).
- **Không reroll giữa kỳ:** Service Worker khởi động lại (`new QuestCoordinator(storage)`), gọi `getQuestState` nhiều lần cùng ngày, hoặc đồng hồ lùi (`nowMs < lastSettledTimestamp`) đều giữ nguyên bộ nhiệm vụ hiện hành và tiến độ đang có.
- **Khóa Claim ngoài kỳ:** `QuestCoordinator.claimQuestReward` chỉ cho phép nhận nhiệm vụ thuộc bộ đang hiệu lực của kỳ hiện tại; nhiệm vụ của kỳ trước sau rollover trả `QUEST_EXPIRED`, nhiệm vụ không nằm trong kỳ hiện tại trả `QUEST_NOT_COMPLETED`.

### 2.3. Giao diện `QuestView`, `RewardHelpModal` & Bản Địa Hóa EN/VI
- **Thẻ nhiệm vụ (`QuestView.tsx`, `questFormatting.ts`):** Hiển thị tag khe (`Slot A · Starter` / `Khe A · Khởi động`, v.v.), hiển thị tag `Hard` / `Khó` cho nhiệm vụ có `difficulty === 'hard'` (`weekly_tenacity_10`), hiển thị đơn vị `intervals` / `chu kỳ` cho `POMODORO_FOCUS_INTERVALS`, cập nhật nhãn đếm ngược **`New quests in {time}`** / **`Nhiệm vụ mới sau {time}`**, và **tuyệt đối không có nút Reroll**.
- **Từ điển & Rào chắn tĩnh (`en.ts`, `vi.ts`, `i18nStaticGuard.test.ts`):** Bổ sung đầy đủ 13 tiêu đề + 13 mô tả pool, 6 nhãn khe, `quests.difficulty.hard`, `quests.progressUnit.intervals`, và cập nhật `help.questsFlatRule` cho `RewardHelpModal` (tổng **`616 / 616` khóa EN/VI** khớp 100%, vượt qua `i18n Static Key-Usage Guard`).
- **Web Preview Simulator (`extensionClient.ts`):** Seed đúng `3 + 3` nhiệm vụ đang hoạt động từ Pool khớp trần `40C/100XP` & `150C/370XP`, đồng bộ với mọi test UI & integration.

---

## 3. Kết Quả Kiểm Định Tự Động Thực Tế (Đã Đo Sau Mọi Sửa Đổi Cuối)

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint (Node)** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Không lỗi TS/nhập thiếu trên `src/` và `__tests__/` |
| **Compile Applet** | `compile_applet` | **PASS** | Biên dịch sạch |
| **Test Suite — Lượt 1** | `npm test` | **`698 / 698 PASS` (`0` fail, `0` skipped)** | Thời gian chạy: `30,994.74 ms` (`~30.99 s`) |
| **Test Suite — Lượt 2** | `npm test` | **`698 / 698 PASS` (`0` fail, `0` skipped)** | Thời gian chạy: `34,468.36 ms` (`~34.47 s`) |
| **Test Suite — Lượt 3** | `npm test` | **`698 / 698 PASS` (`0` fail, `0` skipped)** | Thời gian chạy: `34,511.23 ms` (`~34.51 s`) |
| **Production Build** | `npm run clean && npm run build` | **PASS (`29` tệp, `1,323,885 B`)** | **`0` tệp audio** (`.mp3/.ogg/.wav/.m4a/.flac`) trong `dist/`; build trong `1.00 s` |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup`: `860.01 kB` JS + `96.87 kB` CSS · `background.js`: `113.13 kB` · `questEngine`: `136.13 kB` · `translator`: `77.61 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe |
| **Parity Từ Điển EN/VI** | Kiểm tra thực tế `EN_MESSAGES` / `VI_MESSAGES` | **`616 / 616` khóa (`100%`)** | Đã qua `i18nStaticGuard.test.ts` |

---

## 4. Bảng Kiểm Bất Biến Kinh Tế, Kiến Trúc & Bảo Mật

- [x] **Trần thưởng & Thưởng phẳng (Flat Rewards):** Tổng thưởng Daily luôn bằng **`40 Coins · 100 XP`**, Weekly luôn bằng **`150 Coins · 370 XP`** trên mọi tổ hợp khe; Quest **không bao giờ nhân với Session Multiplier hay Civilization `CoinBonus`**; Claim thủ công chỉ cộng vào `ECONOMY` và **không ghi vào `fq_daily_stats`**.
- [x] **Manual Claim & Hết hạn khi Rollover:** Phần thưởng chưa bấm Claim hết hạn ngay khi bước sang ngày mới (`00:00`) hoặc tuần mới (`00:00` Thứ Hai).
- [x] **All-or-Nothing Session Eligibility:** Give Up, `INTERRUPTED`, Stopwatch `< 5 phút`, Pomodoro Stopwatch `0` interval hoặc interval đang dở dang không cộng tiến độ Quest (kể cả `daily_pomodoro_pair`).
- [x] **Zero Passive Income & Zero New Permissions:** Không tạo Coin thụ động; không thêm nút Reroll; không dùng nhiệm vụ theo khung giờ hay lịch sử web; giữ nguyên `manifest.json` (không thêm quyền mới); `civilization.era` giữ nguyên `'STONE_AGE'` (`5C-2` chưa kích hoạt).

---

## 5. Checklist Kiểm Chứng Thủ Công Trên Chrome (`>= 116`) *(Chờ Thực Hiện)*

> Lưu ý: Hệ thống chỉ mới chạy kiểm định tự động trên Node.js + Vite build; **chưa kiểm chứng giao diện & Service Worker trên trình duyệt Chrome thật**.

1. Mở `chrome://extensions/` → Bật Developer mode → **Load unpacked** (hoặc Reload) thư mục `dist/`.
2. Mở Popup → chuyển sang tab **Quests**: xác nhận hiển thị đúng 3 Daily + 3 Weekly kèm nhãn khe (`Slot A/B/C` / `Khe A/B/C`), nhãn đếm ngược **`New quests in ...`** / **`Nhiệm vụ mới sau ...`**, nhãn **`Hard` / `Khó`** (nếu trúng `weekly_tenacity_10`), và **không có nút Reroll**.
3. Hoàn thành thử một phiên **Pomodoro** (>= 2 focus intervals) hoặc **Countdown >= 60m** để kiểm tra thanh tiến độ tăng đúng metric (và bấm Claim kiểm tra cộng Coin/XP phẳng).
4. Kiểm tra nút `?` mở **`RewardHelpModal`** (EN & VI) hiển thị phần giải thích Quest Pool `40C/100XP` Daily & `150C/370XP` Weekly khớp thực tế.
5. Nếu nâng cấp từ profile đang có bản lưu `v4` cũ: xác nhận các nhiệm vụ đang chạy dở giữa ngày/tuần giữ nguyên tiến độ & tới qua `00:00` / Thứ Hai mới xoay sang bộ Quest Pool mới.

DỪNG — CHỜ DUYỆT MILESTONE 5D-1.
