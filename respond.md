# BÁO CÁO NGHIỆM THU — MILESTONE 5E-2b: CẢNH FOCUS ĐÚNG TỈ LỆ MAP + DỤNG CỤ CẦM TAY & GOD MODE CHỈ CÓ TRONG DEV SERVER

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5E-2** trước đó đã được giữ nguyên vẹn tại `respond_5e2b_prev.md`; mọi file `respond_*_prev.md` khác (`respond_5e2_prev.md`, `respond_5e1c_prev.md`, `respond_5e1b_prev.md`, `respond_5e1_prev.md`, `respond_5d1_prev.md`, `respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, v.v.) đều được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Phần A** (khóa tỉ lệ `1` ô lưới dân làng so với `footprint` công trình của `MapGridView` vào `FocusSceneArea` `1–4` ô làm việc và gắn dụng cụ `#117`/`#115`/`#127` trực tiếp vào tay dân làng), **Phần B** (bảng **`GOD MODE (dev)`** chỉ hoạt động ở dev server / dev mode, cô lập `100%` khỏi bản build `dist/`, đi qua `StorageManager`/`SessionCoordinator`/`CivilizationCoordinator`/`QuestCoordinator` thật và simulator tương đương, giữ nguyên mọi luật giá/thưởng/Era/Schema v6), và kiểm định toàn repo (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`30` tệp, `1,259,394 B`, `0` tệp audio, `0` dấu vết God Mode trong `dist/`**, **`npm test` = `738 / 738 PASS`**, **`689 / 689` khóa EN/VI**, **`128` ErrorCodes**). **Kiểm thử trực quan & tương tác trên trình duyệt Chrome thật (`>= 116`) chưa được thực hiện trong môi trường headless và cần bạn kiểm chứng theo checklist mục 5.**

---

## 1. Phần A — Cảnh Focus Đúng Tỉ Lệ Map & Dụng Cụ Cầm Trên Tay

- **Một nguồn tỉ lệ dùng chung với Map (`src/ui/components/civilization/civilizationScale.ts`):**
  - Định nghĩa `NATIVE_TILE_PX = 16`, `MAP_RENDER_MULTIPLIER = 2`, `MAP_CELL_PX = 32`, `VILLAGER_HEIGHT_CELLS = 1`, `WORK_SUBJECT_EXPAND_FOOTPRINT` (`1×1`), `getWorkSubjectFootprint(kind, definitionId)` và `computeWorkSubSceneLayout({ jobCount, subjectFootprint })`.
  - Dù ở lưới `1`, `2`, `3` hay `4` khung làm việc, cùng một `uniformScale` được nhân đồng thời cho cả dân làng (`1` ô) lẫn công trình/rừng (`footprint.width × footprint.height` ô) — đảm bảo dân làng luôn có đúng chiều cao `1` ô so với *Rock Shelter* (`3×3`), *Elder's Hut* (`2×3`), *Primitive Granary* (`2×2`) hay cây rừng (`1×1`).
- **Dụng cụ gắn trực tiếp trên tay dân làng (`src/ui/components/FocusSceneArea.tsx`, `src/index.css`, `src/ui/components/civilization/TileImage.tsx`):**
  - Mỗi công cụ (`#117` búa cho `place`/`upgrade`, `#115` cuốc chim khi đặt `stone_age_study_cave`, `#127` rìu cho `expand`) được render bên trong phần tử dân làng `focus-work-villager-${job.id}-${villager.id}` **trước** `focus-work-subject-*`, không còn tách rời lơ lửng trên không.
  - Ở công việc `2` thợ (`crewRequired === 2`), thợ thứ hai tự quay tay cầm dụng cụ vào trong về phía công trình.
  - Chỉ gắn lớp vung tay `.fq-work-hand-tool-strike-right` (`transform-origin: 20% 85%`) / `.fq-work-hand-tool-strike-left` (`transform-origin: 80% 85%`) khi `sceneState === 'working' && !reducedMotion`; giữ tĩnh ở `.fq-work-hand-tool-rest-*` khi `paused`, `resting` (Pomodoro break) hoặc `prefers-reduced-motion: reduce`.
  - Bổ sung rào `Number.isFinite` trong `TileImage.tsx` tránh giá trị `NaNpx` khi chỉ số tile hoặc kích thước không hợp lệ.
- **Kiểm thử Phần A (`__tests__/ui/focusWorkSceneScaleAndTools5e2b.test.ts` — `3` tests mới):**
  - Kiểm tra `TileImage` NaN guard, tỉ lệ đồng nhất `1 : footprint` giữa `MapGridView` và `FocusSceneArea`, vị trí tool nằm trong `focus-work-villager-*` trước `focus-work-subject-*` với đúng `#117`/`#115`/`#127`, xoay hướng thợ thứ `2`, giữ tĩnh khi `paused`/`resting`/`reducedMotion`, và kiểm tra CSS keyframes/reduced-motion trong `src/index.css`.

---

## 2. Phần B — GOD MODE Chỉ Có Trong Dev Server (`dist/` 0 Dấu Vết)

- **Kiến trúc cô lập tuyệt đối (`src/ui/services/devRuntimeBridge.ts`, `src/dev/*`, `vite.config.ts`):**
  - Các entrypoint production (`src/App.tsx`, `src/ui/services/extensionClient.ts`, `src/ui/components/TimerView.tsx`, `src/background/index.ts`) chỉ gọi cầu nối trung tính `devRuntimeBridge.ts` và dynamic `import(...)` nằm trong rào `import.meta.env.DEV === true`; `messageHandler.ts` và `src/types/messages.ts` giữ sạch 100% (từ chối mọi `DEV_*` với `UNKNOWN_ACTION`).
  - Trong `vite.config.ts`, mọi lệnh production build (`command === 'build' && mode !== 'development'`) ép `'import.meta.env.DEV': 'false'`, `'import.meta.env.PROD': 'true'`, `'process.env.NODE_ENV': '"production"'` (ngăn trường hợp `NODE_ENV=development` từ môi trường shell lọt vào `dist/`). Khi `npm run clean && npm run build` hoàn tất, Vite loại bỏ hoàn toàn toàn bộ chunk và chuỗi `src/dev/*` khỏi `dist/`.
- **Bộ công cụ 8 nhóm trong `src/dev/DevGodModePanel.tsx` & `DevGodModeMount.tsx` (thu gọn mặc định):**
  - Chip nổi góc phải dưới **`GOD MODE (dev)`** (`data-testid="dev-god-mode-toggle"`), nằm ngoài khung `400×600` của `PopupShell`, mặc định đóng để không che giao diện thường.
  - **1. Economy & Stats:** Set Coins, `+1,000`, `+10k`, Max Coins; Set Level (`Lv.9`, `Lv.20`, `Max Lv`); Set Today Focus Minutes (`+60m`, `+500m`).
  - **2. Focus Session & Time Speed:** Chọn tốc độ `1×`, `10×`, `60×`, `600×` (tăng tốc vòng tick qua `devRuntimeBridge` và `DEV_ADVANCE_ACTIVE_SESSION_MS`, vẫn chạy quyết toán thật ở background/simulator; `Give Up` vẫn `0` Coins / `0` XP), `Skip focus wait` (hỗ trợ cả Countdown, Pomodoro Countdown, Pomodoro Stopwatch, Stopwatch `>= 5m`), và `Complete all jobs`.
  - **3. Buildings & Land:** Đặt miễn phí bất kỳ công trình hợp giới hạn, `Max buildings` (nâng tối đa và dọn job xây/nâng tương ứng, giữ bất biến), `Unlock +1 chunk` / `+3 chunks`.
  - **4. Villagers:** Tuyển miễn phí `crafter` / `elder` / `woodworker` (tự tạo/nâng *Rock Shelter* tới trần sức chứa `10`), `Fill all roles`.
  - **5. Era Readiness (`STONE_AGE` giữ nguyên):** Hiển thị trạng thái `Bronze Ready: YES/NO` qua `evaluateEraAdvance` thật và nút `Meet Stone → Bronze Requirements (stays Stone Age)` — chuẩn bị đủ đất/công trình Lv.5/3 vai trò/Lv.9/500p/500 Coins nhưng **tuyệt đối giữ `era === 'STONE_AGE'`**.
  - **6. Quests & Calendar:** `Complete All Quests` (giữ `claimed: false` để test bấm Claim thật), `+1 Day Rollover` (dịch mốc lịch và gọi `rolloverQuestState` thật), `New Daily Quests`, `New Weekly Quests`.
  - **7. Awards (trung thực trạng thái hiện tại):** Nút `Unlock all awards (disabled — Awards tab is Coming soon)` bị khóa (`disabled`) đúng thực tế tab Awards hiện vẫn là `"Coming soon"`.
  - **8. Data Tools:** `Seed Demo`, `Export JSON` / `Import JSON` (schema `v6`, chuẩn hóa qua `sanitizeCivilizationState`/`sanitizeQuestState`), và `Reset all data...` có bước xác nhận 2 lần.
- **Kiểm thử Phần B (`+10` tests mới, `0` xóa test cũ):**
  - `__tests__/background/devGodMode5e2b.test.ts` (`4` tests): `MessageHandler` production từ chối `DEV_*` bằng `UNKNOWN_ACTION`, tốc độ mặc định `1×`, kiểm chứng toàn bộ `21` action `DEV_*` với `StorageManager`/`SessionCoordinator`/`CivilizationCoordinator`/`QuestCoordinator` thật (bảo toàn `Give Up = 0` thưởng, `validateCivilizationState`, `evaluateEraAdvance.eligible === true` nhưng `era === 'STONE_AGE'`, `claimed === false` trước Claim, Export/Import/Reset schema `v6`).
  - `__tests__/ui/devGodModeBuildIsolation5e2b.test.ts` (`2` tests): quét toàn bộ tệp `.js/.mjs/.html/.css/.json` trong `dist/` khẳng định `0` chứa bất kỳ chuỗi nào trong `28` định danh God Mode (`GOD MODE`, `GOD_MODE`, `DEV_*`, `DevGodMode*`, `devBackgroundService`, `devSimulatorPlugin`, `devStateHelpers`); kiểm tra các file entry production không rò mã dev; và render SSR `DevGodModePanel` ở trạng thái thu gọn mặc định.
  - Cập nhật `__tests__/ui/i18nStaticGuard.test.ts` miễn trừ hợp lệ riêng `src/dev/` trong guard i18n.

---

## 3. Tài Liệu Đã Đồng Bộ

- `ARCHITECTURE.md` (`1.16.0`): bổ sung `civilizationScale.ts`, gắn dụng cụ trong `focus-work-villager-*` và Mục 8 kiến trúc cô lập `src/dev/` + `vite.config.ts`.
- `PROJECT_STATUS.md`: cập nhật trạng thái nghiệm thu Milestone 5E-2b với số liệu build/lint/test đo được thực tế.
- `README.md`: cập nhật mục `Development Tools (GOD MODE (dev))`, số liệu test `738/738` và phạm vi nghiệm thu.

---

## 4. Kết Quả Kiểm Định Tự Động Thực Tế

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Toàn bộ `src/`, `src/dev/` và `__tests__/` sạch lỗi TypeScript |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`30` tệp, `1,259,394 B`, `881ms`)** | `1,779` modules; **`0` tệp audio** trong `public/` & `dist/`; **`0` chunk/chuỗi God Mode trong `dist/`**; `manifest.json` giữ nguyên `5` quyền cũ |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup-BRomz-8T.js`: `742.88 kB` · `questEngine-DEjBzXmb.js`: `158.92 kB` · `background.js`: `121.64 kB` · `popup-DflKziXU.css`: `108.40 kB` · `translator-BTFEKZ2F.js`: `86.38 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe; không có `DevGodModeMount`, `devBackground` hay `devSimulatorPlugin` |
| **Test Suite (`npm test`)** | `npm test` (chạy 1 lượt sau build) | **`738 / 738 PASS` (`0` fail, `0` skipped)** | Thời gian chạy `34,006.10 ms` (~34.0s); `+13` tests mới (`725 → 738`) |
| **Parity EN/VI & ErrorCodes** | `locales/{en,vi}.ts` & `errorTranslator.ts` | **`689 / 689` khóa (`100%`) · `128` ErrorCodes** | `i18nStaticGuard` xanh (`6/6` kiểm tra) |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA THỰC HIỆN** | Môi trường headless không chạy trình duyệt Chrome thật; cần bạn kiểm chứng theo checklist mục 5 |

---

## 5. Checklist Kiểm Chứng Trên Chrome Thật & Dev Server

1. **Phần A — Tỉ lệ & dụng cụ cầm tay (`npm run dev` hoặc dev build):** Tạo job đặt *Rock Shelter* (`3×3`) và *Foraging Post* (`2×2`) hoặc *Dọn rừng* (`1×1`), bắt đầu phiên Focus và mở `FocusSceneArea` → kiểm tra chiều cao dân làng đúng bằng `1` ô lưới so với kích thước công trình như ngoài Map; búa/cuốc chim/rìu nằm trên tay dân làng, thợ thứ `2` quay vào trong, dụng cụ chỉ vung khi đang Focus và đứng yên khi Pause / Pomodoro Break / `prefers-reduced-motion`.
2. **Phần B — `GOD MODE (dev)` trong `npm run dev`:** Kiểm tra góc dưới phải có chip `"GOD MODE (dev)"` thu gọn mặc định; mở drawer thử chỉnh Coins, Level `9`, tăng tốc `60×` hoặc `Skip focus wait` (và kiểm tra `Give Up` vẫn `0` thưởng), `Complete All Quests` rồi tự bấm `Claim` trên tab `Quests`, `Meet Stone → Bronze Requirements` (xác nhận `Bronze Ready: YES` nhưng Era vẫn là `STONE_AGE`), và xác nhận nút `Unlock all awards` đang khóa kèm lý do `Coming soon`.
3. **Cô lập Production trong Chrome thật (`dist/`):** Chạy `npm run clean && npm run build`, load thư mục `dist/` vào `chrome://extensions/` → xác nhận **không hề** có nút/drawer `"GOD MODE (dev)"` và `dist/assets/` không có bất kỳ file `dev*` nào.

**DỪNG — CHỜ DUYỆT MILESTONE 5E-2b.**
