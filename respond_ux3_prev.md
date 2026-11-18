# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-2

**Giai đoạn:** Milestone UX — Giai đoạn UX-2 *(Sửa hiển thị phần thưởng màn kết thúc, nhãn `"Thưởng dự kiến"` khi chạy Pomodoro Countdown, cập nhật `PRODUCT_SPEC.md` & test — KHÔNG thuộc Phase 5, 5B.5 hay LOFI)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_ux2_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`551 / 551` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. BƯỚC 0 — KẾT QUẢ ĐIỀU TRA & BẰNG CHỨNG MÃ NGUỒN

### (a) Nguồn dữ liệu của ô `"Phần thưởng"` và câu mô tả trên màn kết thúc
- **Ô Phần thưởng trước khi sửa (`src/ui/components/TimerView.tsx`, dòng 431–445 cũ):**
  - `TimerView` gộp chung `isPomodoro = session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH'` rồi gán trực tiếp:
    `earnedCoins = isPomodoro ? session.pomodoroState?.accumulatedCoins ?? 0 : ...`
    `earnedXp = isPomodoro ? session.pomodoroState?.accumulatedXp ?? 0 : ...`
  - **Bản chất của `pomodoroState.accumulatedCoins / accumulatedXp` ở `POMODORO_COUNTDOWN`:** Đây là **phần thưởng DỰ KIẾN cho toàn bộ phiên nếu hoàn thành 100%**, KHÔNG phải số đã cộng vào ví!
    - Trong `src/background/sessionCoordinator.ts` (`startSession`, **dòng 403–406 & 448–449**) và `advancePomodoroStage` (**dòng 1334–1339, 1417–1418**) — cũng như bản simulator `src/ui/services/extensionClient.ts` (**dòng 647–658 & 688–689**) — backend tính sẵn `totalCoins = totalQuestMinutes * 1.5 * lockedMultiplier * coinBonusFactor` và `totalXp = totalQuestMinutes * 5.0 * lockedMultiplier` rồi lưu vào `pomodoroState.accumulatedCoins/Xp` ngay lúc bắt đầu phiên.
    - Khi người dùng bấm **Give Up** (`giveUpCountdown()`, `sessionCoordinator.ts` **dòng 780–803**; `extensionClient.ts` **dòng 920–931**), backend chỉ đổi `status: 'ABANDONED'` và giữ nguyên `...session`, làm giá trị dự kiến trong `pomodoroState.accumulatedCoins/Xp` (ví dụ `+35437.5 Coin / +112500 XP`) bị `TimerView` đọc nhầm thành thưởng thực nhận.
- **Câu mô tả màn kết thúc trước khi sửa (`src/ui/components/TimerView.tsx`, dòng 486–490 cũ):**
  - Nhánh `else if (isPomodoro && completedIntervals > 0)` gọi `t('timer.outcome.pomoEndedRetainedDesc', { count: completedIntervals })` (`src/i18n/locales/en.ts:224`, `src/i18n/locales/vi.ts:226`: *"Toàn bộ phần thưởng từ {count} pha tập trung hoàn thành đã được lưu an toàn vào ví!"*) cho **cả `POMODORO_COUNTDOWN`** lẫn `POMODORO_STOPWATCH`, bất kể `ABANDONED` hay `INTERRUPTED`.

### (b) Ma trận 4 chế độ × 3 trạng thái kết thúc (Hiện trạng cũ vs. Backend thực tế vs. Sau UX-2)

| Chế độ | Trạng thái | Quyết toán thực tế ở Backend (`SessionCoordinator`) | Hiển thị UI cũ (`TimerView.tsx` trước UX-2) | Hiển thị UI sau UX-2 |
|---|---|---|---|---|
| `COUNTDOWN` | `COMPLETED` | `completeCountdown()` (`1098–1152`): Cộng Coins & XP vào ví + thống kê ngày. | Hiện thưởng từ `targetMinutes × base × mult` + `countdownCompletedDesc`. | **Giữ nguyên.** |
| `COUNTDOWN` | `ABANDONED` | `giveUpCountdown()` (`722–816`): Không truyền `economyDelta` (**0 Coin / 0 XP**); ghi phút thực tế vào daily stats (`coins: 0, xp: 0`). | `+0` / `+0`, `endedEarlyDesc`. | **Giữ nguyên** (`0` Coin / `0` XP, `endedEarlyDesc`). |
| `COUNTDOWN` | `INTERRUPTED` | Recovery (`1167–1230`, `1689–1729`): **0 Coin / 0 XP**; ghi `lastKnownValidFocusMinutes` vào daily stats. | `+0` / `+0`, `endedInterruptedDesc`. | **Giữ nguyên** (`0` Coin / `0` XP, `endedInterruptedDesc`). |
| `POMODORO_COUNTDOWN` | `COMPLETED` | `advancePomodoroStage()` (`1343–1380`): Cộng thưởng **1 lần duy nhất** khi đủ 100% pha & chu kỳ. | Đọc `accumulatedCoins/Xp`, `pomoCompletedDesc`, `N (Xm)`. | **Giữ nguyên.** |
| `POMODORO_COUNTDOWN` | `ABANDONED` | `giveUpCountdown()` (`722–816`): **0 Coin / 0 XP** (`economyDelta` không truyền); giữ nguyên `accumulatedCoins/Xp` cũ; ghi phút thực tế vào daily stats. | **SAI:** Đọc `accumulatedCoins/Xp` dự kiến (`+35437.5 / +112500`); nếu `completedIntervals > 0` hiện `pomoEndedRetainedDesc` (*"đã lưu vào ví!"*); cột pha hiện `N (Xm)`. | **Đã sửa:** Cứng **`+0` Coin / `+0` XP**, cột pha **`N / total (Xm)`** (nếu đủ config), mô tả **`pomoCountdownIncompleteDesc`** (EN/VI). |
| `POMODORO_COUNTDOWN` | `INTERRUPTED` | Recovery (`1394–1478`, `1689–1729`): **0 Coin / 0 XP**; backend reset `accumulatedCoins/Xp = 0`; ghi `totalActualMinutes` vào daily stats. | **SAI phần mô tả & phụ thuộc snapshot:** nếu `completedIntervals > 0` hiện `pomoEndedRetainedDesc` (*"đã lưu vào ví!"*) dù thưởng = `0`. | **Đã sửa:** Cứng **`+0` Coin / `+0` XP** (không đọc field tích lũy), **`N / total (Xm)`**, **`pomoCountdownIncompleteDesc`**. |
| `STOPWATCH` | `COMPLETED` | `finishStopwatch()` (`997–1091`): `< 5m` = 0; `>= 5m` = cộng thưởng thực tế. | Hiện `focusMinutes × base × mult` + `stopwatchCompletedDesc`. | **Giữ nguyên.** |
| `STOPWATCH` | `ABANDONED` | Không hỗ trợ (`giveUpCountdown()` dòng `734` ném lỗi). | Fallback `+0` / `+0`, `endedEarlyDesc`. | **Giữ nguyên.** |
| `STOPWATCH` | `INTERRUPTED` | Recovery (`1252–1309`, `1772–1808`): **0 Coin / 0 XP**; ghi `validMinutes` vào daily stats (`lifecycleRecovery.test.ts:159-160`). | `+0` / `+0`, `endedInterruptedDesc`. | **Giữ nguyên.** *(Đã đồng bộ `PRODUCT_SPEC.md` mục 9).* |
| `POMODORO_STOPWATCH` | `COMPLETED` | `finishStopwatch()` (`859–995`): Cộng thưởng các pha hoàn thành trọn vẹn (`completedIntervals × duration`). | Đọc `accumulatedCoins/Xp`, `pomoCompletedDesc`. | **Giữ nguyên.** |
| `POMODORO_STOPWATCH` | `ABANDONED` | *(Lưu ý sai khác biên)* Giao diện không có nút Give Up (chỉ có `"Kết thúc"` → `COMPLETED`), nhưng `giveUpCountdown()` (`732`) vẫn nhận mode này và trả **0 `economyDelta`** trong khi giữ nguyên `accumulatedCoins/Xp`. | Đọc `accumulatedCoins/Xp` và `pomoEndedRetainedDesc` nếu `completedIntervals > 0`. | **Giữ nguyên theo quy tắc #4** *(báo cáo sai khác biên, không tự đổi `POMODORO_STOPWATCH`)*. |
| `POMODORO_STOPWATCH` | `INTERRUPTED` | Có 2 nhánh: (1) `BROWSER_CLOSED` (`1312–1391`): **trao thưởng** các pha đã hoàn thành (`economyDelta`); (2) `EXTENSION_DISABLED/RELOADED` (`1730–1771`): **0 `economyDelta`** và zero `accumulatedCoins/Xp`. | Đọc `accumulatedCoins/Xp` và hiện `pomoEndedRetainedDesc` nếu `completedIntervals > 0` *(sai khác nhẹ ở nhánh `EXTENSION_DISABLED` nếu `completedIntervals > 0`: hiện `+0` nhưng câu chữ vẫn nói `"đã lưu vào ví"`).* | **Giữ nguyên nhánh chuẩn `BROWSER_CLOSED` & toàn bộ code `POMODORO_STOPWATCH` theo quy tắc #4** *(chỉ báo cáo sai khác ở nhánh `EXTENSION_DISABLED`).* |

### (c) Xác nhận `economy` (`focusCoins`, `totalXP`, `level`) sau Give Up / Interrupted trên `POMODORO_COUNTDOWN`
- Đã kiểm tra mã nguồn `sessionCoordinator.ts` (**dòng 722–816, 1394–1478, 1689–1729**) và bổ sung test hồi quy thực thi `SessionCoordinator` tại **`__tests__/background/ux2PomodoroCountdownSettlement.test.ts`**:
  - Ví seeded `focusCoins: 55.5, totalXP: 1035, level: 5` vẫn **giữ nguyên tuyệt đối `55.5 / 1035 / Lv. 5`** sau khi hoàn thành `2/10` pha (`180m`) rồi gọi `giveUpCountdown()`, trong khi `fq_daily_stats` vẫn ghi `totalFocusMinutes: 180, coinsEarned: 0, xpEarned: 0, abandonedSessions: 1`.
  - Tương tự khi `EXTENSION_RE_ENABLED` ngắt giữa phiên sau `1` pha (`15m`), `economy` không thay đổi và `dailyStats` ghi nhận `15m` với `0` thưởng.
  - Khi hoàn thành đủ `100%` (`2/2` pha = `30m`), `economy` chỉ được cộng đúng **1 lần duy nhất** (`+54 Coin, +180 XP`), chống cộng trùng khi alarm chạy lại.

### (d) Nhãn thưởng khi phiên `POMODORO_COUNTDOWN` đang chạy (`STATE 2`)
- Trước khi sửa (`src/ui/components/TimerView.tsx`, dòng 798–810 cũ; `en.ts:173`; `vi.ts:175`):
  - Chỉ hiển thị `timer.liveReward.totalLabel` = `"Total Reward:"` / `"Tổng thưởng:"` ngay trước số Coin/XP cả phiên và chip hệ số (`×2.5`), **không** nói rõ đó là phần thưởng **dự kiến** và **chỉ nhận khi hoàn thành 100% tất cả pha và chu kỳ**.

---

## 2. CÁC THAY ĐỔI ĐÃ THỰC HIỆN TRONG UX-2

1. **Màn hình kết thúc (`src/ui/components/TimerView.tsx` s.415–549, `en.ts`, `vi.ts`):**
   - Tách riêng `isPomoCountdown` và `isPomoStopwatch`.
   - Với `POMODORO_COUNTDOWN` ở trạng thái `ABANDONED` hoặc `INTERRUPTED`: `earnedCoins = 0` và `earnedXp = 0` cứng theo quyết toán thực tế, tuyệt đối không đọc `pomodoroState.accumulatedCoins/Xp`.
   - Ô `"Số pha hoàn thành"` / `"Completed Intervals"` hiển thị `N / total (Xm)` khi `pomodoroConfig` có đủ `intervalsPerCycle` và `numberOfCycles` (ví dụ `2 / 10 (180m)`), fallback an toàn về `N (Xm)` nếu thiếu config.
   - Câu mô tả dùng key mới `timer.outcome.pomoCountdownIncompleteDesc`:
     - **VI:** `"Bạn chưa hoàn thành tất cả các pha và chu kỳ nên không nhận phần thưởng. Thời gian tập trung của bạn vẫn được ghi vào thống kê."`
     - **EN:** `"You did not finish all phases and cycles, so no reward was earned. Your focus time is still recorded in your stats."`
   - Màn `COMPLETED` và `POMODORO_STOPWATCH` giữ nguyên không thay đổi.
2. **Nhãn thưởng khi đang chạy (`src/ui/components/TimerView.tsx` s.827–902, `en.ts`, `vi.ts`):**
   - Đổi `timer.liveReward.totalLabel` thành `timer.liveReward.projectedLabel`: `"Projected Reward:"` (EN) / `"Thưởng dự kiến:"` (VI).
   - Bổ sung dòng chú thích `data-testid="pomo-countdown-all-or-nothing-note"` (`timer.liveReward.pomoAllOrNothingNote`): `"earned only upon completing all phases & cycles"` (EN) / `"nhận khi hoàn thành tất cả pha và chu kỳ"` (VI).
   - Kiểm tra 100% key parity EN/VI: **428 / 428 khóa khớp tuyệt đối**.
3. **Cập nhật tài liệu đặc tả (`PRODUCT_SPEC.md`):**
   - **Đầu tài liệu (dòng 3–6):** Nâng version sync `1.4.1-synced` (`Synced through Milestone UX-2`).
   - **Mục 5.3 (`Pomodoro Countdown`, dòng 72):** Làm rõ quy tắc quyết toán 1 lần khi hoàn thành 100% toàn bộ pha và chu kỳ, con số khi đang chạy là **Thưởng dự kiến**, Give Up/gián đoạn hiển thị `+0` Coin / `+0` XP và lưu số phút hợp lệ vào `fq_daily_stats`.
   - **Mục 9 (`Xử lý Gián đoạn`, dòng 150–153):** Bổ sung rõ trường hợp `Pomodoro Countdown gián đoạn` (`0` Coins/XP, lưu phút vào daily stats), đồng bộ quy tắc thực tế của `Stopwatch gián đoạn` (`0` Coins/XP) và tách rõ `Pomodoro Stopwatch gián đoạn` (`BROWSER_CLOSED` giữ pha hoàn thành vs `EXTENSION_DISABLED/RELOADED` = 0).

---

## 3. KIỂM THỬ MỚI & CÁC TEST CŨ ĐÃ CẬP NHẬT

- **Test UI mới (`__tests__/ui/ux2PomodoroOutcomeDisplay.test.ts` — 4 tests):**
  1. `POMODORO_COUNTDOWN` `ABANDONED` sau `N` pha hiển thị `+0` / `+0`, `N / total (Xm)`, mô tả đúng (EN & VI), không chứa `"safely retained in your wallet"` / `"được lưu an toàn vào ví"` hay `"35437.5"`.
  2. `POMODORO_COUNTDOWN` `ABANDONED` ở `0` pha và `INTERRUPTED` sau `N` pha đều hiển thị `+0` / `+0`, mô tả không nhận thưởng, fallback `N (Xm)` khi thiếu `numberOfCycles`.
  3. Bảo toàn `COUNTDOWN` `ABANDONED`/`INTERRUPTED`, `COMPLETED` của mọi chế độ và `POMODORO_STOPWATCH` `INTERRUPTED` (`BROWSER_CLOSED`).
  4. Nhãn chạy `POMODORO_COUNTDOWN` hiển thị `"Projected Reward:"` / `"Thưởng dự kiến:"` + ghi chú all-or-nothing và parity 100% EN/VI.
- **Test Background hồi quy (`__tests__/background/ux2PomodoroCountdownSettlement.test.ts` — 2 tests):**
  1. `POMODORO_COUNTDOWN` hoàn thành `2/10` pha (`180m`) rồi `giveUpCountdown()` giữ nguyên `economy` (`55.5 Coin, 1035 XP, Lv. 5`) và ghi `180m, 0 coins, 0 xp` vào `dailyStats`.
  2. `POMODORO_COUNTDOWN` bị `EXTENSION_RE_ENABLED` sau `1` pha giữ nguyên `economy`; hoàn thành đủ `100%` cộng thưởng đúng 1 lần duy nhất.
- **Test UI cũ đã cập nhật assertion có chủ đích** *(do đổi nhãn chạy `POMODORO_COUNTDOWN` từ `"Total Reward:"` sang `"Projected Reward:"`)*:
  1. `__tests__/ui/focusRunningFixes5b3.test.ts` (dòng **171, 213, 256**): đổi `'Total Reward:'` → `'Projected Reward:'` (+ kiểm tra ghi chú all-or-nothing ở dòng 172).
  2. `__tests__/ui/focusRunningView.test.ts` (dòng **319**): đổi `'Total Reward:'` → `'Projected Reward:'` + kiểm tra `data-testid="pomo-countdown-all-or-nothing-note"`.
  3. `__tests__/ui/startFocusView.test.ts` (dòng **207**): đổi `'Total Reward:'` → `'Projected Reward:'` + kiểm tra `data-testid="pomo-countdown-all-or-nothing-note"`.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,738 modules transformed`, `775ms`, tổng dung lượng `dist/`: `1,078,018 B`):
  - `dist/index.html`: `0.71 kB` | `dist/assets/popup-BFp-OSd4.css`: `87.75 kB`
  - `dist/assets/popup-KA70q5OR.js`: `760.87 kB` (gzip: `200.79 kB`)
  - `dist/assets/translator-B5-w4v6G.js`: `52.47 kB` | `dist/assets/statsAggregator-DM7wxVkB.js`: `53.96 kB` | `dist/assets/storageKeys-BmLuJ1Do.js`: `0.37 kB`
  - `dist/background.js`: `87.39 kB` | `dist/offscreen.js`: `3.87 kB` | `dist/blocked.js`: `1.32 kB`
- **`npm test` — chạy 3 lần liên tiếp (tất cả sau lần sửa code & test cuối cùng):**
  - **Lần 1:** `551 / 551 PASS` (`0` fail, `0` skipped, `0` cancelled, `13,899.21 ms`, Exit `0`).
  - **Lần 2:** `551 / 551 PASS` (`0` fail, `0` skipped, `0` cancelled, `14,336.86 ms`, Exit `0`).
  - **Lần 3:** `551 / 551 PASS` (`0` fail, `0` skipped, `0` cancelled, `14,654.21 ms`, Exit `0`).

---

## 5. GIỚI HẠN KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Toàn bộ UI test chạy bằng **React SSR (`renderToString`)** và backend test chạy trên mock Chrome adapters trong Node.js; **chưa chạy thử trực tiếp trên extension Chrome (`400×600` popup thật)**.
- **Hướng dẫn tự kiểm trên Chrome (`chrome://extensions` → Load unpacked `dist/`):**
  1. Bật **Chế độ Pomodoro → Chu kỳ Đếm ngược (`Pomodoro Countdown`)**, kiểm tra cả **EN** và **VI**, bấm **Bắt đầu phiên Pomodoro**.
  2. Trên màn hình đang chạy, xác nhận dòng thưởng hiển thị **`Thưởng dự kiến: ... Coin, ... XP [×...]`** kèm ghi chú **`(nhận khi hoàn thành tất cả pha và chu kỳ)`** nằm gọn gàng trong khung `400×600` (không bị tràn/cắt). Kiểm tra header thấy số dư ví chưa thay đổi.
  3. Để mô phỏng Give Up giữa chừng: bấm **Bỏ cuộc (`Give Up`)** ngay ở pha 1 (hoặc sau khi hoàn thành `1–2` pha ngắn) → xác nhận:
     - Màn kết thúc hiển thị **Số pha hoàn thành** dạng `0 / total (0m)` hoặc `N / total (Xm)`.
     - Ô **Phần thưởng** hiển thị **`+0` Coin / `+0` XP**.
     - Mô tả hiển thị đúng: *"Bạn chưa hoàn thành tất cả các pha và chu kỳ nên không nhận phần thưởng. Thời gian tập trung của bạn vẫn được ghi vào thống kê."*
     - Kiểm tra header (Coin / XP / Level) **không đổi** so với trước khi bắt đầu phiên; bấm **Thoát (`Exit`)** rồi sang tab **Thống kê (`Stats`)** để xác nhận số phút thực tế vẫn được cộng.
  4. Kiểm tra trường hợp **gián đoạn (`INTERRUPTED`)**: mở một phiên Pomodoro Countdown, bật/tắt lại extension trong `chrome://extensions` rồi mở lại popup → xác nhận màn kết thúc hiện **`+0` Coin / `+0` XP** và câu mô tả chưa hoàn thành (không còn câu *"đã được lưu an toàn vào ví"*).
  5. Kiểm tra nhanh lại **Countdown** (`Give Up` → `+0 / +0`), **Stopwatch**, và **Pomodoro Stopwatch** (`Kết thúc` sau >= 1 pha → vẫn cộng thưởng và hiển thị đúng như trước).
