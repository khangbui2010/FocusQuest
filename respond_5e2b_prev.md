# BÁO CÁO NGHIỆM THU — MILESTONE 5E-2: GIAO VIỆC TRƯỚC PHIÊN FOCUS (`Giao việc`) & CẢNH FOCUS `1–4` Ô LÀM VIỆC

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5E-1c** trước đó đã được sao lưu nguyên vẹn sang `respond_5e2_prev.md`; mọi file `respond_*_prev.md` khác (`respond_5e1c_prev.md`, `respond_5e1b_prev.md`, `respond_5e1_prev.md`, `respond_5d1_prev.md`, `respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, v.v.) vẫn được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Mục 0** (gỡ dụng cụ lơ lửng khỏi Bản đồ), **Mục 1** (giao việc thủ công/tự động trước phiên, xác thực nguyên tử ở Background/Storage & đồng bộ Simulator), **Mục 2** (`FocusSceneArea` hiển thị `0` hoặc `1–4` khung làm việc đều nhau với dân thật không trùng lặp & búa/rìu/cuốc chim chỉ vung khi đang Focus), và **Mục 3** (bổ sung `12` test mới `0` xóa test cũ, đồng bộ tài liệu & kiểm định toàn repo: **`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`30` tệp, `1,463,539 B`, `0` tệp audio**, **`npm test` = `725 / 725 PASS`**, **`689 / 689` khóa EN/VI**, **`128` ErrorCodes**). **Kiểm thử trực quan & tương tác trên Google Chrome thật (`>= 116`) chưa được thực hiện trong môi trường headless và cần bạn kiểm chứng theo checklist mục 6.**

---

## 0. Đối Chiếu Mã Hiện Tại Ở Giai Đoạn 0 (Làm Chuẩn Theo Mã Thực Tế)

| Thành phần / Khóa trong mô tả | Định danh thực tế trong mã hiện tại | Cách xử lý trong 5E-2 |
|---|---|---|
| `MapGridView.tsx` dụng cụ lơ lửng (`building-tool-*`, `clearing-tool-*`, `building-upgrade-tool-*`, `.fq-tool-strike`) | Tồn tại từ 5E-1b/5E-1c tại `src/ui/components/civilization/MapGridView.tsx` cùng `CONSTRUCTION_TOOL_TILES` / `getConstructionToolSpec` | Tách `CONSTRUCTION_TOOL_TILES` & `getConstructionToolSpec` sang `src/ui/components/civilization/constructionTools.ts` (re-export từ `MapGridView.tsx`), gỡ bỏ toàn bộ dụng cụ & `.fq-tool-strike` khỏi Bản đồ |
| Mô hình dân làng khởi đầu + tuyển dân | `founderRole?: VillagerRole \| null`, `FOUNDER_POOL_ID = 'founder_villager'` + `Villager = { id, role, recruitedAt }` (`src/core/civilization/villager.ts`) | Tránh vòng lặp import `villager.ts -> jobs.ts`; xử lý xác định `founder_villager` trước rồi `villagers` sắp theo `(recruitedAt, id)` trong `assignVillagersToActiveJobs` (`src/core/civilization/jobs.ts`) |
| Giao thức bắt đầu phiên | `StartSessionPayload` (`src/types/messages.ts`), `SessionSnapshot` (`src/types/session.ts`), `SessionCoordinator.startSession` | Bổ sung hai trường tùy chọn tương thích ngược `assignedJobIds?: readonly string[]` và `autoContinueJobs?: boolean` (không tăng `CURRENT_SCHEMA_VERSION = 6`) |
| Quyết toán tiến độ sau phiên Focus | `StorageManager.commitSessionOutcomeInternal` (`src/storage/storageManager.ts`) & `extensionClient.ts` | Truyền `{ priorityJobIds: session.assignedJobIds, autoContinue: session.autoContinueJobs }` vào `advanceJobs(...)` chỉ khi phiên `COMPLETED` hợp lệ |
| Hiệu ứng sprite `VillagerSprite` | `VillagerAnimationName = 'idle' \| 'walk_down' \| 'walk_right' \| 'walk_left'` (`spriteRegistry.ts`, không có `'work'`) | Trong khung làm việc `FocusSceneArea`, gắn `<VillagerSprite animation="idle" ... />` bên trong lớp `.fq-scene-villager-work` khi `working && !reducedMotion` |
| Nhãn Hang trong từ điển | `stone_age_study_cave` -> *Rock Shelter* / *Hang trú ẩn* (`buildingI18n.ts`) | Dùng `getLocalizedBuildingName(locale, defId)` giữ nhất quán EN/VI ở cả thẻ Giao việc lẫn khung `FocusSceneArea` |

---

## 1. Mục 0 — Dọn Dụng Cụ Lơ Lửng Trên Bản Đồ

- **Tách nguồn công cụ dùng chung (`src/ui/components/civilization/constructionTools.ts`):** Giữ nguyên ánh xạ Tiny Dungeon `#117` (búa cho `place`/`upgrade`), Tiny Town `#127` (rìu cho `expand`), và Tiny Town `#115` (cuốc chim khi đặt `stone_age_study_cave`); `MapGridView.tsx` re-export lại để bảo toàn API.
- **Gỡ khỏi `MapGridView.tsx`:** Xóa hoàn toàn phần tử `building-tool-*`, `clearing-tool-*`, `building-upgrade-tool-*` và việc gắn `.fq-tool-strike` trên cả 3 loại việc (`place`, `upgrade`, `expand`). Giữ nguyên vẹn `ConstructionFence` (4 cọc gỗ + vải viền rìa trong suốt), `.fq-construction-scaffold`, nhãn `"Đang đào"`/`"Digging"`, `"Đang dọn rừng"`/`"Clearing forest"`, và `ClockTileIcon` + đếm ngược `1s`.
- **Cập nhật assertion test cũ (KHÔNG xóa):** Cập nhật `__tests__/ui/constructionJobsUi.test.ts` (dòng `677–729`) từ kiểm tra dụng cụ bay trên Bản đồ sang xác nhận `MapGridView` **không** render `building-tool-`, `clearing-tool-`, `building-upgrade-tool-` hay `.fq-tool-strike`.

---

## 2. Mục 1 — Giao Việc Cho Dân Làng Trước Phiên Focus

- **Lõi điều phối thuần (`src/core/civilization/jobs.ts`):**
  - `assignJobsWithSchedule(jobs, totalVillagers, options?)`: giữ nguyên hành vi FIFO nếu không truyền tùy chọn; khi có `priorityJobIds`, kích hoạt trước các việc hợp lệ theo thứ tự yêu cầu (bỏ qua an toàn ID không còn tồn tại / đã hủy, giữ chặt trần `<= 4` việc `ACTIVE`, tổng `crewRequired <= totalCrew`, và nâng cấp tuần tự từng bậc trên cùng công trình), sau đó lấp tiếp theo FIFO khi `autoContinue !== false` (hoặc giữ nguyên trạng thái chờ nếu `autoContinue === false`).
  - `validateSessionJobAssignment`: kiểm tra đầy đủ `SESSION_INVALID_JOB_ASSIGNMENT`, `SESSION_JOB_NOT_FOUND`, `SESSION_JOB_DUPLICATE`, `SESSION_JOB_TOO_MANY`, `SESSION_JOB_INSUFFICIENT_CREW`, `SESSION_JOB_UPGRADE_ORDER`.
  - `assignVillagersToActiveJobs`: gán danh sách dân thật (`founder_villager` + `villagers`) cho tối đa `4` việc `ACTIVE` theo đúng `crewRequired`, bảo đảm `0` dân làng xuất hiện trùng lặp ở 2 khung cùng lúc.
  - Mở rộng `advanceJobs` và `projectJobs` nhận `options?: JobScheduleOptions`.
- **Background, Storage & Simulator (`errors.ts`, `errorTranslator.ts`, `session.ts`, `messages.ts`, `messageHandler.ts`, `sessionCoordinator.ts`, `storageManager.ts`, `extensionClient.ts`):**
  - Đăng ký `6` mã lỗi `SESSION_*` mới (`128` mã chuẩn hóa, EN/VI đầy đủ).
  - `MessageHandler` + `SessionCoordinator.startSession` kiểm tra `assignedJobIds` nguyên tử bên trong `this.storage.runExclusive` **trước** khi đổi `activeProfileId` hay lưu `currentSession`.
  - `StorageManager.commitSessionOutcomeInternal` & `extensionClient.ts` (đủ cả nhánh `GET_SESSION_STATE`, `ADVANCE_POMODORO_STAGE`, `FINISH_STOPWATCH`) truyền `{ priorityJobIds, autoContinue }` vào `advanceJobs` chỉ khi phiên `COMPLETED` hợp lệ (`Give Up`, `INTERRUPTED`, Pomodoro break và Stopwatch `< 5m` giữ nguyên `0s`; việc bị hủy giữa phiên được bỏ qua an toàn).
- **Giao diện Trước phiên (`src/ui/components/FocusJobAssignmentCard.tsx`, `TimerView.tsx`, `App.tsx`, `CivilizationScreen.tsx`):**
  - Hiển thị thẻ **"Giao việc"** / **"Assign Jobs"** ngay trong `TimerView` `IDLE` (`STATE 3`), ẩn/khóa hoàn toàn khi phiên đang chạy (`STATE 2`).
  - Hỗ trợ bật/tắt **Tự động** (mặc định ON = FIFO), thanh dân làng thật (`crewUsed/totalCrew`, `Free: N`), danh sách việc có icon/thời gian còn lại/số thợ + khóa trực quan khi vượt trần `4` việc, thiếu dân hoặc chờ cấp nâng cấp trước, checkbox *Tự động tiếp tục việc chờ*, và nút `"Mở Bản đồ"` / `"Go to Map"` khi hàng đợi trống.
  - Đồng bộ `projectJobs` theo lịch của phiên đang chạy trên cả `TimerView` lẫn `CivilizationScreen`, đồng thời bổ sung `res.data.jobs, res.data.founderRole` vào fallback tính `CoinBonus` tại `TimerView.tsx:262-267`.

---

## 3. Mục 2 — `FocusSceneArea` Với `1–4` Khung Làm Việc

- **Mô hình thuần (`src/ui/utils/focusWorkSceneModel.ts`) & Giao diện (`src/ui/components/FocusSceneArea.tsx`, `src/index.css`):**
  - **`0` việc `ACTIVE`:** Giữ nguyên hoàn toàn cảnh trại cổ đại SVG (`viewBox="0 0 360 220"`, `buildFocusSceneModel`).
  - **`1–4` việc `ACTIVE`:** Chia vùng `flex-1 min-h-[160px]` thành `1` (`grid-cols-1`), `2` (`grid-cols-2`), `3` (`grid-cols-3`) hoặc `4` (`grid-cols-2 grid-rows-2`) khung làm việc bằng nhau (`data-testid="focus-work-grid"`), giữ nguyên chip trạng thái góc trên trái & nút chuông góc trên phải.
  - Mỗi khung `focus-work-subscene-${jobId}` hiển thị nền trời/đồi xác định, sprite công trình đang dựng (`getConstructionSprite`) / giàn gỗ nâng cấp (`getBuildingSprite` + `.fq-construction-scaffold`) / cây rừng dọn đất, đúng `crewRequired` (`1` hoặc `2`) dân thật (`<VillagerSprite animation="idle" ... />`) không trùng giữa các khung, `ClockTileIcon` + đồng hồ đếm ngược `1s`, và công cụ (`#117`/`#127`/`#115`) **chỉ có `.fq-tool-strike` (`data-tool-animated="true"`) khi `sceneState === 'working' && !reducedMotion`** — đứng yên hoàn toàn khi `paused`, `resting` (Pomodoro break) hoặc `prefers-reduced-motion`.
  - Xác nhận tĩnh `FocusSceneArea.tsx` và `focusWorkSceneModel.ts` không chứa `Math.random` hay `Date.now`.

---

## 4. Mục 3 — Kiểm Thử Bổ Sung & Đồng Bộ Tài Liệu

- **+`12` test mới (`713` → `725`, `0` test bị xóa):**
  - `__tests__/core/jobsAssignment5e2.test.ts` (`6` tests): `assignJobsWithSchedule` (`FIFO`, `priorityJobIds`, `autoContinue`, bỏ qua ID hủy, trần `4`, nâng cấp tuần tự), khớp `advanceJobs`/`projectJobs`, toàn bộ `6` mã `validateSessionJobAssignment`, và `assignVillagersToActiveJobs` không trùng dân làng.
  - `__tests__/core/economyBalance.test.ts` (`+1` `Suite 6`): mô phỏng Stone → Bronze với ưu tiên công trình Kinh tế/Hang qua `assignJobsWithSchedule` giữ tiến độ trong biên `±1` ngày so với 5E-1 FIFO và `0` thu nhập thụ động.
  - `__tests__/background/sessionJobAssignment5e2.test.ts` (`3` tests): kiểm tra từ chối `START_SESSION` sai phạm không làm bẩn `currentSession`/`activeProfileId`, lưu bền vững `assignedJobIds`/`autoContinueJobs` qua `GET_SESSION_STATE`, quyết toán đúng `COUNTDOWN`/`POMODORO_COUNTDOWN`/`STOPWATCH` & bỏ qua job bị hủy giữa phiên, và parity đầy đủ trên simulator `extensionClient.ts`.
  - `__tests__/ui/focusJobAssignmentUi5e2.test.ts` (`2` tests): SSR `TimerView` IDLE & `FocusJobAssignmentCard` EN/VI, khóa đủ `3` trường hợp, ẩn thẻ khi phiên chạy, và `FocusSceneArea` `0..4` khung làm việc (lưới, không trùng dân, đếm ngược `1s`, trạng thái động/tĩnh của dụng cụ ở `working`/`paused`/`resting`/`reducedMotion`, kiểm tra tĩnh không `Math.random`/`Date.now`).
- **Tài liệu đã đồng bộ:** `PRODUCT_SPEC.md` (`1.12.0-synced`), `ARCHITECTURE.md` (`1.15.0`), `PROJECT_STATUS.md`, `README.md`.

---

## 5. Kết Quả Kiểm Định Tự Động Thực Tế

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Toàn bộ `src/` và `__tests__/` sạch lỗi TypeScript |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`30` tệp, `1,463,539 B`, `946ms`)** | `1,776` modules; **`0` tệp audio** trong `public/` & `dist/`; `manifest.json` giữ nguyên `5` quyền cũ (`storage`, `alarms`, `notifications`, `declarativeNetRequest`, `offscreen`) |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup-CZ_FD62E.js`: `932.34 kB` · `popup-BQa59KUc.css`: `105.03 kB` · `questEngine-Bwl469rV.js`: `176.98 kB` · `background.js`: `121.64 kB` · `translator-BTFEKZ2F.js`: `86.38 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe |
| **Test Suite (`npm test`)** | `npm test` (chạy 1 lượt sau build) | **`725 / 725 PASS` (`0` fail, `0` skipped)** | Thời gian chạy `32,284.96 ms` (~32.3s); `i18nStaticGuard` xanh (`6/6` kiểm tra) |
| **Parity EN/VI & ErrorCodes** | `locales/{en,vi}.ts` & `errorTranslator.ts` | **`689 / 689` khóa (`100%`) · `128` ErrorCodes** | `0` chuỗi JSX/accessibility hardcode |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA THỰC HIỆN** | Môi trường headless không chạy trình duyệt thật; cần kiểm chứng theo checklist mục 6 |

---

## 6. Checklist Kiểm Chứng Trên Chrome Thật (`>= 116`)

1. **Bản đồ sạch dụng cụ lơ lửng (Mục 0):** Mở tab Bản đồ khi đang đặt công trình, nâng cấp công trình và mở đất → kiểm tra chỉ còn hàng rào 4 cọc + vải căng rìa / giàn gỗ nâng cấp / nhãn `"Đang đào"` hoặc `"Đang dọn rừng"` + đồng hồ đếm ngược, **không còn** búa/rìu/cuốc chim lơ lửng trên Bản đồ.
2. **Giao việc Trước phiên khi trống & khi có việc:** Vào tab Focus khi chưa có việc → thấy thẻ `"Giao việc"` trống kèm nút `"Mở Bản đồ"`; xếp `>= 3` việc (gồm nâng cấp nối tiếp `Lv.2` & `Lv.3` của cùng công trình) rồi quay lại tab Focus → kiểm tra nút **Tự động**, chọn thủ công tối đa `4` việc, khóa thiếu dân & khóa `"Chờ Lv.2"`, và checkbox `"Tự động tiếp tục việc chờ"`.
3. **Thay đổi lịch & Khóa khi đang chạy phiên:** Tắt `Tự động`, bỏ tick việc FIFO đầu tiên và chọn việc ở dưới (kèm tắt *Tự động tiếp tục*), bấm Bắt đầu phiên → thẻ `"Giao việc"` biến mất/khóa cứng; đóng mở lại popup trong lúc chạy phiên vẫn giữ đúng việc đã giao và đếm ngược `1s`.
4. **Cảnh Focus `0` vs `1–4` ô làm việc:** Thử khi `0` việc (vẫn hiện trại cổ đại như trước), `1` việc, `2` việc, `3` việc và `4` việc `ACTIVE` tại popup `400×600px` → kiểm tra các khung chia đều không tràn chữ, không dân làng nào xuất hiện ở 2 ô cùng lúc, búa/rìu/cuốc chim vung nhịp nhàng khi đang Focus, chip trạng thái & nút chuông ở góc trên hoạt động bình thường.
5. **Tạm dừng, Pomodoro Break & `prefers-reduced-motion`:** Bấm Tạm dừng hoặc để Pomodoro sang pha Nghỉ (`SHORT_BREAK`/`LONG_BREAK`), và bật `prefers-reduced-motion` trong DevTools → toàn bộ dụng cụ & đồng hồ ở các khung làm việc đứng yên hoàn toàn, không cộng thêm giây xây dựng ngoài pha Focus.
6. **Quyết toán thật khi hoàn thành vs Give Up:** Cho phiên ngắn hoàn thành đủ 100% → chỉ việc được ưu tiên tiến lên (và việc chờ chỉ chạy tiếp nếu đã bật *Tự động tiếp tục*); thử `Give Up` giữa chừng → mọi việc giữ nguyên số giây ban đầu.

**DỪNG — CHỜ DUYỆT MILESTONE 5E-2.**
