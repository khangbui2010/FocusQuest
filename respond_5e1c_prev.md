# BÁO CÁO NGHIỆM THU — MILESTONE 5E-1b: ĐỐI CHIẾU VÀ VÁ MILESTONE 5E-1

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5E-1** trước đó đã được sao lưu nguyên vẹn sang `respond_5e1b_prev.md`; mọi file `respond_*_prev.md` khác (`respond_5e1_prev.md`, `respond_5d1_prev.md`, `respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, v.v.) vẫn được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã đối chiếu toàn bộ 7 hạng mục của **Milestone 5E-1b**, xác minh các bản vá UI/đếm ngược/bảo vệ đã có trong mã nguồn, đồng bộ mô tả `CLOCK`/`HOURGLASS` trong `docs/sprites/TILE_INDEX.md`, kiểm chứng lý do giữ nguyên `CURRENT_SCHEMA_VERSION = 6`, và hoàn tất kiểm định tự động (**`npm run lint` = `0` lỗi**, **`npm test` = `712 / 712 PASS`**, **`npm run clean && npm run build` = PASS** với **`30` tệp, `1,428,633 B`, `0` tệp audio**, không có `public/assets/aistudio`). **Kiểm thử trực quan & tương tác trên Google Chrome thật (`>= 116`) chưa được thực hiện và cần bạn kiểm chứng khi nghiệm thu.**

---

## 1. Đối Chiếu Từng Mục Với Mã Hiện Tại (Bước 1)

| # | Hạng mục đối chiếu | Trạng thái | Tệp : Dòng & Chi tiết đối chiếu |
|---|---|---|---|
| **1** | **Lớp vải mỏng phủ quanh blueprint / mảnh đất đang thi công** (đặt mới và mở đất) | **Có** | - Đặt mới: `src/ui/components/civilization/MapGridView.tsx:1155-1159` (`data-testid="building-tarp-${inst.id}"`, class `fq-construction-tarp`).<br>- Mở đất: `src/ui/components/civilization/MapGridView.tsx:992-996` (`data-testid="clearing-tarp-${origin.x}-${origin.y}"`, class `fq-construction-tarp`).<br>- Kiểu dáng lưới chéo mờ + viền nét đứt + ánh sáng xanh nhạt bên trong: `src/index.css:277-296` (`.fq-construction-tarp`). |
| **2** | **Biểu tượng dụng cụ lơ lửng đập xuống phía trên** (búa `117`, rìu `127`, cuốc chim `115`, animation nhẹ, đứng yên khi `prefers-reduced-motion`) | **Có** | - Bảng ánh xạ dụng cụ (`getConstructionToolSpec` & `CONSTRUCTION_TOOL_TILES`): `src/ui/components/civilization/MapGridView.tsx:109-143` — Búa (`tiny-dungeon` tile `117`) cho xây & nâng cấp, Rìu (`tiny-town` tile `127`, `REUSED_TINY_TOWN_TILES.WOODCUTTER_AXE`) cho dọn rừng, Cuốc chim (`tiny-town` tile `115`) cho Hang trú ẩn (`stone_age_study_cave`), khớp `docs/sprites/TILE_INDEX.md:22, 30`.<br>- Render trên bản đồ: `MapGridView.tsx:998-1014` (`clearing-tool-*`), `MapGridView.tsx:1161-1177` (`building-tool-*`), `MapGridView.tsx:1212-1230` (`building-upgrade-tool-*`).<br>- Animation đập nhẹ `.fq-tool-strike`: `src/index.css:307-320`, chỉ gắn khi `status === 'ACTIVE' && !reducedMotion` (`MapGridView.tsx:282, 967, 1097, 1106`), đóng băng hoàn toàn bởi JS `prefersReducedMotion()` và CSS `@media (prefers-reduced-motion: reduce)` (`src/index.css:322-351`, dòng `343`). |
| **3** | **Nhãn ngắn trên mảnh đất:** `"Đang đào"` (Hang trú ẩn), `"Đang dọn rừng"` (mở đất), đủ EN/VI | **Có** | - Khóa dịch `civ.job.diggingBadge` (`"Digging"` / `"Đang đào"`) tại `src/i18n/locales/en.ts:458`, `src/i18n/locales/vi.ts:460`; hiển thị tại `MapGridView.tsx:1178-1185` (`building-digging-badge-${inst.id}`, chỉ áp dụng khi `placeJob && inst.definitionId === 'stone_age_study_cave'`).<br>- Khóa dịch `civ.job.clearingBadge` (`"Clearing forest"` / `"Đang dọn rừng"`) tại `src/i18n/locales/en.ts:456`, `src/i18n/locales/vi.ts:458`; hiển thị tại `MapGridView.tsx:1025-1030` (`clearing-label-${origin.x}-${origin.y}`). |
| **4** | **Công trình đang NÂNG CẤP vẫn hiện sprite cấp cũ kèm giàn gỗ + đồng hồ + đếm ngược** | **Có** | - Giữ nguyên sprite cấp cũ (`inst.level` chưa tăng trước khi `advanceJobs` hoàn tất): `MapGridView.tsx:1043-1054` (`sprite = constructionSprite ?? baseSprite`, với `constructionSprite = null` khi `!placeJob`).<br>- Giàn gỗ phủ trên sprite: `MapGridView.tsx:1203-1210` (`building-upgrade-scaffold-${inst.id}`, class `.fq-construction-scaffold` tại `src/index.css:298-305`).<br>- Búa lơ lửng + đồng hồ `clock_tiles_16.png` + nhãn `Lv.{target} · {time}`: `MapGridView.tsx:1086-1091, 1212-1230, 1248-1263` (`building-upgrade-timer-${inst.id}`). |
| **5** | **Đồng hồ nhỏ (`clock_tiles_16.png`) + đếm ngược chữ số tới từng giây cho MỌI công trình & mảnh đất `ACTIVE` và `PENDING`** | **Có** | - Component `ClockTileIcon` & `CLOCK_TILE_INDEX` (`CLOCK = 0` cho `ACTIVE`, `HOURGLASS = 1` cho `PENDING`): `src/ui/components/civilization/TileImage.tsx:103-174`, `src/ui/components/civilization/spriteRegistry.ts:18-32`.<br>- Định dạng `formatJobCountdown` (`MM:SS` / `H:MM:SS`): `src/ui/components/civilization/jobProjection.ts:93-106`.<br>- Hiển thị đồng hồ + số giây còn lại trên **cả** `ACTIVE` lẫn `PENDING`: mở đất (`MapGridView.tsx:965, 1015-1024`), đặt công trình mới (`MapGridView.tsx:1082-1084, 1186-1199`), nâng cấp (`MapGridView.tsx:1086-1091, 1248-1263`). |
| **6** | **Số giây trên bản đồ giảm từng giây khi đang Focus (`RUNNING`), đứng yên khi `PAUSED`/nghỉ, hồi về giá trị cũ khi `Give Up`/`INTERRUPTED`** | **Có** *(kèm lưu ý điều hướng)* | - `CivilizationScreen.tsx:239, 254, 275-280, 290-300, 364-372, 830, 898, 913` tạo duy nhất `setInterval(..., 1000)` thuần UI (`0` ghi storage) khi `isLiveFocusTicking(sessionSnapshot)` đúng (`status === 'RUNNING'` ở pha `FOCUS`), tính `computeLiveSessionElapsedFocusSeconds` (`jobProjection.ts:37-88`) → `projectJobs(civState, liveFocusSeconds)` (`jobs.ts:510-515`) và truyền `projectedJobs` xuống `MapGridView`, `BuildingDetailsModal`, `ClearingChunkModal`.<br>- Khi `PAUSED` đóng băng theo `currentPauseStartedAt`; khi `SHORT_BREAK`/`LONG_BREAK` đóng băng tại `totalCompletedFocusMinutes * 60`; khi `ABANDONED` (`Give Up`) hoặc `INTERRUPTED` trả về `0` nên `remainingSeconds` quay lại đúng giá trị đã lưu trong storage.<br>- *Lưu ý kiến trúc hiện hành:* `src/App.tsx:204-205` và `src/ui/utils/sessionNavigation.ts:24-36` (`resolveEffectiveTab`) đang khóa popup ở tab `'focus'` khi `session.status !== 'IDLE'` (luồng popup bình thường chỉ quay lại tab `'map'` sau khi thoát phiên); bộ đếm chiếu `1s` hoạt động trực tiếp trên `CivilizationScreen` bất cứ khi nào màn hình bản đồ được render kèm `session` hoặc nhận `GET_SESSION_STATE`. |
| **7** | **Giải thích khung viền chấm xanh dương ở ảnh chụp mở đất `1:00:00` (60 phút)** | **Đã xác định rõ** | - Trước bản vá 5E-1b, ô đang dọn đất chỉ có khung viền & đếm ngược nên dễ nhìn nhầm thiếu lớp phủ. Trong mã hiện tại:<br>  1. Nút mảnh đất dọn rừng (`MapGridView.tsx:989`) có viền vàng cam nét đứt (`border-2 border-dashed border-amber-300/90 bg-amber-950/35`).<br>  2. Phủ bên trên là **lớp vải `.fq-construction-tarp`** (`MapGridView.tsx:992-996`, `src/index.css:277-296`) với viền trắng nét đứt (`border: 1.5px dashed rgba(248, 250, 252, 0.85)`) và vòng sáng trong màu xanh dương nhạt (`box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.45)`).<br>  3. Với ô **đặt công trình mới**, còn có thêm `ring-1 ring-sky-400/75 bg-sky-950/15` (`MapGridView.tsx:1134`) và chấm xanh lơ Stage 0 (`'C' = #76e4ff` trong `constructionSpriteData.ts:19-35`). |

---

## 2. Vá Thiếu Sót & Đồng Bộ Tài Liệu Nhỏ (Bước 2)

Không thêm tính năng mới, không đổi cơ chế/giá/cân bằng, không thêm tài sản ảnh mới, giữ 100% parity EN/VI:

- **UI & Chiếu `1s` đã vá sẵn trong mã 5E-1b:**
  - `src/ui/components/civilization/MapGridView.tsx`: phủ `.fq-construction-tarp`, render búa (`117`) / rìu (`127`) / cuốc chim (`115`) lơ lửng kèm `.fq-tool-strike` tắt khi `reducedMotion`, nhãn `"Đang đào"` / `"Digging"` và `"Đang dọn rừng"` / `"Clearing forest"`, giàn gỗ `.fq-construction-scaffold` khi nâng cấp mà giữ nguyên sprite cấp cũ, đồng hồ `CLOCK`/`HOURGLASS` + đếm ngược tới giây cho cả `ACTIVE` và `PENDING`.
  - `src/index.css`: định nghĩa `.fq-construction-tarp`, `.fq-construction-scaffold`, `@keyframes fq-tool-strike` và quy tắc `@media (prefers-reduced-motion: reduce)`.
  - `src/ui/components/civilization/CivilizationScreen.tsx` & `src/ui/components/civilization/jobProjection.ts`: nối `GET_SESSION_STATE` + `setInterval` 1000ms thuần UI vào `projectJobs(...)`.
  - `src/i18n/locales/en.ts` & `src/i18n/locales/vi.ts`: đồng bộ đầy đủ các khóa `civ.job.clearingBadge`, `civ.job.diggingBadge`, v.v.
- **Bản sửa tài liệu thực hiện trong lượt kiểm tra này:**
  - `docs/sprites/TILE_INDEX.md:36-37`: đảo lại mô tả bị ngược trước đó để khớp chính xác với mã UI (`0` `CLOCK` = việc `ACTIVE`, `1` `HOURGLASS` = việc `PENDING` đang xếp hàng).

---

## 3. Xử Lý `v6_constructionJobsSchema` & `CURRENT_SCHEMA_VERSION = 6` (Bước 3)

- **Lý do giữ nguyên `CURRENT_SCHEMA_VERSION = 6` và `src/storage/migrations/v6_constructionJobsSchema.ts`:**
  1. Migration v6 đang được đăng ký và thực thi chủ động trong `src/storage/migrations/migrationRunner.ts:9, 11, 19` (`ALL_MIGRATIONS`) và chạy khi `chrome.runtime.onInstalled` (`src/background/index.ts:71-72`).
  2. Migration v6 nâng cấp an toàn dữ liệu người dùng từ v5 lên v6 bằng cách khởi tạo `jobs: []` và `founderRole: null` trên `fq_civilization` (đồng thời chữa lỗi nếu `fq_civilization` bị hỏng), bảo toàn 100% `buildings`, `villagers`, `grid`, `era`, `ECONOMY`, `QUESTS`, `DAILY_STATS`.
  3. Toàn bộ chuỗi kiểm thử migration và state (`__tests__/storage/v6Migration.test.ts`, `v3Migration.test.ts`, `v5Migration.test.ts`, `villagerMigration.test.ts`, `villagerWander.test.ts`) cùng các tài liệu (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md`) đều đã đồng bộ ở `CURRENT_SCHEMA_VERSION = 6`. Chỉ có `respond.md` bản 5E-1 cũ ghi nhầm là `5` và đã được chỉnh chính xác trong báo cáo này.

---

## 4. Kiểm Thử Đã Xác Minh (Bước 4)

- **`__tests__/background/constructionJobsIntegration.test.ts` (`365` dòng):** chạy trực tiếp qua luồng `SessionCoordinator` & `CivilizationCoordinator` thật dưới `StorageMutex` (không gọi tắt `advanceJobs`):
  - `completeCountdown` cộng đúng số giây Focus vào job `ACTIVE`/`PENDING`.
  - `finishStopwatch` dưới 5 phút (`4m`), `giveUpCountdown` (`ABANDONED`), `recoverSession({ reason: 'EXTENSION_RELOADED' })` (`INTERRUPTED`), và `advancePomodoroStage` kết thúc giữa break đều quyết toán **`0` giây** cho job xây dựng; hoàn thành phiên Pomodoro 2 chu kỳ cộng đúng `1800s`.
  - Kiểm tra `CANCEL_CONSTRUCTION_JOB` hoàn `100%` (chưa làm giây nào) / `50%` (đã làm > 0s), hủy nối tầng upgrade, giải phóng ô đất khi hủy place, chặn mở rộng trùng chunk, và tuyển dân đánh thức job `PENDING`.
- **`__tests__/ui/constructionJobsUi.test.ts` (đặc biệt test `5E-1b UI Patch` dòng `540-789`):** xác minh ánh xạ búa/rìu/cuốc chim, lớp vải `.fq-construction-tarp`, giàn gỗ `.fq-construction-scaffold`, `prefers-reduced-motion` tắt `.fq-tool-strike`, nhãn EN/VI (`"Digging"`/`"Đang đào"`, `"Clearing forest"`/`"Đang dọn rừng"`), đếm ngược cho cả `ACTIVE` và `PENDING`, và chiếu `1s` khi `RUNNING`, đứng yên khi `PAUSED`, hồi về `30:00` khi `ABANDONED`/`INTERRUPTED`.
- **`__tests__/storage/v6Migration.test.ts`:** kiểm tra nâng cấp v5 → v6 idempotent, bảo toàn toàn bộ dữ liệu cũ và tự phục hồi `fq_civilization` lỗi.
- **`__tests__/ui/i18nStaticGuard.test.ts`:** bảo đảm parity 100% EN/VI, 0 khóa mồ côi, 0 audio file trong `public/`.

---

## 5. Kết Quả Kiểm Định Tự Động Thực Tế (Bước 5)

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Toàn bộ `src/` và `__tests__/` sạch lỗi TypeScript |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`30` tệp, `1,428,633 B`)** | **`0` tệp audio** trong `public/` & `dist/`; `hasAistudioDir = false` |
| **Chi tiết bundle `dist/`** | Vite 8 MV3 build (`873ms`) | `popup-*.js`: `906.74 kB` · `popup-*.css`: `103.01 kB` · `questEngine-*.js`: `173.50 kB` · `background.js`: `120.40 kB` · `translator-*.js`: `83.82 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe |
| **Test Suite (`npm test`)** | `npm test` (chạy 1 lượt sau build) | **`712 / 712 PASS` (`0` fail, `0` skipped)** | Thời gian chạy `32,193 ms` (~32.2s); bao gồm `MV3 Music Packaging` |
| **Parity EN/VI & ErrorCodes** | `src/i18n/locales/{en,vi}.ts` & `errorTranslator.ts` | **`666 / 666` khóa (`100%`)** · **`122` ErrorCodes** | Khớp hoàn toàn 2 ngôn ngữ |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA THỰC HIỆN** | Cần bạn Load unpacked `dist/` để nghiệm thu trực quan lớp vải, dụng cụ đập, giàn gỗ nâng cấp & đếm ngược |

DỪNG — CHỜ DUYỆT MILESTONE 5E-1b.
