# BÁO CÁO NGHIỆM THU — MILESTONE 5E-1c: HÀNG RÀO CÔNG TRƯỜNG (`ConstructionFence` — CỌC GỖ 4 GÓC + VẢI CĂNG QUANH RÌA)

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5E-1b** trước đó đã được sao lưu nguyên vẹn sang `respond_5e1c_prev.md`; mọi file `respond_*_prev.md` khác (`respond_5e1b_prev.md`, `respond_5e1_prev.md`, `respond_5d1_prev.md`, `respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, v.v.) vẫn được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã thay thế hoàn toàn lớp phủ kín ô `.fq-construction-tarp` bằng thành phần dùng chung `ConstructionFence` (chỉ đổi hình ảnh: 4 cọc gỗ góc + 4 dải vải/băng be-ngà căng quanh rìa, bên trong 100% trong suốt), cập nhật test 5E-1b (không xóa), bổ sung test 5E-1c, cập nhật ngắn `PROJECT_STATUS.md`, và hoàn tất kiểm định tự động (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`30` tệp, `1,434,234 B`, `0` tệp audio**, **`npm test` = `713 / 713 PASS`**). **Kiểm thử trực quan & tương tác trên Google Chrome thật (`>= 116`) chưa được thực hiện và cần bạn kiểm chứng khi nghiệm thu.**

---

## 1. Thay Đổi Hình Ảnh & Kỹ Thuật (Chỉ Đổi Hình Ảnh — Không Đổi Cơ Chế)

1. **Thành phần mới `src/ui/components/civilization/ConstructionFence.tsx`:**
   - Nhận `width`, `height` (tính theo kích thước ô/chunk thực tế `32×32`, `64×64`, `96×96`, `128×128`, tự co giãn đồng bộ theo mọi mức zoom trong `MapGridView`), `status` (`'ACTIVE' | 'PENDING'`), `reducedMotion`, `variant` (`'building' | 'clearing'`), và `testId`.
   - **Bên trong ô trong suốt 100%:** SVG nội tuyến `fill="none"`, `shapeRendering="crispEdges"`, `overflow-hidden` gói chặt trong `[0..width, 0..height]` (không tràn sang ô lân cận), giữ `pointer-events-none` để không chặn thao tác bấm ô; giữ nguyên `data-testid="building-tarp-${inst.id}"` và `data-testid="clearing-tarp-${origin.x}-${origin.y}"` trên phần tử gốc để giữ tương thích selector.
   - **4 cọc gỗ ở 4 góc (`fence-stake-tl/tr/bl/br`):** Vẽ theo bảng màu Tiny Town (`#3f2631` viền tối, `#bd6c4a`/`#763b36` thân gỗ nâu, `#eaa56c` đỉnh đầu cọc hơi nhô trên dây buộc, `#262b44` opacity `0.45` tạo chấm bóng nhỏ trên cỏ tại chân cọc `fence-stake-shadow-*`).
   - **4 dải vải/băng căng quanh rìa (`fence-ribbon-back/front/left/right`):** Màu be/trắng ngà (`#fef3c7` / `#f5deb3`), sọc màu mảnh (`#e38628`), nút buộc (`#cf8254`) nối hai đầu vào cọc và võng nhẹ ở giữa; cạnh trước mỏng & thấp hơn (`frontThickness` nhỏ hơn `backThickness`/`sideThickness`) để không che sprite và nhãn/đồng hồ; vải chỉ chạy sát chu vi, không đi vào tâm ô.
   - **Hoạt ảnh & trạng thái:**
     - `ACTIVE` (`!reducedMotion`): vải đung đưa nhẹ 1–1.25px (`.fq-fence-ribbon-sway` và `.fq-fence-ribbon-sway-side` tại `src/index.css:277-303`).
     - `PENDING`: vải & cọc đứng yên, làm mờ nhẹ (`opacity-65`, `data-fence-animated="false"`).
     - `prefers-reduced-motion`: đứng yên hoàn toàn qua cả prop JS `reducedMotion` lẫn CSS `@media (prefers-reduced-motion: reduce)` (`src/index.css:343-345`).
2. **Loại bỏ lớp phủ kín ô trong `src/index.css` & `src/ui/components/civilization/MapGridView.tsx`:**
   - Xóa hoàn toàn `.fq-construction-tarp` (ô chéo 45°/-45°, nền xám mờ, viền nét đứt trắng, vòng sáng xanh bên trong) trong `src/index.css`.
   - Trong `MapGridView.tsx`:
     - Đặt mới (`placeJob`): bỏ `ring-1 ring-sky-400/75 bg-sky-950/15` và `opacity-95` trên `PixelSprite`, gắn `<ConstructionFence ... testId={\`building-tarp-${inst.id}\`} />` trước dụng cụ (`building-tool-*`), nhãn `"Đang đào"`/`"Digging"` (`z-[12]`) và đồng hồ + đếm ngược (`z-[12]`), giữ nguyên chọn/hover `hover:ring-1 hover:ring-white/80`.
     - Mở đất (`clearingJobs`): bỏ `bg-amber-950/35` & `border-2 border-dashed border-amber-300/90` để nền rừng đang dọn nhìn rõ, giữ hover/focus ring (`hover:bg-amber-950/10 hover:ring-1 hover:ring-amber-300/75 focus-visible:ring-2 focus-visible:ring-amber-300`), gắn `<ConstructionFence ... testId={\`clearing-tarp-${origin.x}-${origin.y}\`} />`, giữ nguyên rìu `127`, nhãn `"Đang dọn rừng"`, đồng hồ + đếm ngược.
     - Công trình **đã hoàn thành** không render `ConstructionFence`; công trình **đang nâng cấp** giữ nguyên giàn gỗ `.fq-construction-scaffold` (`building-upgrade-scaffold-*`), không gắn cọc/vải.
3. **Bảo toàn bất biến:** Không đổi cơ chế, giá, dữ liệu, schema (`CURRENT_SCHEMA_VERSION = 6`), đếm ngược `1s`, i18n (`666 / 666` khóa EN/VI không thêm chuỗi mới), hay tài sản ảnh nhị phân (`0` file asset mới). Đã cập nhật ngắn `PROJECT_STATUS.md`.

---

## 2. Kiểm Thử (`__tests__/ui/constructionJobsUi.test.ts`)

- **Số test trước 5E-1c:** **`712`** tests (`7` tests trong `constructionJobsUi.test.ts`).
- **Test cũ được cập nhật (KHÔNG xóa):**
  - `test('5E-1b UI Patch: ...')` (`__tests__/ui/constructionJobsUi.test.ts:539-785`): đổi assertion từ `.fq-construction-tarp` sang kiểm tra không còn `.fq-construction-tarp`, có `building-tarp-*` / `clearing-tarp-*` cùng 4 cọc (`fence-stake-tl/br`), 4 dải vải (`fence-ribbon-back/front`), animation `.fq-fence-ribbon-sway` khi `ACTIVE`, và dừng `.fq-fence-ribbon-sway` + `data-fence-animated="false"` khi `reducedMotion = true`.
- **Test mới bổ sung (`+1`):**
  - `test('5E-1c ConstructionFence: ...')` (`__tests__/ui/constructionJobsUi.test.ts:787-934`): xác minh độc lập `ConstructionFence` (`ACTIVE` có `.fq-fence-ribbon-sway` & `data-fence-animated="true"` không mờ, `PENDING` có `opacity-65` & đứng yên, `reducedMotion` đứng yên, `fill="none"`, `pointer-events-none`, đủ 4 `fence-stake-*` + `fence-stake-shadow-*` + 4 `fence-ribbon-*`), và tích hợp trên `MapGridView` (có ở đặt mới & mở đất, KHÔNG có ở công trình hoàn thành & công trình nâng cấp, nâng cấp chỉ giữ `.fq-construction-scaffold`, không có `fq-construction-tarp`/`bg-amber-950/35`/`bg-sky-950/15`, đếm ngược `30:00` / `Lv.2 · 03:00` giữ nguyên).
- **Số test sau 5E-1c:** **`713`** tests (`8` tests trong `constructionJobsUi.test.ts`, `0` test bị xóa).

---

## 3. Giải Thích Trung Thực Về Tổng Số Test (`715` ở 5E-1 → `712` ở 5E-1b → `713` ở 5E-1c)

- **Giới hạn truy vết trong workspace:** Thư mục `/app/applet` **không phải kho `.git`** (`fatal: not a git repository`), nên không thể chạy `git diff` để đối chiếu từng dòng commit trước lượt 5E-1b và sẽ **không bịa tên các test bị xóa/gộp** không có bằng chứng trực tiếp.
- **Số liệu kiểm đếm trực tiếp từ mã nguồn và các báo cáo lưu trữ (`respond_*_prev.md`):**
  1. Ở **V5.2 (`respond_5d1_prev.md`)** tổng là **`693`**; ở **5D-1 (`respond_5e1_prev.md`)** tổng là **`698`** (`+5`: `v5Migration.test.ts` `+1`, `questEngine.test.ts` `+3`, `questCoordinator.test.ts` `+1`).
  2. Báo cáo **5E-1 (`respond_5e1b_prev.md`)** ghi **`715 / 715 PASS`** khi vẫn ghi `CURRENT_SCHEMA_VERSION = 5` (tức trước khi có `v6Migration.test.ts` `2` test và `5E-1b UI Patch` `1` test).
  3. Khi kiểm đếm thực tế toàn bộ **104 tệp** hiện tại sau 5E-1b (`npm test`), Node test runner chạy tổng cộng **`712`** test (`202` `background` gồm `5` test lặp `downtimeCases` tại `lifecycleRecovery.test.ts:727` + `269` `core` + `30` `storage` + `6` `integration` + `205` `ui`):
     - Nhóm test mới thuộc 5E-1 & 5E-1b đang có trong mã là **`19`** test: `core/jobs.test.ts` (`4`), `background/constructionJobsIntegration.test.ts` (`2` test gộp nhiều kịch bản Stage A), `background/founderSelection.test.ts` (`3`), `ui/constructionJobsUi.test.ts` (`7` = `6` test Stage B + `1` test `5E-1b UI Patch`), `storage/v6Migration.test.ts` (`2`), `core/economyBalance.test.ts` (`+1` `Suite 5`).
     - Các tệp còn lại ngoài nhóm trên hiện tổng cộng **`693`** test (chẳng hạn `ui/villagerSprite.test.ts` hiện có `6` test so với `7` test từng ghi ở V1 trong `respond_villager_v2_prev.md`, còn `constructionJobsIntegration.test.ts` & `constructionJobsUi.test.ts` gộp nhiều kịch bản vào `2` và `6` khối `test(...)`). Không có `.git`, không thể xác nhận chính xác `3–5` `test(...)` nào từng tách lẻ ở bản nháp 5E-1 (`715`) trước khi hợp nhất xuống `712` ở 5E-1b.
  4. Sang **5E-1c**, bổ sung `1` test mới và cập nhật `1` test cũ (`0` xóa) → tổng số test đo được thực tế tăng từ **`712` → `713 / 713 PASS`**.

---

## 4. Kết Quả Kiểm Định Tự Động Thực Tế

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Toàn bộ `src/` và `__tests__/` sạch lỗi TypeScript |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`30` tệp, `1,434,234 B`, `840ms`)** | `1,773` modules; **`0` tệp audio** trong `public/` & `dist/`; `hasAistudioDir = false` |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup-*.js`: `911.68 kB` · `popup-*.css`: `103.67 kB` · `questEngine-*.js`: `173.50 kB` · `background.js`: `120.40 kB` · `translator-*.js`: `83.82 kB` · `offscreen.js`: `3.87 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe |
| **Test Suite (`npm test`)** | `npm test` (chạy 1 lượt sau build) | **`713 / 713 PASS` (`0` fail, `0` skipped)** | Thời gian chạy `32,194.14 ms` (~32.2s); `i18nStaticGuard` xanh |
| **Parity EN/VI** | `src/i18n/locales/{en,vi}.ts` | **`666 / 666` khóa (`100%`)** | Không thêm chuỗi mới, `0` khóa mồ côi |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA THỰC HIỆN** | Cần bạn Load unpacked `dist/` để nghiệm thu theo checklist mục 5 |

---

## 5. Checklist Kiểm Chứng Trên Chrome Thật (`>= 116`)

1. **Đặt công trình mới:** Mở `dist/` trong Chrome, đặt công trình mới (vd: *Foraging Post*, *Rock Shelter*) → thấy **4 cọc gỗ** ở 4 góc + **vải be-ngà căng quanh rìa**, bên trong **trong suốt** nhìn rõ sprite giai đoạn thi công, dụng cụ đập, nhãn `"Đang đào"` (nếu là Hang) và đồng hồ + đếm ngược.
2. **Mở đất:** Chọn mở một chunk rừng → thấy **4 cọc gỗ** + **vải căng quanh rìa** chunk `4×4`, mảnh đất/rừng bên trong nhìn rõ, không có nền mờ/ô chéo phủ kín, rìu + `"Đang dọn rừng"` + đồng hồ rõ nét.
3. **Việc chờ (`PENDING`):** Xếp thêm việc vượt số dân rảnh → hàng rào **đứng yên**, **mờ nhẹ** phân biệt rõ với việc `ACTIVE`.
4. **Zoom vào/ra (`0.6×–2.0×`):** Kéo zoom bản đồ → cọc gỗ và dải vải co giãn đúng tỷ lệ theo ô/chunk, không tràn sang ô lân cận, bấm vào ô vẫn mở modal chi tiết bình thường.
5. **`prefers-reduced-motion`:** Bật Reduced motion của hệ điều hành/DevTools → vải và dụng cụ **đứng yên hoàn toàn**.
6. **Nâng cấp (`UPGRADE_BUILDING`):** Nâng cấp một công trình đã xây → chỉ hiện **giàn gỗ** `.fq-construction-scaffold` + sprite cấp cũ + búa + đếm ngược, **không** có cọc gỗ/vải căng.

**DỪNG — CHỜ DUYỆT MILESTONE 5E-1c.**
