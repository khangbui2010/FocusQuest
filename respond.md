# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-6

**Giai đoạn:** Milestone UX — Giai đoạn UX-6 *(Đóng băng số phút tập trung & phần thưởng trên màn kết thúc phiên đã xong — KHÔNG thuộc Phase 5, 5B.5 hay Milestone LOFI)*  
**Ngày hoàn thành:** 2026-11-19  
**File sao lưu báo cáo cũ:** `/respond_ux6_prev.md` *(sao lưu nguyên vẹn báo cáo Stage 6 + 7 trước khi ghi đè; giữ nguyên toàn bộ các bản `respond_*_prev.md` trước đó)*  
**Trạng thái:** **`609 / 609` tests PASS 3/3 lần** | **`npm run lint` (`tsc --noEmit`) PASS (`0` errors)** | **`npm run clean && npm run build` PASS (`1,208,670 B` / `26` tệp, `696ms`)** — **DỪNG CHỜ DUYỆT GIAI ĐOẠN UX-6**

---

## 1. BƯỚC 0 — KIỂM TOÁN HIỆN TRẠNG & XÁC MINH NGUYÊN NHÂN GỐC

### 1.1. Bước 0a — Các điểm đọc thời gian / phút tập trung / phần thưởng của phiên đã kết thúc (`src/`)

| Điểm trong mã nguồn | Hành vi TRƯỚC UX-6 | Rủi ro khi để màn tổng kết qua Machine Sleep | Xử lý SAU UX-6 |
|---|---|---|---|
| `src/ui/components/TimerView.tsx:297-312` | `useEffect` mở `setInterval(() => setCurrentTime(Date.now()), 1000)` vô điều kiện bất kể `session.status`. | Khi mở lại popup sau Sleep ở `ABANDONED`/`COMPLETED`/`INTERRUPTED`, `currentTime` nhảy lên `Date.now()` mới. | Khóa `setInterval` sau `isActiveTimer` (`RUNNING` \| `PAUSED`); `IDLE` và mọi trạng thái kết thúc hoàn toàn không chạy ticker. |
| `src/ui/components/TimerView.tsx:328-365` | `TimeCalculator.calculateElapsedTime` nhận `currentTime` đồng hồ thật và chưa có `completedAt`. | `actualFocusMs = Date.now() - startedAt - totalPauseMs` phình to theo thời gian máy Sleep (ví dụ +4h → `245m`). | Thêm `effectiveCurrentTime` (`resolveSessionEndTimestamp(session)` khi terminal, `0` khi `IDLE`), truyền `completedAt: session.completedAt`, bỏ `currentPauseStartedAt`, đặt `pomodoroPhaseCalc = null`. |
| `src/ui/components/TimerView.tsx:453-466` | `focusMinutes` chỉ đọc `lastKnownValidFocusMinutes` khi `INTERRUPTED`, mọi nhánh `ABANDONED` / `STOPWATCH COMPLETED` đọc `elapsed.actualFocusMinutes`. | `COUNTDOWN ABANDONED` hay `STOPWATCH COMPLETED` đều bị đếm tiếp qua `Date.now()` sau Sleep hoặc chênh trên Pomodoro/Stopwatch. | Đọc trực tiếp Single Source of Truth `getFrozenSessionFocusMinutes(session)`; Pomodoro `totalPomoFocusMins` giữ nguyên `pomodoroState?.totalCompletedFocusMinutes ?? focusMinutes` (bảo toàn UX-2 & Backlog 4a). |
| `src/core/reward/rewardPreview.ts:407-432` | `getSessionRewardPreviewFromSnapshot(session, options?)` nếu không truyền `actualFocusMinutes` thì fallback `0` cho `STOPWATCH COMPLETED`. | Caller trực tiếp trên terminal `STOPWATCH` không truyền `actualFocusMinutes` sẽ tính sai reward (`+0`). | Khi `options?.actualFocusMinutes === undefined` và `isTerminalSessionStatus(session.status)` đúng, tự động phân giải qua `getFrozenSessionFocusMinutes(session)`. |
| `src/core/quests/questEngine.ts:713` | `toQuestOutcomeDelta` dùng `endTime = session.completedAt ?? session.lastHeartbeatAt` cho `STOPWATCH COMPLETED`. | Đã an toàn (không dùng `Date.now()`). | Giữ nguyên 100%, không sửa Quest Engine. |
| `src/core/reward/rewardEngine.ts:151` | `processRewardWithIdempotencyGuard` chỉ dùng fallback `Date.now()` nếu thiếu `completedAt` và `!rewardProcessed`. | Không kích hoạt ở luồng bình thường (`rewardProcessed: true` & có `completedAt`). | Giữ nguyên 100%, không sửa Reward Engine. |

### 1.2. Bước 0b — Kiểm toán mọi nhánh kết thúc trong `SessionCoordinator` (`src/background/sessionCoordinator.ts`)

| Nhánh kết thúc | Vị trí dòng | Trường đóng băng được ghi | Giá trị khớp `dailyStatDelta.focusMinutes`? |
|---|---|---|---|
| `giveUpCountdown()` (`COUNTDOWN` / `POMODORO_*` → `ABANDONED`) | `:815-824` | `completedAt: now`, `finalFocusMinutes: focusMinutesToRecord`, `currentPauseStartedAt: null` | Khớp 100% (`focusMinutesToRecord`, kể cả khi Give Up từ `PAUSED`). |
| `finishStopwatch()` (`POMODORO_STOPWATCH` → `COMPLETED`) | `:968-987` | `completedAt: now`, `finalFocusMinutes: actualFocusMinutes`, `pomodoroState.totalCompletedFocusMinutes: rewardFocusMinutes` | Khớp 100% (`actualFocusMinutes`). |
| `finishStopwatch()` (`STOPWATCH` → `COMPLETED`) | `:1068-1078` | `completedAt: now`, `finalFocusMinutes: actualFocusMinutes` | Khớp 100% (`actualFocusMinutes`, kể cả nhánh `accumulatedFocusMs` checkpoint). |
| `completeCountdown()` (`COUNTDOWN` → `COMPLETED`) | `:1178-1185` | `completedAt: now`, `finalFocusMinutes: session.targetMinutes` | Khớp 100% (`session.targetMinutes`, kể cả khi wake trễ hơn target). |
| `advancePomodoroStage()` (`POMODORO_COUNTDOWN` 100% → `COMPLETED`) | `:1417-1436` | `completedAt: now`, `finalFocusMinutes: plannedFocusMinutes` | Khớp 100% (`plannedFocusMinutes`). |
| `handleExtensionDisabledRecovery()` (`COUNTDOWN`/`POMO_CD`/`POMO_SW`/`STOPWATCH` → `INTERRUPTED`) | `:1764-1782`, `:1808-1825`, `:1851-1862` | `completedAt: now`, `lastKnownValidFocusMinutes: validMinutes`, `finalFocusMinutes: validMinutes`, `currentPauseStartedAt: null` | Khớp 100% (`validMinutes`). |
| `handleBrowserStartupRecovery()` (`COUNTDOWN`/`STOPWATCH`/`POMO_SW`/`POMO_CD` → `INTERRUPTED`) | `:2408-2419`, `:2488-2499`, `:2557-2575`, `:2650-2668` | `completedAt: now`, `lastKnownValidFocusMinutes`, `finalFocusMinutes` | Khớp 100% (`validMinutes` / `totalActualMinutes`). |
| Web Preview Simulator (`src/ui/services/extensionClient.ts`) | `:632-639`, `:841-859`, `:1029-1078`, `:1203-1215` | Bổ sung `finalFocusMinutes` mọi nhánh + vá `GIVE_UP_SESSION` khi đang `PAUSED` (`finalizePause`, `currentPauseStartedAt: null`, `pauseExpiresAt: null`). | Đồng bộ parity 100% với `SessionCoordinator`. |

### 1.3. Bước 0c — Idempotency khi Re-entry / Wake / Restart nhiều giờ sau khi kết thúc
- `executeLifecycleRecovery()` (`src/background/sessionCoordinator.ts:1981-1987`): Khi `TimerStateMachine.isTerminal(session.status)` đúng, chỉ dọn blocking/badge/lifecycle marker và chạy `triggerSessionSyncHookInternal`, **tuyệt đối không** chuyển trạng thái lại hay gọi `commitSessionOutcomeInternal`.
- `getFullState()` và các transition guards (`rewardProcessed || status === 'COMPLETED'`) bảo toàn `completedAt` và `finalFocusMinutes` nguyên vẹn qua nhiều lần wake/startup (`ux6TerminalOutcomeFreeze.test.ts` test 4 xác nhận 0 thay đổi economy/dailyStats sau +6h wake + startup + `getFullState`).

### 1.4. Bước 0d — Bất biến UI màn kết thúc, `Exit` & Điều hướng (`App.tsx`, `sessionNavigation.ts`, `TimerView.tsx`)
- `isInFocusSession(session)` (`src/ui/utils/sessionNavigation.ts:24-26`): Vẫn giữ tab khóa ở `'focus'` và ẩn `<Navbar />` trên mọi trạng thái kết thúc tới khi người dùng bấm `Exit` / `Thoát` (`outcome-exit-btn`).
- Bấm `Exit` vẫn gọi `executeExitSessionAction` → `RESET_SESSION` → `refreshState()` → chuyển về `'map'` và giữ hiển thị lỗi + cho phép retry nếu lỗi (`ux1SessionNavigationAndProfile.test.ts` & `ux6TerminalOutcomeFreeze.test.ts`).

---

## 2. CHI TIẾT THAY ĐỔI MÃ NGUỒN (UX-6)

1. **`src/types/session.ts` (`line 79`) — Giải trình trường OPTIONAL:**
   - Thêm `finalFocusMinutes?: number;` vào `SessionSnapshot`, **giữ nguyên `CURRENT_SCHEMA_VERSION = 3` và `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2`**.
   - *Lý do thật sự cần thiết:* Số phút đóng băng ở vài nhánh không trùng `Math.floor((completedAt - startedAt - totalPauseMs) / 60000)` — ví dụ: `COUNTDOWN COMPLETED` đánh thức trễ (chốt `targetMinutes` chứ không vượt target), `STOPWATCH` phục hồi từ `accumulatedFocusMs` khi đồng hồ hệ thống lùi, hoặc `INTERRUPTED BROWSER_CLOSED` (chốt tại `lastCheckpointAt`/`lastHeartbeatAt` trước lúc trình duyệt đóng chứ không gồm thời gian đóng máy). Trường optional đảm bảo khớp bit-exact với `dailyStatDelta.focusMinutes` mà vẫn tương thích ngược 100% với dữ liệu lưu cũ trong `chrome.storage.local` chưa có trường này.
2. **`src/core/timer/timeCalculator.ts` (`lines 27-131`, `299-359`):**
   - Xuất `isTerminalSessionStatus(status)`, `resolveSessionEndTimestamp(session, liveCurrentTime?)` (không bao giờ rơi về `Date.now()` cho phiên kết thúc), và `getFrozenSessionFocusMinutes(session)` (thứ tự ưu tiên: `finalFocusMinutes` → `lastKnownValidFocusMinutes` khi `INTERRUPTED` → `targetMinutes` khi `COUNTDOWN COMPLETED` → `lastKnownValidFocusMinutes` khác → fallback `TimeCalculator.calculateElapsedTime` tại `resolveSessionEndTimestamp(session)` có trừ `currentPauseStartedAt` chưa finalize và chặn trần `targetMinutes` nếu `COUNTDOWN` cũ thiếu `completedAt`).
   - Mở rộng `TimeCalculator.calculateElapsedTime` nhận `completedAt?: number | null`, khóa `effectiveEndTime` tại `completedAt` với phiên terminal và không kích hoạt `isAutoResumeDue` trên snapshot terminal.
3. **`src/core/reward/rewardPreview.ts` (`lines 11-14`, `407-432`):**
   - `getSessionRewardPreviewFromSnapshot` tự động phân giải `actualFocusMinutes = getFrozenSessionFocusMinutes(session)` cho mọi phiên terminal khi caller không truyền tham số thủ công.
4. **`src/ui/components/TimerView.tsx` (`lines 31-37`, `295-365`, `453-466`):**
   - Chặn `setInterval` ticker khi `session` không phải `RUNNING`/`PAUSED`.
   - Tính `elapsed` theo `effectiveCurrentTime` đóng băng + `completedAt: session.completedAt`, vô hiệu hóa `pomodoroPhaseCalc` và dùng `getFrozenSessionFocusMinutes(session)` cho `focusMinutes` màn tổng kết.
5. **`src/background/sessionCoordinator.ts` (`12` nhánh terminal) & `src/ui/services/extensionClient.ts`:**
   - Ghi đồng nhất `finalFocusMinutes` trên toàn bộ nhánh `ABANDONED`, `COMPLETED`, `INTERRUPTED` (kể cả `handleExtensionDisabledRecovery` & `handleBrowserStartupRecovery`) mà **không sửa** công thức thưởng, thời điểm quyết toán, LOFI hooks hay transaction mutex.
   - Vá simulator `GIVE_UP_SESSION` trong `extensionClient.ts` để finalize pause đang mở và dọn `currentPauseStartedAt: null` khớp `SessionCoordinator`.
6. **`__tests__/ui/ux6TerminalOutcomeFreeze.test.ts` (`4` tests mới):**
   - Test 1: Repro chính bug báo cáo (`COUNTDOWN` `ABANDONED` từ `RUNNING` +5m và từ `PAUSED` +7m focus / 2m pause → +4h / +5h Sleep → UI & `PopupShell` giữ nguyên `5m` / `7m`, không `245m` / `307m`, `+0` thưởng, còn nút `Exit` / `Thoát`, ẩn `Navbar`).
   - Test 2: Toàn bộ 4 mode (`STOPWATCH COMPLETED`, `COUNTDOWN COMPLETED` wake trễ +3m, `POMODORO_COUNTDOWN ABANDONED`, `POMODORO_STOPWATCH COMPLETED`) giữ nguyên phút, `completedIntervals (Xm)`, và Coin/XP sau +6h Sleep.
   - Test 3: `INTERRUPTED` (`BROWSER_CLOSED` 120m downtime vẫn giữ `12m`), snapshot cũ thiếu `finalFocusMinutes`, snapshot terminal còn `currentPauseStartedAt`, Stopwatch cũ thiếu `finalFocusMinutes`, snapshot hỏng thiếu cả `completedAt` và `finalFocusMinutes`, và hợp đồng `TimeCalculator.calculateElapsedTime` + `completedAt`.
   - Test 4: Idempotency sau +6h Sleep qua `SERVICE_WORKER_WAKE`, `BROWSER_STARTUP`, `getFullState` (không đổi economy/stats/session) + kiểm tra parity simulator `PAUSE_SESSION` → `GIVE_UP_SESSION`.

---

## 3. KẾT QUẢ CHẠY LỆNH XÁC MINH CUỐI (SAU MỌI CHỈNH SỬA)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (Exit code `0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (Exit code `0`, Vite `v8.3.8`, `1,754 modules transformed`, **`696ms`**, **`26` tệp**, **`1,208,670 B`**, `0` file audio).
- **`npm test` (`tsx --test`) — 3 lần chạy liên tiếp:**
  - **Lần 1:** **`609 / 609` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,200.78 ms`**)
  - **Lần 2:** **`609 / 609` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,597.02 ms`**)
  - **Lần 3:** **`609 / 609` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,271.49 ms`**)

---

## 4. HƯỚNG DẪN KIỂM CHỨNG THỦ CÔNG TRÊN CHROME THẬT (UX-6)

1. Nạp bản build mới nhất tại `/dist` (`chrome://extensions` → **Reload** extension).
2. Bắt đầu phiên **Countdown 25 phút**, đợi qua **3–5 phút** (thử cả trường hợp để chạy liên tục lẫn trường hợp đang **Pause**), rồi bấm **Give Up** → xác nhận màn kết thúc hiển thị đúng số phút tập trung (`3m`/`5m`) và `+0` Coin / `+0` XP.
3. **Không bấm Exit / Thoát**: đóng popup hoặc giữ nguyên, cho máy **Sleep** (hoặc khóa máy ngủ 15–30 phút rồi đánh thức lại).
4. Mở lại biểu tượng extension **Focus Quest**: xác nhận màn tổng kết vẫn khóa đúng số phút ban đầu (`3m`/`5m`), đồng hồ không chạy thêm, không tự thoát về Bản đồ; sau đó bấm **Exit / Thoát** để xác nhận trở về tab **Map** sạch sẽ.

---

**DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU VÀ DUYỆT GIAI ĐOẠN UX-6.**
