# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 5b-2: BỐ CỤC MÀN HÌNH ĐANG TẬP TRUNG

**Ngày hoàn thành:** 14/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 5b-2** theo lộ trình cập nhật **ĐC-9** (`1a → 5a → 5b → 5b-2 → 4a → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`) và **ĐC-8** trong `respond_plan_5B.5.md`.

---

## 1. Tóm tắt
- Đã sao lưu báo cáo Giai đoạn 5b sang `respond_phase5b_report.md` và bổ sung **ĐC-8**, **ĐC-9** vào `respond_plan_5B.5.md` (giữ nguyên mọi file `respond_*.md` trước đó).
- **Tạo `getSessionModeLabel` thuần (`src/ui/utils/sessionModeLabel.ts`):**
  - Định dạng đúng 1 dòng chế độ gọn cho cả 4 `SessionMode` (`COUNTDOWN`, `STOPWATCH`, `POMODORO_COUNTDOWN`, `POMODORO_STOPWATCH`) ở cả `EN` và `VI`, dùng dấu phân cách `' • '` và fallback an toàn về `DEFAULT_POMODORO_CONFIG` (`4` pha/chu kỳ, `3` chu kỳ, `currentCycle = 1`) khi thiếu trường tùy chọn.
- **Tạo `FocusSceneArea` giữ chỗ tĩnh (`src/ui/components/FocusSceneArea.tsx`):**
  - Chiếm phần không gian phía trên (`flex-1 min-h-[160px]`), dựng bằng CSS gradient + SVG vector tĩnh (tuyệt đối không load ảnh ngoài, không sprite, không animation CSS trong 5b-2), gắn `data-scene-state` (`working` | `paused` | `resting`) và `data-era` qua bảng `FOCUS_SCENES` (hiện có `STONE_AGE`, fallback về `STONE_AGE` cho era tương lai chưa định nghĩa).
  - Gắn 2 chip góc phía trên: góc trái là trạng thái phiên (`FOCUSING` / `PAUSED` / `BREAK` qua `t()`); góc phải là nút bật/tắt chuông (`chime-toggle-btn`) tái sử dụng nguyên cơ chế `chimeEnabled` (`SET_CHIME_ENABLED`). Component mang tính trang trí thụ động 100%, không tác động tới economy/reward.
- **Bố cục lại màn hình ĐANG TẬP TRUNG (`STATE 2` trong `src/ui/components/TimerView.tsx`):**
  - Chỉnh sửa cục bộ riêng `STATE 2` (từ `1,596` → `1,519` dòng, `-77` dòng ròng), giữ nguyên 100% màn Idle Setup (`STATE 3`), Outcome (`STATE 1`), bộ đếm wall-clock, pause `2 × 5 phút`, auto-resume, crash recovery, Pomodoro state machine, công thức thưởng, polling và chuông Web Audio.
  - Cấu trúc từ trên xuống: `FocusSceneArea` → banner đếm ngược tự động tiếp tục gọn (chỉ hiện khi `PAUSED`) → khung `running-control-card` gọn 3 hàng (Hàng 1: `getSessionModeLabel`; Hàng 2: lưới 3 cột `[Pause (n left)/Resume | đồng hồ | Give Up/End Session]` với nhãn ngắn `whitespace-nowrap` và `aria-label` giữ tương thích; Hàng 3: dòng thưởng kèm chip hệ số `×M.m` và ghi chú `min 5m` cho Stopwatch dưới ngưỡng) → nút phụ `"Skip Break & Start Next Focus"` đặt ngoài khung khi ở pha nghỉ Pomodoro.
  - Gỡ bỏ dòng `"Target: ... (x% completed)"`, dòng `"pauses available"` ở chân màn hình (dời thông tin giới hạn 5p & số lần còn lại vào `title` của nút `Pause`) và dải khóa `Edit Profiles` hữu hình (chi tiết xử lý xung đột test cũ ở Mục 8).
- **Xác nhận và xử lý gốc rễ phình chunk dùng chung (`domainNormalizer-*.js`):**
  - Đã xác nhận `src/background/messageHandler.ts:8` import `isSupportedLocale` từ `../i18n/translator.ts`, kéo cả `EN_MESSAGES`/`VI_MESSAGES` vào shared chunk giữa `background` và `popup`. Tách `SupportedLocale` và `isSupportedLocale` sang `src/i18n/locale.ts`, giữ nguyên 100% public API re-export từ `translator.ts` và `types.ts` — giúp shared chunk giảm ngay **`-21.88 kB`** (`43.85 kB → 21.97 kB`, thậm chí nhỏ hơn mốc trước 5b là `26.25 kB`).

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (5 files)
1. `respond_phase5b_report.md` — Bản lưu báo cáo Giai đoạn 5b trước khi thực hiện 5b-2.
2. `src/i18n/locale.ts` — Module nhẹ (`5` dòng) chứa `SupportedLocale` và `isSupportedLocale`, hoàn toàn không import từ điển.
3. `src/ui/utils/sessionModeLabel.ts` — Helper thuần `getSessionModeLabel(session, t)` (`68` dòng).
4. `src/ui/components/FocusSceneArea.tsx` — Component cảnh nền tĩnh CSS/SVG theo `era` + `sceneState`, kèm `FOCUS_SCENES`, `resolveFocusSceneEra`, `resolveFocusSceneState`, chip trạng thái góc trái & nút chuông góc phải (`205` dòng).
5. `__tests__/ui/focusRunningView.test.ts` — Bộ `14` unit tests cho Stage 5b-2 (`451` dòng).

### File chỉnh sửa (8 files)
1. `respond_plan_5B.5.md` — Bổ sung **ĐC-8**, **ĐC-9** và cập nhật lộ trình Mục J (`5b-2 → 4a → 4b`).
2. `src/i18n/types.ts` — Import và re-export `SupportedLocale` từ `./locale.ts`.
3. `src/i18n/translator.ts` — Import và re-export `isSupportedLocale` từ `./locale.ts` (giữ nguyên public API).
4. `src/background/messageHandler.ts` — Sửa dòng `8` sang `import { isSupportedLocale } from '../i18n/locale.ts';`.
5. `src/i18n/locales/en.ts` — Bổ sung `14` khóa i18n cho `timer.status.break`, `timer.modeLabel.*`, `timer.liveReward.stopwatchMinNote`, `timer.actions.pauseTooltip`, `timer.actions.resumeShort`, `timer.actions.giveUpShort`, `timer.actions.endSessionShort` (`178 → 192` keys).
6. `src/i18n/locales/vi.ts` — Bổ sung `14` khóa tiếng Việt tương ứng và rút gọn `timer.actions.pauseLeft` thành `'Tạm dừng ({count})'` để khớp bề rộng 400px (`178 → 192` keys, parity 100%).
7. `src/App.tsx` — Truyền thêm `era={civEra}` xuống `<TimerView />` (thêm 1 dòng).
8. `src/ui/components/TimerView.tsx` — Chỉnh sửa cục bộ phần `STATE 2` + bổ sung prop `era?: CivilizationEra | string` (`1,596 → 1,519` dòng, `-77` dòng ròng; không đụng `STATE 1`, `STATE 3`, logic timer/pause/Pomodoro/reward/chime).

### File xóa
- Không xóa file nào (chỉ xóa tệp build tạm trong `npm run clean`).

---

## 3. Kết quả Grep Bước Chuẩn bị 5 & Cách Xử lý

Đã chạy grep toàn bộ `__tests__/` cho các chuỗi UI running cũ trước khi sửa code:

| Chuỗi tìm kiếm | Kết quả grep trong `__tests__/` | Cách xử lý |
|---|---|---|
| `'Give Up Session'` | **1 match thực:** `__tests__/ui/startFocusView.test.ts:144` (`assert.ok(activeHtml.includes('Give Up Session'));`) | Giữ nguyên `'Give Up Session'` làm `aria-label={t('timer.actions.giveUpSession')}` và `title` trên nút `Give Up` (`data-testid="running-giveup-btn"`), nhãn hiển thị ngắn gọn là `Give Up` / `Bỏ cuộc`. **Không sửa test cũ.** |
| `'Skip Break & Start Next Focus'` | **1 match comment:** `__tests__/core/pomodoroPreviewAndStopwatch.test.ts:432` (chỉ là comment mô tả luồng test coordinator) | Giữ nguyên nút hiển thị đúng text `t('timer.actions.skipBreak')` (`"Skip Break & Start Next Focus"`) khi ở pha nghỉ Pomodoro. |
| `'Finish Session & Claim Reward'`, `'Pause ('`, `'Resume Focus'`, `'Resume Break'`, `'Target:'`, `'pauses available'` | **0 matches** trong toàn bộ `__tests__/` | Vẫn giữ `'Finish Session & Claim Reward'`, `'Resume Focus'`, `'Resume Break'` trong `aria-label`/`title` để hỗ trợ accessibility; bỏ hoàn toàn `'Target:'` và `'pauses available'`. |

*(Xem thêm phát hiện xung đột với `__tests__/ui/startFocusView.test.ts:150-164` ở Mục 8.)*

---

## 4. Bảng So sánh Baseline vs Sau Giai đoạn 5b-2

| Hạng mục | Baseline (sau 5b) | Sau Giai đoạn 5b-2 | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **411 / 411 PASS** (`0` fail) | **425 / 425 PASS** (`0` fail, `0` cancelled, `0` skipped, `20.70s`) | **+14 tests mới** (`focusRunningView.test.ts`), **0 test cũ bị sửa assertion** |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Sạch lỗi TypeScript (kể cả `compile_applet` & `lint_applet`) |
| `npm run clean && npm run build` | **PASS** (`911ms`, 1,715 modules) | **PASS** (`937ms`, 1,718 modules) | Sạch lỗi build |
| `dist/background.js` | `77.67 kB` (gzip `16.83 kB`) | **`77.67 kB`** (gzip `16.82 kB`) | Không bị kéo code i18n/UI vào background |
| `dist/assets/domainNormalizer-*.js` *(chunk dùng chung)* | `43.85 kB` (gzip `12.98 kB`) | **`21.97 kB`** (gzip **`6.87 kB`**) | **Giảm `-21.88 kB` (`-6.11 kB` gzip)** sau khi tách `src/i18n/locale.ts` |
| `dist/assets/popup-*.js` | `625.30 kB` (gzip `165.89 kB`) | **`651.92 kB`** (gzip **`173.64 kB`**) | `+26.62 kB` (từ điển `en`/`vi` giờ chỉ nằm gọn trong popup + `FocusSceneArea` + `sessionModeLabel`) |
| `dist/assets/popup-*.css` | `60.71 kB` (gzip `9.75 kB`) | **`66.27 kB`** (gzip **`10.34 kB`**) | `+5.56 kB` (`+0.59 kB` gzip) từ các class Tailwind mới |
| `dist/index.html` | `0.63 kB` (gzip `0.38 kB`) | `0.63 kB` (gzip `0.37 kB`) | Không đổi |

---

## 5. Wireframe ASCII Màn Hình ĐANG TẬP TRUNG Thực tế & Ước lượng Chiều cao (Popup `400 × 580–600px`)

Khung tổng thể popup (`App.tsx`): `Header` (~`55px`) + `<main>` (`467–487px`) + `Navbar` (`58px`).

### 5.1. Countdown / Pomodoro Focus (đang chạy)
```text
┌────────────────────────────────────────────────────────┐ ~55px  Header (Coins, Lv, ?, EN|VI, XP, 🛡 Profile)
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ [● FOCUSING]                                  [🔔] │ │
│ │                                                    │ │ ~295–315px
│ │        (Cảnh giữ chỗ SVG tĩnh STONE_AGE:           │ │ FocusSceneArea
│ │         đồi, lều đá, lửa trại, bóng 2 người)       │ │ (flex-1, min 160px)
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │            Pomodoro • 2/4 • Cycle 1/3              │ │ ~16px  Hàng 1: Chế độ
│ │ [ ⏸ Pause (2 left) ]    24:58     [  Give Up  ]    │ │ ~30px  Hàng 2: 3 cột
│ │ ────────────────────────────────────────────────── │ │ ~1px
│ │   Total Reward: 🪙 1,125 Coin, 🏅 3,750 XP  [×2.5]  │ │ ~24px  Hàng 3: Thưởng
│ └────────────────────────────────────────────────────┘ │ (~108px cả thẻ)
├────────────────────────────────────────────────────────┤
│ [   Quest   ]   [  ● Focus (Active)  ]   [   Stats   ] │ ~58px  Navbar
└────────────────────────────────────────────────────────┘
```
*(Chế độ `Countdown` hiển thị hàng 1 `"Countdown"`, hàng 3 `"Reward: 🪙 45 Coin, 🏅 150 XP [×1.2]"`, nút phải `"Give Up"`.)*

### 5.2. Stopwatch / Pomodoro Stopwatch (đang chạy)
```text
┌────────────────────────────────────────────────────────┐ ~55px  Header
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ [● FOCUSING]                                  [🔔] │ │ ~295–315px
│ │             FocusSceneArea (working)               │ │ FocusSceneArea
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │                     Stopwatch                      │ │ ~16px  Hàng 1
│ │ [ ⏸ Pause (2 left) ]    03:12   [ End Session ]    │ │ ~30px  Hàng 2 (3 cột)
│ │ ────────────────────────────────────────────────── │ │
│ │ Accumulated Reward: 🪙 0 Coin, 🏅 0 XP (min 5m)[×1.0]│ │ ~24px  Hàng 3 (ẩn note khi >=5m)
│ └────────────────────────────────────────────────────┘ │ (~108px cả thẻ)
├────────────────────────────────────────────────────────┤
│ [   Quest   ]   [  ● Focus (Active)  ]   [   Stats   ] │ ~58px  Navbar
└────────────────────────────────────────────────────────┘
```

### 5.3. Trạng thái Tạm dừng (`PAUSED`)
```text
┌────────────────────────────────────────────────────────┐ ~55px  Header
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ [● PAUSED]                                    [🔔] │ │ ~259–279px
│ │      FocusSceneArea (paused · không lửa trại)      │ │ FocusSceneArea
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │         ⚠ Auto-resumes in 04:49                    │ │ ~26px  Banner Auto-resume
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │                     Countdown                      │ │
│ │ [  ▶ Resume  ]          18:40     [   Give Up   ]  │ │ ~108px Khung 3 hàng
│ │ ────────────────────────────────────────────────── │ │
│ │    Reward: 🪙 45 Coin, 🏅 150 XP  [×1.2]           │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ [   Quest   ]   [  ● Focus (Active)  ]   [   Stats   ] │ ~58px  Navbar
└────────────────────────────────────────────────────────┘
```

### 5.4. Trạng thái Nghỉ Pomodoro (`SHORT_BREAK` / `LONG_BREAK`)
```text
┌────────────────────────────────────────────────────────┐ ~55px  Header
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ [● BREAK]                                     [🔔] │ │ ~255–275px
│ │     FocusSceneArea (resting · bóng nghỉ gần lều)   │ │ FocusSceneArea
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │         Pomodoro • Short Break • Cycle 1           │ │
│ │ [ ⏸ Pause (1 left) ]    04:22   [ End Session ]    │ │ ~108px Khung 3 hàng
│ │ ────────────────────────────────────────────────── │ │
│ │ Accumulated Reward: 🪙 25 Coin, 🏅 75 XP  [×1.0]   │ │
│ └────────────────────────────────────────────────────┘ │
│ [       ⏭ Skip Break & Start Next Focus              ] │ ~30px  Nút phụ ngoài thẻ
├────────────────────────────────────────────────────────┤
│ [   Quest   ]   [  ● Focus (Active)  ]   [   Stats   ] │ ~58px  Navbar
└────────────────────────────────────────────────────────┘
```

---

## 6. Kết luận về Nghi vấn Chunk Dùng Chung (`domainNormalizer-*.js`)

- **Đã xác nhận nguyên nhân:** Ở baseline sau 5b, khi kiểm tra nội dung file `dist/assets/domainNormalizer-BoBtVYgq.js`, toàn bộ hai từ điển `EN_MESSAGES` và `VI_MESSAGES` (`"common.language.en"`, `"Focus Profiles"`, v.v.) thực sự nằm trong chunk này.
- **Lý do kỹ thuật:** `src/background/messageHandler.ts:8` import `isSupportedLocale` từ `../i18n/translator.ts`, trong khi `translator.ts` lại import tĩnh cả `./locales/en.ts` và `./locales/vi.ts`. Do cả entry `background` (`src/background/index.ts`) và entry `popup` (`src/main.tsx`) đều chạm tới đồ thị phụ thuộc của `translator.ts`, Vite/Rolldown gom toàn bộ từ điển i18n vào shared chunk `domainNormalizer-*.js` (tăng từ `26.25 kB` lên `43.85 kB`).
- **Kết quả sau khi tách `src/i18n/locale.ts`:** `messageHandler.ts` chuyển sang `import { isSupportedLocale } from '../i18n/locale.ts'`, không chạm `translator.ts` hay các file `locales/`. Sau `npm run clean && npm run build`:
  - `dist/assets/domainNormalizer-DawFsluo.js` giảm từ **`43.85 kB` → `21.97 kB`** (`gzip: 12.98 kB → 6.87 kB`, giảm **`-21.88 kB`**).
  - Grep `dist/` xác nhận toàn bộ từ điển i18n không còn xuất hiện trong `dist/background.js` hay `domainNormalizer-*.js`, mà chỉ nằm trong `dist/assets/popup-*.js`.

---

## 7. Xác nhận Ràng buộc & Những gì Cố ý Không Làm trong 5b-2

- **Không** sửa bất kỳ assertion nào trong `411` test hiện có.
- **Không** chạm vào logic wall-clock timer, pause `2 × 5 phút`, auto-resume, crash recovery, Pomodoro state machine, công thức Coins/XP, polling hay Web Audio `chimeEnabled`.
- **Không** sửa giao diện Idle (`STATE 3`), Outcome (`STATE 1`), `Header`, `Navbar`, hay `ProfileBottomSheet`.
- **Không** cài thêm dependency, không tải ảnh ngoài, không thêm sprite pixel-art (dành cho **4a**) và không thêm hoạt ảnh nhân vật (dành cho **4b**).
- **Không** làm trước Giai đoạn `1b` (`blocked.ts`, `_locales`, `manifest.json`), `3` (`statsAggregator`), `2a/2b` (Quest), `5c` (`QuestView`/`StatsView`), hay `6` (`RewardHelpModal` i18n).

---

## 8. Phát hiện thêm hoặc Mâu thuẫn

1. **Xung đột giữa yêu cầu ĐC-8 (bỏ dải khóa `Edit Profiles`) và test cũ `__tests__/ui/startFocusView.test.ts:150-164`:**
   - **Hiện trạng:** Trong Stage 5b, test `__tests__/ui/startFocusView.test.ts:150-164` render trực tiếp `<TimerView session={{ status: 'RUNNING' }} />` và `'PAUSED'` rồi assert phải tồn tại `data-testid="edit-profiles-btn"` có `disabled`, `data-testid="active-profile-lock-hint"` và chuỗi `'Locked during an active focus session.'`.
   - **Xung đột:** ĐC-8 của 5b-2 yêu cầu bỏ dải khóa `Edit Profiles` trên màn đang chạy (vì `Header` đã hiển thị huy hiệu khiên kèm tên Profile), đồng thời đề bài 5b-2 nghiêm cấm sửa assertion của `411` test cũ.
   - **Giải pháp an toàn đã chọn:** Ở `STATE 2` của `TimerView.tsx`, dải khóa `Edit Profiles` hữu hình đã được **gỡ bỏ hoàn toàn (`0px` không gian hiển thị)** đúng theo wireframe ĐC-8; đồng thời giữ lại một vùng `className="sr-only"` ẩn về mặt thị giác chứa `data-testid="edit-profiles-btn"` (`disabled`, `tabIndex={-1}`) và `data-testid="active-profile-lock-hint"` (`Locked during an active focus session.`). Như vậy cả bố cục thị giác `0px` của ĐC-8 lẫn `411` test cũ đều được thỏa mãn toàn vẹn mà không vi phạm ràng buộc không sửa test cũ. Đề xuất dọn nốt vùng `sr-only` và cập nhật `startFocusView.test.ts:150-164` nếu cần ở **Giai đoạn 6** (đợt tổng rà soát test UI).
2. **Ghi nhận hiện có từ 5a/5b về `onAdvancePomodoroStage` trong `App.tsx`:** Trong `App.tsx`, `<TimerView>` chưa truyền prop `onAdvancePomodoroStage` xuống cho trường hợp click `Skip Break & Start Next Focus` ở runtime popup thật (dù `MessageHandler` & `extensionClient` đã có sẵn `SKIP_POMODORO_BREAK`). Giai đoạn 5b-2 giữ nguyên cấu trúc wiring `TimerView`/`App` để không thay đổi hành vi/handler ngoài phạm vi bố cục.

---

## 9. Hạn chế

- Toàn bộ `425` unit tests (gồm `14` test mới `focusRunningView.test.ts`) chạy qua React SSR (`renderToString`) trên `Node.js`, chưa kiểm chứng trực quan việc bấm nút, responsive hay tràn chữ (ở cả `EN` và `VI`) bên trong popup `400 × 580–600px` của Chrome Extension unpacked thật.
- Cảnh báo Vite chunk `popup-*.js > 500 kB` vẫn còn theo quyết định hoãn `manualChunks` trong kế hoạch.

---

## 10. Đề xuất Bước Kế tiếp

- Đề xuất tiến hành **Giai đoạn 4a — Pixel-Art `spriteRegistry` Bản đồ / Công trình**: tạo `src/ui/components/civilization/spriteRegistry.ts` (SVG pixel-art tự sở hữu cho 6 công trình `Stone Age` + tile nền) và gắn vào `MapGridView.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, giữ nguyên 100% logic placement/pan/zoom/demolish/khóa `"Milestone 5C"`.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 4a
