# BÁO CÁO NGHIỆM THU — MILESTONE 5D-2 + 5E-3 (GỘP): AWARDS THẬT & HOẠT ẢNH DÂN LÀNG VÀO HANG

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5E-2b** trước đó đã được sao lưu nguyên vẹn tại `respond_5d2_5e3_prev.md`; mọi file `respond_*_prev.md` khác trong repo đều được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Phần A — 5D-2** (hệ thống **13** thành tựu Stone Age có bậc `I–V`, Schema v7 `fq_awards` backfill kèm `seen: true`, mở khóa vĩnh viễn một chiều từ hành vi thật, `AwardsCoordinator`, tab `Awards` thật thay `"Coming soon"`, badge & toast mở khóa, simulator parity, God Mode `DEV_UNLOCK_ALL_AWARDS` / `DEV_RESET_AWARDS`, `vite.config.ts` triệt tiêu `jsxDEV` khỏi `dist/`, `0` Coins / `0` XP / `0` thu nhập thụ động), **Phần B — 5E-3** (hoạt ảnh thuần UI đưa dân làng mới tuyển từ `RECRUIT_VILLAGER` đi từ rìa rừng/đất mở vào cửa Hang trú ẩn `(cave.x+1, cave.y+2)`, tối đa `3` luồng đồng thời, `<= 3000ms`, không chạy với `SELECT_FOUNDER`, tắt khi `prefers-reduced-motion`, `0` ghi storage), đồng bộ 5 tài liệu, và kiểm định toàn repo (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`30` tệp, `1,216,618 B`, `0` tệp audio, `0` dấu vết God Mode / `jsxDEV` trong `dist/`**, **`npm test` = `762 / 762 PASS`**, **`753 / 753` khóa EN/VI**, **`130` ErrorCodes**). **Luồng thực tế trên trình duyệt Chrome thật (`>= 116`) chưa kiểm chứng trên Chrome thật** vì môi trường headless không chạy trình duyệt Chrome; chi tiết cần kiểm tra ghi tại mục 5.

---

## 1. Phần A (5D-2) — Hệ Thống Thành Tựu (`Awards`) Thật

### 1.1. Đối chiếu Chặng 0 & Ràng buộc Kinh tế / Schema
- **Không thưởng kinh tế & không thu nhập thụ động:** Toàn bộ `13` thành tựu Stone Age trao **`0` Coins, `0` XP, `0` passive income** (`rewardPlaceholder` giữ thuần metadata chưa kích hoạt); hoàn toàn không có lore/chữ kể chuyện hay yếu tố ma thuật/siêu nhiên.
- **Không thêm asset ảnh nhị phân mới & không thêm quyền:** Toàn bộ biểu tượng thành tựu tái sử dụng sprite sheet sẵn có (`clock_tiles_16.png` `#1, #2`; `kenney-tiny-town` `#17, #83, #93, #95, #106, #115, #117, #127`; `kenney-tiny-dungeon` `#86, #99, #117`) thông qua `AwardIcon.tsx`. `manifest.json` giữ nguyên quyền cũ.
- **Schema v7 & Backfill an toàn (`src/storage/migrations/v7_awardsSchema.ts`, `migrationRunner.ts`):** Nâng `CURRENT_SCHEMA_VERSION = 7` và thêm `STORAGE_KEYS.AWARDS = 'fq_awards'` (`CURRENT_AWARDS_STATE_VERSION = 1`). Khi nâng cấp từ bản cũ, `v7_awardsSchema.up` gọi `backfillAwardsFromHistory` đánh giá đồng bộ `Economy`, `DailyStats`, `Quests`, `Civilization` hiện có và đánh dấu mọi bậc đã đạt **`seen: true`** để người chơi cũ không bị ngập toast/badge khi vừa nâng cấp, đồng thời không sửa các khóa dữ liệu gốc khác và giữ nguyên idempotency khi chạy lại.

### 1.2. Domain thuần & 13 Thành tựu Stone Age (`src/types/awards.ts`, `src/core/awards/`)
- **`STONE_AGE_AWARDS_CATALOG` (`awardsCatalog.ts` — `13` mục, 3 nhóm):**
  - **Focus (`4`):** `focus_hours` (60 / 300 / 900 / 2400 / 6000 phút), `focus_sessions` (1 / 5 / 15 / 35 / 75 phiên), `long_haul` (25 / 45 / 60 / 90 / 120 phút/phiên), `focus_streak` (3 / 7 / 14 / 30 / 60 ngày liên tiếp).
  - **Quests (`2`):** `quest_keeper` (1 / 5 / 15 / 30 / 60 nhiệm vụ đã claim), `perfect_day` (1 / 3 / 7 / 14 / 30 ngày claim đủ cả 3 Daily Quests, chống trùng bằng `perfectDayDateKeys` tối đa 90 ngày gần nhất).
  - **Civilization (`7`):** `player_level` (Lv. 2 / 4 / 6 / 8 / 10), `builder` (1 / 3 / 6 / 10 / 15 công trình đã xây), `master_builder` (1 / 3 / 5 / 7 / 9 công trình nâng cấp tối đa `maxLevel`), `land_clearer` (1 / 3 / 6 / 10 / 15 chunk mở rộng), `tribe` (1 / 3 / 5 / 8 / 10 tổng dân làng kể cả Founder), `tribe_complete` (1 bậc — đủ cả 3 vai trò `elder` + `crafter` + `woodworker`), `era_ready` (1 bậc — `evaluateEraAdvance.eligible === true`, giữ nguyên `era === 'STONE_AGE'`).
- **Động cơ thuần & Mở khóa một chiều (`awardsEngine.ts`, `awardsState.ts`):** `evaluateAwards` luôn giữ nguyên các bậc đã mở (`unlockedAt`, `seen`) — tuyệt đối không khóa lại nếu người chơi phá hủy công trình hay giảm số công trình max cấp; `sanitizeAwardState` & `normalizeAwardCounters` lọc sạch dữ liệu hỏng.

### 1.3. Background, Storage Atomic, ErrorCodes & UI (`src/background/`, `src/storage/`, `src/ui/`, `src/dev/`)
- **Cập nhật bộ đếm nguyên tử trong cùng `StorageMutex`:**
  - `StorageManager.commitSessionOutcomeInternal`: chỉ cập nhật `longestSessionMinutes` khi phiên `COMPLETED`.
  - `QuestCoordinator.claimQuestReward`: cập nhật `totalQuestsClaimed` và `perfectDaysCount` (khi cả 3 Daily Quest trong ngày đều `claimed`).
  - `CivilizationCoordinator.placeBuilding`: cập nhật `totalBuildingsBuilt` qua `awardCountersDelta: { buildingsBuilt: 1 }`.
- **`AwardsCoordinator` & Message Protocol (`src/background/awardsCoordinator.ts`, `messageHandler.ts`, `messages.ts`, `errors.ts`):** Phục vụ `GET_AWARDS_STATE` (evaluate + persist nếu phát sinh mở khóa mới) và `MARK_AWARDS_SEEN` (kiểm tra payload qua `INVALID_AWARDS_PAYLOAD`), nâng tổng `ALL_KNOWN_ERROR_CODES` trong `src/i18n/errorTranslator.ts` lên **`130`** mã (thêm `INVALID_AWARDS_PAYLOAD`, `AWARDS_STATE_CORRUPTED`).
- **UI Tab `Awards`, Badge & Toast (`src/ui/components/awards/*`, `Navbar.tsx`, `App.tsx`, `locales/{en,vi}.ts`):**
  - `AwardsView.tsx` + `AwardDetailsModal.tsx` + `AwardIcon.tsx` + `awardFormatting.ts`: thay hoàn toàn `"Coming soon"`, vừa khung popup `400×600px`, lọc 4 tab (`Tất cả / Tập trung / Nhiệm vụ / Văn minh`), hiển thị tổng số bậc đã mở, nhãn `MỚI` / `NEW` cho thành tựu mới mở, các pip bậc `I–V`, thanh tiến độ `role="progressbar"`, modal chi tiết từng bậc + ngày mở khóa, và nút `Thử lại` khi lỗi tải.
  - `Navbar.tsx` hiển thị `awards-unseen-badge` (ẩn ở `0`, `1..9`, `9+` ở `>= 10`) và `App.tsx` hiện toast mở khóa `award-unlock-toast` nhẹ ở góc trên (không chặn thao tác, tôn trọng `prefers-reduced-motion`).
- **Simulator, God Mode & Build Guard (`extensionClient.ts`, `src/dev/*`, `vite.config.ts`):** Đồng bộ `GET_AWARDS_STATE` / `MARK_AWARDS_SEEN` + counters trên `extensionClient.ts`; kích hoạt `DEV_UNLOCK_ALL_AWARDS` & `DEV_RESET_AWARDS` trong `DevGodModePanel.tsx` / `devBackgroundService.ts` / `devSimulatorPlugin.ts`; đồng thời bổ sung `if (!isDevRuntime) { process.env.NODE_ENV = 'production'; }` trước khi khởi tạo `react()` trong `vite.config.ts` để triệt tiêu hoàn toàn `jsxDEV` khỏi `dist/` ngay cả khi biến môi trường shell bên ngoài là `NODE_ENV=development`. Mở rộng từ điển `en.ts` / `vi.ts` lên **`753 / 753` khóa parity (100%)**.

---

## 2. Phần B (5E-3) — Hoạt Ảnh Dân Làng Mới Tuyển Đi Vào Hang Trú Ẩn (Thuần UI)

- **Phạm vi kích hoạt nghiêm ngặt (`src/ui/components/civilization/CivilizationScreen.tsx`):**
  - Chỉ gọi `enqueueVillagerCaveEntry(res.data.recruitedVillager, res.data.civilization)` duy nhất bên trong `handleRecruitVillager` sau khi `RECRUIT_VILLAGER` thành công — **tuyệt đối không chạy khi `SELECT_FOUNDER`**.
  - Giới hạn tối đa `MAX_CONCURRENT_VILLAGER_ENTRIES = 3` luồng đồng thời, tự động dọn timer khi unmount hoặc khi `document.hidden` chuyển sang ẩn, và bỏ qua ngay nếu `prefersReducedMotion()` bật.
  - **0 ghi storage, 0 message background, 0 thay đổi kinh tế/schema.**
- **Thuật toán đường đi 3 tình huống (`src/ui/components/civilization/villagerEntryAnimation.ts`):**
  - `computeVillagerCaveEntryPlan({ cave, buildings, gridMap })` tính toán đích vào là cửa *Rock Shelter* (`doorwayCell = (cave.x + 1, cave.y + 2)`) qua ô trước cửa (`entranceCell = (cave.x + 1, cave.y + 3)`):
    1. **`walk-from-edge`:** BFS tối đa `10` bước trên các ô đi được (`collectWalkableCells`), xuất phát từ rìa tiếp giáp rừng khóa, đi dọc ô trống tới `entranceCell` rồi bước lên `doorwayCell` và mờ dần vào hang (`<= 3000ms`).
    2. **`fade-in-settlement`:** Khi sân quanh hang bị vây kín không tới được rìa rừng, dân làng hiện mờ (`200ms` fade-in) từ ô đi được xa nhất trong sân kín rồi đi vào `doorwayCell`.
    3. **`doorway-settle`:** Khi ngay cả `entranceCell` cũng bị bịt kín, thực hiện settle ngắn tại cửa hang (`< 500ms`, `VILLAGER_ENTRY_DOORWAY_SETTLE_MS = 440`).
  - **Hướng sprite & chống nhân đôi (`useVillagerWander.ts`, `MapGridView.tsx`, `src/index.css`):**
    - Bước cuối đi lên Bắc vào hang luôn qua `getVillagerAnimationForDirection('up', true) === 'idle'`, tuyệt đối không dùng `walk_down`.
    - `useVillagerWander` nhận `suppressedVillagerIds` từ `activeVillagerEntries` nên dân đang đi vào hang không bị render trùng lặp trong lớp đi dạo; khi `prefers-reduced-motion: reduce`, lớp `.fq-villager-entry-sprite` tắt transition và `MapGridView` bỏ qua hoạt ảnh, hiện dân làng đứng `idle` ngay lập tức.

---

## 3. Tài Liệu & Sửa Test Kế Thừa Đã Thực Hiện

- **Cập nhật assertion `CURRENT_SCHEMA_VERSION` tại các test cũ:**
  - `__tests__/storage/v3Migration.test.ts` (dòng 157–200): đổi 4 assertion `6` cũ sang `CURRENT_SCHEMA_VERSION` (`7`), giữ nguyên assertion kiểm tra gọi trực tiếp `v3_questsSchema.up` trả về `3`.
  - `__tests__/storage/v5Migration.test.ts` (dòng 176–178): đổi 2 assertion `6` cũ sang `CURRENT_SCHEMA_VERSION` (`7`).
- **Đồng bộ 5 tài liệu repo:**
  - `PROJECT_STATUS.md`: cập nhật trạng thái hiện tại, timeline **Milestone 5D-2 + 5E-3**, Schema v7, `753/753` khóa EN/VI, `130` ErrorCodes, `762/762 PASS`, gỡ mô tả `"Awards còn giữ chỗ Coming soon"` ở mục kiểm soát hiện hành.
  - `PRODUCT_SPEC.md` (`1.13.0-synced`): cập nhật §7 (hoạt ảnh vào hang 5E-3), §12–§13 (Schema v7, `753` khóa, `130` ErrorCodes) và bổ sung **§14 Hệ thống Thành tựu (`Awards`)**.
  - `README.md`: cập nhật Highlights, lệnh dev/test (`762/762`), mục `GOD MODE (dev)` (gồm `DEV_UNLOCK_ALL_AWARDS`/`DEV_RESET_AWARDS`), bỏ mục roadmap Awards placeholder.
  - `ARCHITECTURE.md` (`1.17.0`): cập nhật Schema v7 (`v7_awardsSchema.ts`, `fq_awards`, `AwardsCoordinator`), `GET_AWARDS_STATE` / `MARK_AWARDS_SEEN`, `AwardsView`, `villagerEntryAnimation.ts` 5E-3, `vite.config.ts` `process.env.NODE_ENV = 'production'`, `753` khóa & `130` ErrorCodes.
  - `docs/sprites/TILE_INDEX.md`: ghi nhận bảng tái sử dụng `13` tile icon từ `clock_tiles_16.png`, `tiny-town` và `tiny-dungeon` cho `AwardIcon.tsx` (`0` asset nhị phân mới).

---

## 4. Kết Quả Kiểm Định Tự Động Thực Tế

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Toàn bộ `src/`, `src/dev/` và `__tests__/` sạch lỗi TypeScript |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`30` tệp, `1,216,618 B`, `918ms`)** | `1,792` modules; **`0` tệp audio** trong `public/` & `dist/`; **`0` dấu vết God Mode / `jsxDEV` / `validateDOMNesting` trong `dist/`**; `manifest.json` giữ nguyên `5` quyền |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup-iTqPoHey.js`: `669.31 kB` · `dateUtils-DWsP360f.js`: `172.87 kB` · `background.js`: `127.18 kB` · `popup-mGY207Ch.css`: `112.26 kB` · `translator-DuvZb1wH.js`: `93.81 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe; `process.env.NODE_ENV = 'production'` khóa chặt build ngay cả khi shell đặt `NODE_ENV=development` |
| **Test Suite toàn repo** | `npm test` (chạy sau khi sửa toàn bộ code & test) | **`762 / 762 PASS` (`0` fail, `0` skipped)** | `29,286.41 ms` (~29.3s); `+24` tests mới (`738 → 762`): `awardsEngine.test.ts` (`7`), `v7Migration.test.ts` (`2`), `awardsIntegration.test.ts` (`4`), `awardsView.test.ts` (`5`), `villagerCaveEntryAnimation5e3.test.ts` (`5`), `devGodModeBuildIsolation5e2b.test.ts` (`3`) |
| **Parity EN/VI & ErrorCodes** | `locales/{en,vi}.ts` & `errorTranslator.ts` | **`753 / 753` khóa (`100%`) · `130` ErrorCodes** | `i18nStaticGuard` xanh toàn repo (`0` chuỗi thiếu khóa) |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA KIỂM CHỨNG TRÊN CHROME THẬT** | Môi trường headless không chạy trình duyệt Chrome thật; vui lòng kiểm chứng theo checklist mục 5 |

---

## 5. Checklist Kiểm Chứng Trên Chrome Thật & Dev Server

1. **Phần A (5D-2) — Tab `Awards` & Backfill / Unlock thật:**
   - Mở popup (`npm run dev` hoặc unpacked Chrome `dist/`) → chuyển sang tab `Awards` (thanh tab đáy thứ 4): kiểm tra hiển thị đủ `13` thành tựu Stone Age, lọc qua 4 tab `All / Focus / Quests / Civilization`, bấm mở modal chi tiết từng bậc `I–V`, xác nhận không cộng Coins/XP/thu nhập thụ động và không có lore/ma thuật.
   - Trên `npm run dev`, mở `GOD MODE (dev)` → thử `Unlock all awards` và `Reset awards` để kiểm tra badge `awards-unseen-badge` trên `Navbar`, toast mở khóa ở đầu popup, và hành vi tự xóa badge + mất nhãn `NEW` sau khi ghé tab `Awards` (`MARK_AWARDS_SEEN`).
   - Kiểm tra profile cũ có sẵn dữ liệu trước khi nâng lên Schema v7: các thành tựu đạt sẵn từ lịch sử phải mở khóa và đánh dấu `seen: true` (không nổ toast hàng loạt).
2. **Phần B (5E-3) — Hoạt ảnh dân làng mới tuyển đi vào Hang trú ẩn:**
   - Đã chọn Founder (xác nhận chọn `SELECT_FOUNDER` **không** phát hoạt ảnh đi từ rừng vào hang).
   - Mở *Rock Shelter* → bấm tuyển 1–3 dân làng mới (`RECRUIT_VILLAGER`): quan sát dân làng mới đi từ rìa rừng qua ô trống vào cửa hang `(cave.x+1, cave.y+2)` (`<= 3s`), không nhân đôi sprite trong `useVillagerWander`, bước đi lên cửa hang không bị quay đầu sai (`walk_down`).
   - Bật `Reduce motion` trong hệ điều hành/DevTools → tuyển dân mới: hoạt ảnh được bỏ qua sạch sẽ, dân đứng `idle` ngay lập tức.
3. **Cô lập Production trong Chrome thật (`dist/`):**
   - Chạy `npm run clean && npm run build` → load `dist/` tại `chrome://extensions/` → xác nhận **0** có nút `"GOD MODE (dev)"`, **0** lỗi CSP/console khi mở đủ 5 tab popup và trang `blocked.html`.

**DỪNG — CHỜ DUYỆT MILESTONE 5D-2 + 5E-3.**
