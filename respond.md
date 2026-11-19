# BÁO CÁO NGHIỆM THU — MILESTONE 5B.5 / GIAI ĐOẠN 2b

**Giai đoạn:** Milestone 5B.5 — Giai đoạn 2b *(Atomic Session Integration, QuestCoordinator & Message Wiring — KHÔNG làm `QuestView`/`StatsView`, giữ nguyên cho Giai đoạn 5c)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_2b_prev.md` *(sao lưu nguyên vẹn báo cáo UX-5 trước đó; các báo cáo lịch sử trước vẫn giữ nguyên)*  
**Trạng thái:** `595 / 595` tests PASS 3/3 lần | `npm run lint` PASS | `npm run build` PASS — **CHƯA KIỂM CHỨNG TRỰC TIẾP TRÊN CHROME SERVICE WORKER THẬT** — **DỪNG chờ duyệt Giai đoạn 2b**

---

## 1. BƯỚC 0 — KIỂM TRA TRƯỚC KHI SỬA

### 1.1. Bước 0a — Đối chiếu `src/core/quests/questCatalog.ts`
Toàn bộ định nghĩa nhiệm vụ & mức trần phần thưởng trong `src/core/quests/questCatalog.ts` **KHỚP 100%** với bảng chuẩn (không có sai lệch, đủ điều kiện triển khai tiếp):

| ID (`questId`) | Chu kỳ | Metric & Mục tiêu (`target` / `minSessionMinutes`) | Thưởng trong code (`rewardCoins` / `rewardXp`) | Đối chiếu chuẩn | Kết quả |
|---|---|---|---:|---:|---|
| `daily_first_spark` | `DAILY` | `COMPLETED_SESSIONS`: `1` phiên | `10C` / `25XP` | `1 phiên · 10C / 25XP` | **KHỚP** |
| `daily_steady_rhythm` | `DAILY` | `FOCUS_MINUTES`: `60` phút | `15C` / `35XP` | `60 phút · 15C / 35XP` | **KHỚP** |
| `daily_double_tap` | `DAILY` | `COMPLETED_SESSIONS`: `2` phiên | `15C` / `40XP` | `2 phiên · 15C / 40XP` | **KHỚP** |
| **Daily Cap (`DAILY_QUEST_CAP`)** | `DAILY` | Tổng 3 Daily Quests | **`40C` / `100XP`** | **`40C / 100XP / ngày`** | **KHỚP** |
| `weekly_habit_builder` | `WEEKLY` | `ACTIVE_DAYS`: `4` ngày phân biệt | `50C` / `120XP` | `4 ngày · 50C / 120XP` | **KHỚP** |
| `weekly_deep_diver` | `WEEKLY` | `DEEP_SESSIONS`: `3` phiên (`>= 45` phút) | `60C` / `150XP` | `3 phiên >=45p · 60C / 150XP` | **KHỚP** |
| `weekly_tenacity_10` | `WEEKLY` | `COMPLETED_SESSIONS`: `10` phiên | `40C` / `100XP` | `10 phiên · 40C / 100XP` | **KHỚP** |
| **Weekly Cap (`WEEKLY_QUEST_CAP`)** | `WEEKLY` | Tổng 3 Weekly Quests | **`150C` / `370XP`** | **`150C / 370XP / tuần`** | **KHỚP** |

### 1.2. Bước 0b — Bảng kiểm toán mọi điểm kết thúc / quyết toán phiên trong `SessionCoordinator` (`src/background/sessionCoordinator.ts`)

| Điểm quyết toán / terminal trong `SessionCoordinator` | Vị trí dòng | Gọi `commitSessionOutcomeInternal` hiện tại | Có tạo tiến độ Quest? (`toQuestOutcomeDelta`) | Cơ sở nghiệp vụ |
|---|---:|---|---|---|
| `finishStopwatch()` nhánh `POMODORO_STOPWATCH` | `976–994` | Commit `session` (`COMPLETED`), `economyDelta`, `dailyStatDelta`, **`questOutcomeDelta`** | **CÓ** *(nếu `completedFocusCount > 0`)* | Chỉ tính `completedFocusCount × intervalDuration`; loại bỏ phút interval dở dang và nhánh `0` interval |
| `finishStopwatch()` nhánh `STOPWATCH` thường | `1066–1084` | Commit `session` (`COMPLETED`), `economyDelta`, `dailyStatDelta`, **`questOutcomeDelta`** | **CÓ** *(nếu `actualFocusMinutes >= 5`)* | Ngưỡng tối thiểu `5` phút; `< 5` phút trả `null` -> không đụng `fq_quests` |
| `completeCountdown()` (`COUNTDOWN`) | `1172–1187` | Commit `session` (`COMPLETED`), `economyDelta`, `dailyStatDelta`, **`questOutcomeDelta`** | **CÓ** | Hoàn thành `100%` `targetMinutes` |
| `advancePomodoroStage()` nhánh `POMODORO_COUNTDOWN` khi `newCompletedCount >= totalPlannedIntervals` | `1403–1418` | Commit `session` (`COMPLETED`), `economyDelta`, `dailyStatDelta`, **`questOutcomeDelta`** | **CÓ** | Chỉ quyết toán duy nhất tại mốc `100%` toàn bộ pha & chu kỳ |
| `advancePomodoroStage()` chuyển pha giữa chừng (`Break` / `Focus` tiếp theo) | `1474`, `1550`, `1635` | Chỉ gọi `setCurrentSession` (không quyết toán) | **KHÔNG** | Phiên đang `RUNNING`, chưa kết thúc |
| `giveUpCountdown()` (`COUNTDOWN` / `POMODORO_*`) | `813–826` | Commit `session` (`ABANDONED`), chỉ ghi `dailyStatDelta` (0 Coin/XP) | **KHÔNG** | `status = ABANDONED` → `toQuestOutcomeDelta` trả `null`, không đụng `fq_quests` |
| `handleExtensionDisabledRecovery()` (3 nhánh `COUNTDOWN`/`POMODORO_COUNTDOWN`, `POMODORO_STOPWATCH`, `STOPWATCH`) | `1744–1757`, `1786–1799`, `1822–1835` | Commit `session` (`INTERRUPTED`), chỉ ghi `dailyStatDelta` (0 Coin/XP) | **KHÔNG** | `status = INTERRUPTED` → không tạo tiến độ Quest |
| `handleBrowserStartupRecovery()` nhánh `COUNTDOWN` | `2378–2391` | Commit `session` (`INTERRUPTED`), chỉ ghi `dailyStatDelta` (0 Coin/XP) | **KHÔNG** | `status = INTERRUPTED` → 0 tiến độ Quest |
| `handleBrowserStartupRecovery()` nhánh `STOPWATCH` | `2457–2470` | Commit `session` (`INTERRUPTED`), chỉ ghi `dailyStatDelta` (0 Coin/XP) | **KHÔNG** | `status = INTERRUPTED` → 0 tiến độ Quest |
| `handleBrowserStartupRecovery()` nhánh `POMODORO_STOPWATCH` (`BROWSER_CLOSED`) | `2532–2552` | Commit `session` (`INTERRUPTED`), có thể ghi `economyDelta` + `dailyStatDelta` cho các interval hoàn thành trước khi đóng trình duyệt | **KHÔNG** | Bất biến All-or-Nothing Quest: `status === 'INTERRUPTED'` nên **0** tiến độ Quest, dù Economy/Stats vẫn trao thưởng interval hoàn thành theo §9 |
| `handleBrowserStartupRecovery()` nhánh `POMODORO_COUNTDOWN` | `2624–2638` | Commit `session` (`INTERRUPTED`), chỉ ghi `dailyStatDelta` (0 Coin/XP) | **KHÔNG** | All-or-Nothing `INTERRUPTED` → 0 Reward, 0 Quest |
| `reconcileActiveSession()` (`RUNNING` / `PAUSED` quá hạn) | `2017`, `2041`, `2094`, `2120` | Ủy quyền sang `completeCountdown()` hoặc `advancePomodoroStage()` | *Theo 2 hàm đích ở trên* | Chỉ cộng Quest nếu hàm đích đưa phiên tới `COMPLETED` hợp lệ |
| `resetSession()` | `2666–2679` | Đặt `CURRENT_SESSION = null` (chỉ khi terminal) | **KHÔNG** | Dọn UI quay về rảnh, không đụng ví/stats/quests |

### 1.3. Bước 0c — Cách tính `completedDateKey` & xử lý phiên vắt qua mốc `00:00`
- Tại 4 điểm hoàn thành trong `SessionCoordinator`, `completedDateKey = this.getTodayDateKey(now)` (`src/background/sessionCoordinator.ts:259-261`, gọi `getLocalDateKey(now)` từ `src/core/utils/dateUtils.ts:7-13`), truyền vào `buildQuestOutcomeDeltaSafe(updated, completedDateKey)` và dùng chung `completedDateKey` cho `dailyStatDelta.date`.
- **Khi một phiên bắt đầu trước `00:00` (Ngày `N`, ví dụ `23:50`) và kết thúc sau `00:00` (Ngày `N+1`, ví dụ `00:15`):**
  - Cả `fq_daily_stats` lẫn `fq_quests` đều ghi nhận theo **ngày địa phương tại thời điểm hoàn thành (`N+1`)**.
  - `StorageManager.commitSessionOutcomeInternal` lấy `questNowMs = session.completedAt` (`2026-11-23 00:15`), chạy `rolloverQuestState` để chốt sang ngày mới `N+1` (và sang tuần mới nếu `N+1` là Thứ Hai, làm hết hạn phần thưởng ngày/tuần cũ chưa claim), sau đó `applyCompletedSession` mới cộng tiến độ phiên này vào ngày `N+1` và tăng `streak.currentDays` nối tiếp giữa `N` và `N+1`.

### 1.4. Bước 0d — Hàm tính Level hiện có & lý do Claim không ghi vào `fq_daily_stats`
- **Tái sử dụng hàm tính Level duy nhất:** `QuestCoordinator.claimQuestReward` (`src/background/questCoordinator.ts:214`) và simulator (`src/ui/services/extensionClient.ts:1900`) gọi trực tiếp `calculatePlayerLevel(newTotalXP)` từ `src/core/economy/levelSystem.ts:62-64` — không tự viết lại công thức Level.
- **Lý do Claim KHÔNG ghi vào `fq_daily_stats`:** `fq_daily_stats` lưu hồ sơ năng suất phiên Focus theo ngày (`totalFocusMinutes`, `completedSessions`, `abandonedSessions`, `coinsEarned`, `xpEarned` từ các phiên tập trung của ngày đó). Phần thưởng Quest là thưởng cột mốc phẳng do người dùng bấm **Claim thủ công** (có thể hoàn thành lúc cuối ngày nhưng bấm nhận sau hoặc tổng hợp từ Weekly Quest nhiều ngày), nên chỉ cộng phẳng vào `STORAGE_KEYS.ECONOMY` và đánh dấu `claimed` trên `STORAGE_KEYS.QUESTS` via `commitQuestClaimInternal` để giữ nguyên vẹn ý nghĩa biểu đồ & số liệu phiên Focus hằng ngày.

---

## 2. CHI TIẾT TRIỂN KHAI GIAI ĐOẠN 2b

### 2.1. Quyết toán nguyên tử & Rollback (`src/storage/storageManager.ts`)
- Mở rộng `commitSessionOutcomeInternal` nhận thêm `questOutcomeDelta?: QuestOutcomeDelta`:
  - Kiểm tra `hasValidQuestDelta` (`isValidDateKey`, `Number.isFinite`, `completedFocusMinutes > 0`). Nếu **không có delta** (`Give Up`, `INTERRUPTED`, Stopwatch `< 5m`, Pomodoro Stopwatch `0` interval), tuyệt đối **không đọc và không ghi `STORAGE_KEYS.QUESTS`**.
  - Khi có delta hợp lệ: dùng `questNowMs = params.session.completedAt ?? Date.now()`, đọc `STORAGE_KEYS.QUESTS`, tự phục hồi nếu thiếu/hỏng qua `sanitizeQuestState` (bọc fallback `createInitialQuestState`), chạy `rolloverQuestState` rồi `applyCompletedSession`, và đưa vào cùng `items` để ghi đồng loạt `CURRENT_SESSION + ECONOMY + DAILY_STATS + QUESTS` trong **một `setMultiple` duy nhất dưới `StorageMutex`**.
  - **Cô lập lỗi Quest:** Toàn bộ khâu đọc/sanitize/rollover/apply Quest nằm trong `try/catch`; nếu Quest gặp lỗi bất thường, chỉ log `console.warn` (`Isolated quest progress failure...`) và vẫn commit trọn vẹn phiên, ví `ECONOMY` và `DAILY_STATS`.
  - **Rollback Compensation:** Trước `setMultiple(items)`, lấy `previousSnapshot` của các khóa `keysToWrite` via `this.adapter.getMultiple(keysToWrite)`. Nếu `setMultiple(items)` ném lỗi (kể cả lỗi ghi dở dang một phần khóa), khôi phục các khóa đã tồn tại bằng `setMultiple(restoreItems)` và xóa các khóa mới tạo bằng `remove(key)`; nếu rollback cũng lỗi thì ném lỗi gộp cảnh báo rõ ràng.

### 2.2. Nối `SessionCoordinator` & bảo toàn hooks LOFI (`src/background/sessionCoordinator.ts`)
- Bổ sung `private buildQuestOutcomeDeltaSafe(session, completedDateKey)` bọc `toQuestOutcomeDelta` trong `try/catch`.
- Chèn `questOutcomeDelta` tại đúng 4 điểm `COMPLETED`: `finishStopwatch()` (`POMODORO_STOPWATCH` & `STOPWATCH`), `completeCountdown()`, và `advancePomodoroStage()` (`POMODORO_COUNTDOWN` 100%).
- **Giữ nguyên 100% bất biến:** Không thay đổi công thức thưởng, `RewardEngine`, `MultiplierRules`, `CoinBonus`, All-or-Nothing, cấu trúc/vị trí gọi `onSessionEndedHook` & `onSessionSyncHook`.

### 2.3. `QuestCoordinator`, `MessageHandler`, `background/index.ts`, `types/messages.ts`, `errorTranslator.ts`
- **`src/background/questCoordinator.ts`:**
  - `getQuestState(nowMs)`: đọc dưới `StorageMutex`, sanitize, rollover, chỉ ghi `setQuests` nếu `dailyDateKey` hoặc `weeklyStartKey` thay đổi (hoặc dữ liệu cũ thiếu/hỏng), trả `{ questState, resetCountdown, unclaimedCount }`.
  - `claimQuestReward(payload, nowMs)`: validate bằng `validateClaimQuestPayload`, khóa `StorageMutex`, rollover & check `claimQuest`, phân tách chính xác `INVALID_QUEST_PAYLOAD`, `UNKNOWN_QUEST`, `QUEST_PERIOD_MISMATCH`, `QUEST_ALREADY_CLAIMED` (kể cả qua `recentClaimedKeys`), `QUEST_EXPIRED` (vừa rollover qua kỳ mới trong khi chưa claim), `QUEST_NOT_COMPLETED`. Cộng phẳng `coins` & `xp` với độ chính xác IEEE-754 đầy đủ vào `PlayerEconomy`, tính `level = calculatePlayerLevel(newTotalXP)`, ghi đồng thời `ECONOMY + QUESTS` qua `commitQuestClaimInternal` (có rollback compensation), **không ghi vào `fq_daily_stats`**.
- **`src/background/messageHandler.ts` & `src/background/index.ts`:** Khởi tạo `questCoordinator = new QuestCoordinator(storageManager)`, truyền vào `MessageHandler`, xử lý `GET_QUEST_STATE` & `CLAIM_QUEST_REWARD`, trả `errorCode` trong `MessageResponse` khi bắt `QuestCoordinatorError`.
- **`src/types/messages.ts` & `src/i18n/errorTranslator.ts`:** Có đủ actions, typed payload/response (`GetQuestStateResponseData`, `ClaimQuestRewardResponseData`), `MessageResponse.errorCode`, và dịch song ngữ EN/VI cho cả 3 lỗi validation + 5 mẫu lỗi `QuestCoordinator` không lộ stack trace hay đường dẫn nội bộ.

### 2.4. Đồng bộ Simulator Web Preview (`src/ui/services/extensionClient.ts`)
- Hỗ trợ đầy đủ `GET_QUEST_STATE` và `CLAIM_QUEST_REWARD` trên `mockQuestState` (tái sử dụng `rolloverQuestState`, `getResetCountdown`, `countUnclaimed`, `claimQuest`, `calculatePlayerLevel`, cùng đầy đủ `errorCode` khớp backend).
- Cập nhật nhánh auto-complete `COUNTDOWN` trong `GET_SESSION_STATE` (cộng Economy/Stats/Quest + `syncSimulatedMusicWithSession`), song song với `ADVANCE_POMODORO_STAGE` (`POMODORO_COUNTDOWN` 100%) và `FINISH_STOPWATCH` (`STOPWATCH` / `POMODORO_STOPWATCH`), trong khi `GIVE_UP_SESSION` giữ nguyên không cộng Quest.

---

## 3. DANH SÁCH FILE THAY ĐỔI & TEST ĐÃ CẬP NHẬT

### 3.1. Code sản phẩm (Production)
- **Đã kiểm chứng & giữ hoàn thiện từ đầu Giai đoạn 2b:**
  - `src/background/questCoordinator.ts` *(MỚI ở 2b)*
  - `src/background/messageHandler.ts`, `src/background/index.ts`, `src/types/messages.ts`, `src/i18n/errorTranslator.ts`
- **Chỉnh sửa bổ sung để khóa an toàn, rollback & parity:**
  - `src/storage/storageManager.ts` *(thêm `isValidDateKey` guard cho `questOutcomeDelta`, `try/catch` cô lập lỗi Quest, `previousSnapshot` + rollback compensation đầy đủ quanh `setMultiple` trong `commitSessionOutcomeInternal`)*
  - `src/background/sessionCoordinator.ts` *(thêm `buildQuestOutcomeDeltaSafe` bọc `try/catch` tại 4 điểm `COMPLETED`)*
  - `src/ui/services/extensionClient.ts` *(bổ sung cập nhật `mockQuestState` / Economy / DailyStats khi `GET_SESSION_STATE` tự chốt `COUNTDOWN` hết giờ)*
- **Tài liệu:**
  - `PROJECT_STATUS.md`, `ARCHITECTURE.md` (`Version: 1.6.0`), `PRODUCT_SPEC.md` (§13 sync Stage 2b), `README.md`
  - `respond_2b_prev.md` *(sao lưu báo cáo UX-5)*, `respond.md` *(báo cáo này)*

### 3.2. Bộ kiểm thử mới & Test cũ buộc phải cập nhật
- **Thêm mới (`+12` tests) — `__tests__/background/questCoordinator.test.ts`:**
  1. Kiểm toán Bước 0a: khớp catalog & trần thưởng Daily (`40C/100XP`) / Weekly (`150C/370XP`).
  2. Bất biến 4 chế độ (`COUNTDOWN`, `STOPWATCH`, `POMODORO_COUNTDOWN`, `POMODORO_STOPWATCH` loại bỏ phút dở dang) + idempotency khi gọi lặp lại.
  3. Nhánh không đủ điều kiện (`Give Up`, Stopwatch `< 5m`, Stopwatch `INTERRUPTED`, Countdown `BROWSER_CLOSED`, Pomodoro Stopwatch `0` interval, Pomodoro Stopwatch `BROWSER_CLOSED` tuy cộng Economy/Stats nhưng không chạm `fq_quests`, `Reset`) → `0` lần ghi `fq_quests`.
  4. Resilience: `fq_quests` bị xóa, là chuỗi rác, hoặc field số/chuỗi corrupt → tự phục hồi an toàn mà phiên vẫn quyết toán chuẩn.
  5. Cô lập lỗi Quest: inject lỗi đọc `fq_quests` → log warning, vẫn commit trọn vẹn phiên, ví và `fq_daily_stats`.
  6. Atomicity & Rollback: inject lỗi `setMultiple` ghi dở 2 khóa → rollback nguyên vẹn cả 4 khóa (`CURRENT_SESSION`, `ECONOMY`, `DAILY_STATS`, `QUESTS`); lỗi `commitQuestClaimInternal` → rollback nguyên vẹn ví & trạng thái chưa claim.
  7. Vượt mốc `00:00` (`Sunday 23:50 -> Monday 00:15`) + Daily/Weekly rollover + chặn tua ngược đồng hồ.
  8. `claimQuestReward`: thưởng phẳng (không nhân `+25% CoinBonus`), độ chính xác IEEE-754 (`12.375 + 10 = 22.375`), `calculatePlayerLevel`, **không ghi `fq_daily_stats`**.
  9. Từ chối Claim: `QUEST_NOT_COMPLETED`, `QUEST_ALREADY_CLAIMED` (kể cả khi giả lập sửa `claimed = false` nhưng vẫn còn trong `recentClaimedKeys`), `QUEST_EXPIRED` sau rollover.
  10. Concurrency under `StorageMutex`: 2 lệnh `CLAIM_QUEST_REWARD` song song chỉ 1 thắng (lệnh 2 nhận `QUEST_ALREADY_CLAIMED`), và xen kẽ `completeCountdown` + `claimQuestReward` không mất cập nhật.
  11. `MessageHandler` + `errorTranslator` (EN/VI): đủ 6 `errorCode`, thông điệp sạch không lộ stack/path.
  12. `extensionClient.ts` simulator: `GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`, `GIVE_UP_SESSION` giữ nguyên Quest, auto-complete `COUNTDOWN` trên `GET_SESSION_STATE` cộng tiến độ Quest.
- **Cập nhật đúng 1 file test cũ — `__tests__/storage/v3Migration.test.ts` *(giữ nguyên 100% mọi assertion Economy/Coins/XP/Level/Multiplier)*:**
  1. Dòng `219–221`: đổi kỳ vọng ngày cứng `'2026-11-18'` sang `formatLocalDateKey(nowMs)` vì test dùng `Date.now()` thực tế (fail khi đồng hồ bước sang ngày `'2026-11-19'`).
  2. Dòng `228–230` & `279–290`: cập nhật assertion bảo vệ chỉ-2a cũ (`assert.deepStrictEqual(questsAfterSessions, initialQuests)` — vốn yêu cầu `SessionCoordinator` chưa được nối với Quest ở Giai đoạn 2a) sang kiểm chứng kết quả nối Giai đoạn 2b (sau 25m Countdown + Give Up + 30m Stopwatch → `daily_first_spark: 1/1`, `daily_double_tap: 2/2`, `daily_steady_rhythm: 55/60`, `weekly_tenacity_10: 2/10`, `weekly_habit_builder: 1/4`, `streak: 1`). Mọi assertion `focusCoins: 37.5`, `totalXP: 125`, Stopwatch `36C / 108XP` giữ nguyên từng bit.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,749 modules transformed`, **`1.03s`**, tổng dung lượng tệp `dist/`: **`1,111,022 B`**):
  - **So sánh `dist/background.js` Trước 2b (UX-5) → Sau 2b:**
    - `dist/background.js`: `93,016 B` (`93.01 kB`, gzip `20.37 kB`) → **`93,530 B` (`93.53 kB`, gzip `20.57 kB`)** (**`+514 B`**).
  - Các chunks/entry chính khác trong `dist/`:
    - `dist/assets/popup-5am1wdzk.js`: **`774,872 B`** (`774.87 kB`, gzip `204.59 kB`)
    - `dist/assets/popup-Cnjs0qfG.css`: **`88,317 B`** (`88.31 kB`, gzip `13.80 kB`)
    - `dist/assets/questEngine-C5pC2Fnz.js`: **`66,252 B`** (`66.25 kB`, gzip `18.28 kB`)
    - `dist/assets/translator-B5-w4v6G.js`: **`52,477 B`** (`52.47 kB`, gzip `14.14 kB`)
    - `dist/assets/storageKeys-C4hhw6ET.js`: **`398 B`** (`0.39 kB`, gzip `0.27 kB`)
    - `dist/offscreen.js`: **`3,878 B`** (`3.87 kB`, gzip `1.48 kB`), `dist/blocked.js`: **`1,321 B`** (`1.32 kB`, gzip `0.60 kB`), `dist/manifest.json`: **`984 B`**, `dist/index.html`: **`712 B`**.
- **`npm test` — chạy 3 lần liên tiếp (với `dist/` đã build sẵn để thỏa `musicPackaging.test.ts`):**
  - **Lần 1:** `595 / 595 PASS` (`0` fail, `0` skipped, `0` cancelled, **`25,514.85 ms`**, Exit `0`).
  - **Lần 2:** `595 / 595 PASS` (`0` fail, `0` skipped, `0` cancelled, **`24,657.47 ms`**, Exit `0`).
  - **Lần 3:** `595 / 595 PASS` (`0` fail, `0` skipped, `0` cancelled, **`22,424.03 ms`**, Exit `0`).

---

## 5. RANH GIỚI KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRA TRÊN CHROME DEVTOOLS

- **Ranh giới kiểm chứng:** Môi trường hiện tại không chạy trình duyệt Chrome thật; toàn bộ `595` test vừa chạy thực thi trên Node.js (`tsx --test`) dùng `MemoryStorageAdapter` / mock Chrome adapters và React SSR (`renderToString`). Luồng Service Worker thật & DevTools thực tế **chưa chạy trực tiếp trong môi trường này**.
- **Các bước kiểm tra thủ công Giai đoạn 2b qua Service Worker DevTools sau khi nạp `/dist` (`chrome://extensions` → Inspect views: `service worker`):**
  1. **Kiểm tra dữ liệu `fq_quests` khởi tạo (Schema v3):** Trong Console của Service Worker, chạy:
     ```js
     chrome.storage.local.get(['fq_schema_version', 'fq_quests', 'fq_economy', 'fq_daily_stats'], console.log)
     ```
     Xác nhận `fq_schema_version === 3` và `fq_quests` có đủ `3` daily quests (`daily_first_spark`, `daily_steady_rhythm`, `daily_double_tap`), `3` weekly quests (`weekly_habit_builder`, `weekly_deep_diver`, `weekly_tenacity_10`).
  2. **Kiểm tra `GET_QUEST_STATE` (từ Popup DevTools hoặc bất kỳ extension page nào):**
     ```js
     chrome.runtime.sendMessage({ action: 'GET_QUEST_STATE' }, console.log)
     ```
     Xác nhận trả về `success: true` kèm `data.questState`, `data.resetCountdown` (`dailyResetInMs`, `weeklyResetInMs`), `data.unclaimedCount`.
  3. **Kiểm tra quyết toán phiên (`COMPLETED` vs `GIVE_UP`):** Chạy hết 1 phiên `COUNTDOWN` ngắn (hoặc `STOPWATCH >= 5m`) → kiểm tra `fq_quests` tăng `1` phiên & đủ số phút tương ứng; chạy 1 phiên khác rồi bấm **Give Up** → xác nhận `fq_quests` giữ nguyên không tăng.
  4. **Kiểm tra `CLAIM_QUEST_REWARD` & loại trừ `fq_daily_stats`:**
     ```js
     chrome.runtime.sendMessage({ action: 'CLAIM_QUEST_REWARD', payload: { period: 'DAILY', questId: 'daily_first_spark' } }, console.log)
     ```
     Xác nhận ví `fq_economy` cộng đúng phẳng `10 Coins` và `25 XP`, không nhân `CoinBonus`, `fq_daily_stats` hôm nay giữ nguyên không cộng phần thưởng Quest, và gửi lại lần 2 trả `success: false`, `errorCode: 'QUEST_ALREADY_CLAIMED'`.
  5. **Kiểm tra rollover qua ngày mới:** Trong Service Worker DevTools có thể kiểm thử rollover bằng cách đặt tạm `dailyDateKey` về hôm qua trong `fq_quests`, gọi lại `GET_QUEST_STATE` → xác nhận `daily` reset sạch `0`, `unclaimedCount` ngày cũ hết hạn và gọi `CLAIM_QUEST_REWARD` cho quest cũ trả `QUEST_NOT_COMPLETED` (hoặc `QUEST_EXPIRED` nếu vừa rollover đúng ngay khoảnh khắc claim).

---

**DỪNG tại đây chờ bạn rà soát và duyệt Giai đoạn 2b trước khi triển khai Giai đoạn 5c (`QuestView` & `StatsView`).**
