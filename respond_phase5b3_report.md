# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 5b-3: SỬA 3 LỖI SAU 5b-2

**Ngày hoàn thành:** 14/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 5b-3** theo **ĐC-10** trong `respond_plan_5B.5.md` (`5b-3 → 4a → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`).

---

## 1. Tóm tắt
- Đã sao lưu báo cáo Giai đoạn 5b-2 sang `respond_phase5b2_report.md` và cập nhật **ĐC-10** vào `respond_plan_5B.5.md` (giữ nguyên mọi file `respond_*.md` trước đó).
- **Lỗi 1 (Nút `Skip Break & Start Next Focus` không hoạt động):** Tách helper `skipPomodoroBreakAction` (`src/ui/services/sessionActions.ts`), nối handler `handleSkipBreak` từ `src/App.tsx` xuống prop mới `onSkipBreak` của `<TimerView />` mà không truyền `onAdvancePomodoroStage` cho nhánh tự động hết giờ; đồng thời tách guard `SKIP_POMODORO_BREAK` trong simulator (`src/ui/services/extensionClient.ts`) để khớp `MessageHandler.ts`.
- **Lỗi 2 (`Total Reward: 0 Coin, 0 XP` ở `POMODORO_COUNTDOWN`):** Khôi phục việc tính và gán `accumulatedCoins` / `accumulatedXp` ngay lúc `START_SESSION` trong simulator (`extensionClient.ts`), chuẩn hóa `pomodoroConfig` qua `TimeCalculator.validatePomodoroConfig`, giữ nguyên tổng thưởng planned trong `ADVANCE_POMODORO_STAGE` khi hoàn thành Focus, và bổ sung fallback an toàn trong `TimerView.tsx` khi `accumulatedCoins`/`accumulatedXp` bằng `0` ở chế độ `POMODORO_COUNTDOWN`.
- **Lỗi 3 (`FocusSceneArea` chỉ vẽ ~55% phía trên khung):** Chuyển `<svg>` trong `src/ui/components/FocusSceneArea.tsx` sang định vị tuyệt đối phủ toàn bộ khung (`absolute inset-0 w-full h-full`), mở rộng `viewBox="0 0 360 220"` (`preserveAspectRatio="xMidYMax slice"`) và kéo dải đồi/nền cỏ/nền đất xuống tới đáy `y=220` để lấp đầy dù khung cao `160px` hay `~300px`.

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (3 files)
1. `respond_phase5b2_report.md` — Bản lưu báo cáo Giai đoạn 5b-2.
2. `src/ui/services/sessionActions.ts` — Helper `skipPomodoroBreakAction(refreshState, sendMessage)` (`21` dòng) gửi `SKIP_POMODORO_BREAK`, luôn làm mới state và ném `Error` khi backend trả `!res.success`.
3. `__tests__/ui/focusRunningFixes5b3.test.ts` — Bộ `8` unit tests mới cho cả 3 lỗi (`334` dòng).

### File chỉnh sửa (5 files)
1. `respond_plan_5B.5.md` — Bổ sung **ĐC-10** chèn `5b-3` trước `4a` và cập nhật Mục J.
2. `src/App.tsx` — Import `skipPomodoroBreakAction`, thêm `handleSkipBreak` (`342–344`) và truyền `onSkipBreak={handleSkipBreak}` vào `<TimerView />` (`191`) trong `PopupShell`.
3. `src/ui/components/TimerView.tsx` — Thêm prop tùy chọn `onSkipBreak?: () => Promise<void>`; nối nút `skip-break-btn` sang `(onSkipBreak ?? onAdvancePomodoroStage)?.() ?? Promise.resolve()` (`821–823`); đổi fallback `pomoCdTotalCoins`/`pomoCdTotalXp` sang kiểm tra `> 0` (`576–586`).
4. `src/ui/services/extensionClient.ts` — Cập nhật simulator cho `START_SESSION` (`184–259`) và tách `SKIP_POMODORO_BREAK` / `ADVANCE_POMODORO_STAGE` (`261–348`).
5. `src/ui/components/FocusSceneArea.tsx` — Neo tuyệt đối `<svg>` phủ kín khung và mở rộng `viewBox`/`path` tới `y=220` (`102–215`).

### File xóa
- Không xóa file nguồn nào (chỉ dọn `dist/` qua `npm run clean` khi build).

---

## 3. Phân tích từng lỗi (Nguyên nhân gốc, Cách sửa & Bằng chứng)

### Lỗi 1 — Nút `Skip Break & Start Next Focus` bấm không có tác dụng
- **Nguyên nhân gốc:** `src/App.tsx` không truyền `onAdvancePomodoroStage` (hay handler skip break nào) xuống `<TimerView />`. Vì vậy khi bấm nút `data-testid="skip-break-btn"`, callback cũ `() => onAdvancePomodoroStage?.() ?? Promise.resolve()` chỉ chạy no-op. Ngoài ra trong simulator (`extensionClient.ts`), `SKIP_POMODORO_BREAK` trước đây gộp chung hoàn toàn với `ADVANCE_POMODORO_STAGE` nên thiếu guard từ chối khi đang ở pha `FOCUS`.
- **Cách sửa:**
  1. Tạo `skipPomodoroBreakAction` gửi `{ action: 'SKIP_POMODORO_BREAK' }`, luôn `await refreshState()`, và `throw new Error(...)` nếu `!res.success` để `handleAction` của `TimerView` hiển thị lỗi nếu có.
  2. Trong `App.tsx`, khai báo `handleSkipBreak` và truyền qua prop riêng `onSkipBreak={handleSkipBreak}` xuống `<TimerView />` (giữ `onAdvancePomodoroStage` ở trạng thái không truyền).
  3. Trong `extensionClient.ts`, thêm guard giống `MessageHandler.ts:145-164`: nếu không có `pomodoroState` hoặc `currentPhase === 'FOCUS'`, `SKIP_POMODORO_BREAK` trả `{ success: false, error: 'Cannot skip break while in Focus phase.' }`.
- **Bằng chứng kiểm chứng:** Test mới trong `__tests__/ui/focusRunningFixes5b3.test.ts` chứng minh: (a) `skipPomodoroBreakAction` gửi đúng `{ action: 'SKIP_POMODORO_BREAK' }`, gọi `refreshState` và propagate error từ backend; (b) simulator từ chối `SKIP_POMODORO_BREAK` trong pha `FOCUS` nhưng chuyển ngay từ `SHORT_BREAK` / `LONG_BREAK` sang pha `FOCUS` tiếp theo (`currentInterval` tăng, hoặc sang `currentCycle + 1` sau `LONG_BREAK`); (c) bấm trên nút `skip-break-btn` chạy đúng khi có `onSkipBreak`.

### Lỗi 2 — Hiển thị `"Total Reward: 0 Coin, 0 XP"` ở chế độ Pomodoro Countdown
- **Xác minh công thức gốc (`rewardEngine.ts`, `multiplierRules.ts`, `sessionCoordinator.ts`):**
  - Trong `DEFAULT_REWARD_CONFIG`: `countdownBaseCoinPerMinute = 1.5`, `countdownBaseXpPerMinute = 5.0`.
  - Theo `SessionCoordinator.startSession` (`sessionCoordinator.ts:275-285`): với `POMODORO_COUNTDOWN`, tổng phút Focus dự kiến = `intervalDuration × focusIntervalsPerCycle × numberOfCycles`, hệ số khóa = `MultiplierRules.getCountdownMultiplier(totalQuestMinutes)` (`multiplierRules.ts:23-49`), thưởng dự kiến toàn phiên (khi `activeBonusRate = 0`):
    - **Cấu hình mặc định (`25m × 4 pha × 3 chu kỳ = 300 phút`):** `MultiplierRules.getCountdownMultiplier(300) = 2.5` (`×2.5`).
      - `Coins = 300 × 1.5 × 2.5 = 1125 Coin`
      - `XP = 300 × 5.0 × 2.5 = 3750 XP`
    - **Cấu hình tùy chỉnh kiểm chứng (`15m × 2 pha × 2 chu kỳ = 60 phút`):** `MultiplierRules.getCountdownMultiplier(60) = 1.4` (`×1.4`).
      - `Coins = 60 × 1.5 × 1.4 = 126 Coin`
      - `XP = 60 × 5.0 × 1.4 = 420 XP`
    - *(Lưu ý hiển thị: `formatRewardAmount` trong `src/ui/utils/formatters.ts` format số nguyên không dấu phẩy hàng nghìn, tức `'1125'`, `'3750'`, không phải `'1,125'`.)*
- **Nguyên nhân gốc của lỗi `0 Coin, 0 XP`:** Trong simulator (`extensionClient.ts`), `START_SESSION` đã tính `lockedMultiplier = 2.5` nhưng gán cứng `accumulatedCoins: 0, accumulatedXp: 0` (và không chạy `TimeCalculator.validatePomodoroConfig` nên có thể thiếu `numberOfCycles: 3`). Phía `TimerView.tsx` trước đó dùng toán tử `pState?.accumulatedCoins ?? fallback`, nên `0 ?? fallback` trả thẳng **`0`**, làm UI hiện `"Total Reward: 0 Coin, 0 XP"` đi kèm badge `"×2.5"`. Đồng thời, nhánh `ADVANCE_POMODORO_STAGE` trong simulator trước đó cũng ghi đè `accumulatedCoins`/`accumulatedXp` bằng thưởng cục bộ sau mỗi interval thay vì giữ nguyên tổng planned reward của `POMODORO_COUNTDOWN`.
- **Cách sửa:**
  1. `extensionClient.ts` (`START_SESSION`): chuẩn hóa `pomodoroConfig` qua `TimeCalculator.validatePomodoroConfig`, tính `initialCoins` & `initialXp` (bao gồm `getCoinBonusMultiplier` từ building Civilization) và lưu vào `pomodoroState.accumulatedCoins` / `accumulatedXp`. Trong `ADVANCE_POMODORO_STAGE`, bảo toàn tổng planned reward và hoàn tất session (`COMPLETED`) khi đủ `totalPlannedIntervals`.
  2. `TimerView.tsx` (`576–586`): nâng cấp phòng vệ từ `??` sang `(pState?.accumulatedCoins && pState.accumulatedCoins > 0 ? pState.accumulatedCoins : fallback)` (tương tự cho `accumulatedXp`).
- **Bằng chứng kiểm chứng:** Unit tests mới kiểm tra end-to-end từ `mockHandleMessage({ action: 'START_SESSION' })` → render `<TimerView />` ra HTML text sạch:
  - Mặc định `25×4×3`: chứa `1125 Coin`, `3750 XP`, `×2.5`.
  - Tùy chỉnh `15×2×2`: chứa `126 Coin`, `420 XP`, `×1.4`.
  - Snapshot cũ/bị `0` truyền trực tiếp vào `<TimerView />`: fallback đúng về `1125 Coin, 3750 XP`.

### Lỗi 3 — `FocusSceneArea` chỉ vẽ khoảng ~55% phía trên, phần dưới trống rỗng
- **Nguyên nhân gốc:** Container `data-testid="focus-scene-area"` dùng `flex-1 min-h-[160px]` (chiều cao thực tế do Flexbox chia khoảng `~295–315px`, không có CSS `height` cố định tường minh), còn `<svg viewBox="0 0 360 160" className="w-full h-full block">` nằm ở normal flow. Khi không có `height` xác định trên flex item hoặc `position: absolute`, trình duyệt tính chiều cao SVG theo tỷ lệ nội tại (`360:160` trên bề rộng `~374px` → cao `~166px`, chiếm `166 / 300 ≈ 55%` chiều cao container), khiến ~45% phía dưới chỉ lộ nền gradient tối `slate-900`.
- **Cách sửa (`FocusSceneArea.tsx:106-214`):**
  1. Đặt `<svg>` ở lớp nền `className="absolute inset-0 w-full h-full block pointer-events-none"` bám vào bounding box của container `relative`.
  2. Đổi `viewBox="0 0 360 220"` với `preserveAspectRatio="xMidYMax slice"`, mở rộng path đồi xa (`y=128..142 → y=220`), đồng cỏ (`y=148..158 → y=220`) và dải nền đất chân cảnh xuống sát `y=220`, đặt lều đá, lửa trại và 2 bóng người trong vùng an toàn (`y=146..196`) để không bị cắt khi khung co về `min-h-[160px]` lẫn không hở đáy khi giãn lên `~300px`.
- **Bằng chứng kiểm chứng:** Test mới xác nhận `<svg>` có `absolute inset-0 w-full h-full`, `viewBox="0 0 360 220"`, `preserveAspectRatio="xMidYMax slice"`, đủ các lớp vẽ đến `L360 220 L0 220 Z` ở cả 3 trạng thái `working`, `paused`, `resting` (và giữ nguyên chip trạng thái + nút chuông).

---

## 4. Kết luận về Rủi ro Chuyển Pha Hai Lần (Double-Transition)

Đã kiểm tra chéo nhánh `TimerView.tsx:333-345` với `src/background/messageHandler.ts:104-164` và `src/background/sessionCoordinator.ts:1019-1046`:
1. **Ở background Chrome Extension thật:** Hoàn toàn an toàn và idempotent nhờ khóa mutex `this.storage.runExclusive(...)` cùng kiểm tra `expectedPhase`:
   - `ADVANCE_POMODORO_STAGE` kiểm tra và truyền `expectedPhase = 'FOCUS'`; nếu alarm nền đã tự chuyển sang `SHORT_BREAK`/`LONG_BREAK`, `MessageHandler.ts:110-119` trả về no-op `{ success: true, data: currentSession }`.
   - `SKIP_POMODORO_BREAK` truyền `expectedPhase = currentSession.pomodoroState.currentPhase` (`SHORT_BREAK` hoặc `LONG_BREAK`); nếu alarm hết break vừa chạy trước đó 1ms, coordinator bỏ qua chuyển pha thứ hai.
2. **Tại sao KHÔNG tái dùng `onAdvancePomodoroStage` cho nút `Skip Break`:**
   - Trong `TimerView.tsx:333-345`, mỗi khi `isPhaseCompleted === true` (hết đồng hồ Focus **hoặc** hết đồng hồ Break), effect tự động gọi `onAdvancePomodoroStage()` nếu prop này tồn tại, ngược lại gọi `onRefreshSession()`.
   - Nếu `App.tsx` truyền một hàm gửi `SKIP_POMODORO_BREAK` vào `onAdvancePomodoroStage`, thì khi **Focus** đếm về `00:00` (`currentPhase === 'FOCUS'`), effect sẽ bắn `SKIP_POMODORO_BREAK` mỗi giây → bị backend từ chối `'Cannot skip break while in Focus phase.'`.
   - Ngược lại nếu truyền `ADVANCE_POMODORO_STAGE` vào `onAdvancePomodoroStage`, `MessageHandler` chủ ý bỏ qua khi đang ở pha nghỉ → nút Skip Break trong runtime thật vẫn không hoạt động.
3. **Kết luận kiến trúc đã áp dụng:** Tách prop chuyên biệt `onSkipBreak` (chỉ gọi `SKIP_POMODORO_BREAK` khi người dùng bấm nút lúc `isBreakPhase`) và giữ `onAdvancePomodoroStage` không truyền từ `App.tsx` (hết pha tự đồng bộ với alarm nền qua `onRefreshSession()`). Cách này **triệt tiêu 100% nguy cơ chuyển pha hai lần hay gọi sai pha lúc Focus kết thúc**.

---

## 5. Bảng So sánh Baseline vs Sau Giai đoạn 5b-3

| Hạng mục | Baseline (sau 5b-2) | Sau Giai đoạn 5b-3 | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **425 / 425 PASS** (`0` fail, `21.02s`) | **433 / 433 PASS** (`0` fail, `0` cancelled, `0` skipped, `21.43s`) | **+8 tests mới** (`focusRunningFixes5b3.test.ts`), **0 test cũ bị sửa** |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Đã chạy lại sau chỉnh sửa cuối (kèm `compile_applet` & `lint_applet`) |
| `npm run clean && npm run build` | **PASS** (`887ms`, 1,718 modules) | **PASS** (`859ms`, 1,719 modules) | Sạch lỗi build Vite |
| `dist/background.js` | `77.67 kB` (gzip `16.82 kB`) | **`77.67 kB`** (gzip **`16.82 kB`**) | **0 B** — không ảnh hưởng bundle background |
| `dist/assets/domainNormalizer-*.js` | `21.97 kB` (gzip `6.87 kB`) | **`21.97 kB`** (gzip **`6.87 kB`**) | **0 B** — shared chunk giữ nguyên kích thước gọn |
| `dist/assets/popup-*.js` | `651.92 kB` (gzip `173.64 kB`) | **`653.76 kB`** (gzip **`174.08 kB`**) | `+1.84 kB` (`+0.44 kB` gzip) từ logic sửa 3 lỗi |
| `dist/assets/popup-*.css` | `66.27 kB` (gzip `10.34 kB`) | **`66.27 kB`** (gzip **`10.34 kB`**) | **0 B** |
| `dist/index.html` | `0.63 kB` (gzip `0.37 kB`) | `0.63 kB` (gzip `0.38 kB`) | Không đổi |

---

## 6. Xác nhận Ràng buộc & Những gì Cố ý Không Làm trong 5b-3

- **Không** sửa bất kỳ assertion nào trong `425` test hiện có.
- **Không** thay đổi vật lý bộ đếm wall-clock, pause `2 × 5 phút`, auto-resume, crash recovery, thời lượng/luật state machine Pomodoro ở background, công thức tính Coin/XP hay chuông Web Audio.
- **Không** thêm sprite/animation (giữ đúng ranh giới 4a/4b), không cài thêm dependency.
- **Không** đụng vào `Header`, `Navbar`, `ProfileBottomSheet`, Idle Setup (`STATE 3`), Outcome (`STATE 1`), vùng `sr-only` (để dành dọn ở Giai đoạn 6), Quest/Stats, `blocked.html`, `_locales`, `manifest.json` hay `vite.config.ts`.

---

## 7. Phát hiện thêm hoặc Mâu thuẫn

1. **Chuẩn hóa config mặc định trong simulator `START_SESSION`:** Khi gọi `START_SESSION` ở Web Preview không truyền đầy đủ trường `pomodoroConfig`, simulator trước đó tự chế đối tượng config thiếu `numberOfCycles: 3`. Đã sửa sang gọi trực tiếp `TimeCalculator.validatePomodoroConfig(payload.pomodoroConfig).config` giống hệt `SessionCoordinator`.
2. **Bù thưởng từng interval khi `POMODORO_COUNTDOWN` đang chạy trong simulator:** Trong simulator trước đó, `ADVANCE_POMODORO_STAGE` cho `POMODORO_COUNTDOWN` ghi đè `accumulatedCoins`/`accumulatedXp` bằng thưởng tích lũy từng chặng (thấp hơn thưởng toàn phiên) và chưa tự chuyển `COMPLETED` khi hoàn thành hết chu kỳ. Đã chỉnh khớp với logic planned mission reward của `POMODORO_COUNTDOWN`.

---

## 8. Hạn chế

- Toàn bộ `433` unit tests chạy qua React SSR (`renderToString`) và simulator trên `Node.js`; chưa thực hiện kiểm thử bấm trực tiếp trên Chrome Extension unpacked thật (cần xác nhận thị giác trực tiếp chiều cao `~160px` và `~300px` của `FocusSceneArea`, kết quả bấm `Skip Break` với service worker thật, và chuỗi `1125 Coin, 3750 XP`).
- Cảnh báo Vite chunk `popup-*.js > 500 kB` vẫn giữ nguyên theo kế hoạch hiện tại.

---

## 9. Đề xuất Bước Kế tiếp

- Đề xuất tiến hành **Giai đoạn 4a — Pixel-Art `spriteRegistry` Bản đồ / Công trình**: tạo `src/ui/components/civilization/spriteRegistry.ts` (SVG pixel-art tự sở hữu cho 6 công trình `Stone Age` + tile nền) và tích hợp vào `MapGridView.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, giữ nguyên 100% logic placement/pan/zoom/demolish/khóa `"Milestone 5C"`.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 4a
