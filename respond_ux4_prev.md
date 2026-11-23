# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-3

**Giai đoạn:** Milestone UX — Giai đoạn UX-3 *(Đưa lớp tối lên trên cây vùng chưa mở với hằng số dùng chung + hệ số cây, bỏ lưới từng ô vùng đã mở & chống khe hở sub-pixel ở mọi mức zoom, đồng bộ `#sprites` — KHÔNG thuộc Phase 5, 5B.5 hay LOFI)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_ux3_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`554 / 554` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. BẤT BIẾN ĐƯỢC BẢO TOÀN

- **Không sửa logic lõi:** Giữ nguyên hoàn toàn thuật toán đặt cây & mẫu `M1–M6` trong `src/ui/components/civilization/terrainDecor.ts` (`getCellDecor` cho cùng input → cùng output 100%), mật độ ~30%, màu nền đất vùng đã mở, độ tối nền `0.44`, `GridMap`, mở đất, đặt/gỡ công trình, civilization core, schema và kinh tế. Không thêm thư viện ngoài.

---

## 2. HIỆN TRẠNG ĐỌC TỪ MÃ NGUỒN & CÁC THAY ĐỔI ĐÃ THỰC HIỆN

### (1) Đưa lớp tối lên trên lớp cây ở vùng chưa mở + Hằng số dùng chung & Hệ số cây
- **Hằng số trong `src/ui/components/civilization/terrainDecor.ts`:**
  - Định nghĩa `LOCKED_FOREST_DARKEN_OPACITY = 0.44` (hằng số dùng chung cho độ tối nền và cây) và `LOCKED_TREE_DARKEN_FACTOR = 1.0` (hệ số tối của cây so với nền; giữ `LOCKED_FOREST_OVERLAY_OPACITY = LOCKED_FOREST_DARKEN_OPACITY` làm alias tương thích ngược).
  - Bổ sung hàm thuần `computeLockedForestOpacities(hasOverlay, darkenOpacity, treeFactor)`:
    - Khi `LOCKED_TREE_DARKEN_FACTOR = 1.0` (mặc định hiện tại): chỉ render đúng thứ tự **nền đất → cây → lớp tối (`bg-slate-950`, `opacity: 0.44`)**, cây và đất tối đồng đều nhau.
    - Khi bạn muốn chỉnh hệ số cây sau này (ví dụ đổi một dòng `LOCKED_TREE_DARKEN_FACTOR = 0.7` trong `terrainDecor.ts` mà không phải sửa cấu trúc UI): `topScrimOpacity` áp lên cây thành `0.44 * 0.7 = 0.308`, đồng thời phần nền xung quanh gốc cây trong cùng ô vẫn được bù đủ để đạt tổng độ tối `0.44`, không lộ ô vuông sáng quanh cây.
- **Component dùng chung `src/ui/components/civilization/TerrainCellLayers.tsx` (+ prop `style` ở `TileImage.tsx`):**
  - Tách phần vẽ các lớp bên trong ô (`baseTile → overlayTile → data-locked-forest="true"`) dùng chung cho cả **`MapGridView.tsx`** (`GridCell`) lẫn **`SpriteGallery.tsx`** (`#sprites`: khối `Locked Forest Darkened (2×)`, 4 panel `8×4 / 8×8`, và `16×11 Locked Forest Algorithm Preview`) để hai nơi không bao giờ lệch nhau.
- **Cập nhật chú thích trong `SpriteGallery.tsx`:**
  - Gỡ bỏ các câu cũ `"while trees stay 100% color"` / `"while trees stay full color"` / `"Locked Floor Darkened (2×)"` (dòng 195, 350, 404, 459, 561), cập nhật sang mô tả nền và cây cùng được làm tối đồng đều (`LOCKED_FOREST_DARKEN_OPACITY`, `LOCKED_TREE_DARKEN_FACTOR`).

### (2) Bỏ lưới ở ô đã mở + Chống hairline seam + Báo cáo hiện trạng ô chưa mở & ranh giới chunk
- **Kiểm tra mọi nguồn tạo đường lưới trong `MapGridView.tsx`:**
  1. **Viền mỏng từng ô đã mở (`GridCell`, dòng 124–127 cũ):**
     - Khi bình thường: `'border-[0.5px] border-emerald-950/15 dark:border-slate-900/35'` → **Đã gỡ**, đổi thành `'border-0'`.
     - Khi ở Placement Mode: `'border-[0.5px] border-emerald-950/20 dark:border-slate-900/40 after:...'` → **Đã gỡ phần `border-[0.5px] ...`**, đổi thành `'border-0 after:absolute after:inset-0 after:pointer-events-none hover:after:bg-emerald-300/35 cursor-crosshair'`.
  2. **Container lưới (dòng 451–459):** Không có `gap`, không `divide-*`, không `outline`, không `ring`, không nền lưới.
  3. **Hiện trạng ô CHƯA mở (không tự sửa theo yêu cầu):** Các ô chưa mở (`isUnlocked === false`, dòng 130–136) **đã dùng sẵn `border-0`** ở mọi trạng thái (bình thường, placement, expansion), hoàn toàn không có lưới/viền riêng.
  4. **Các thành phần được GIỮ NGUYÊN:**
     - Hiệu ứng hover (`hover:after:bg-emerald-300/35`) và vùng ghost đặt công trình (viền `border-emerald-400` / `border-rose-500`).
     - Chế độ Expansion Mode (khung chunk ứng viên `border-emerald-300/90` / `border-amber-300`), khung công trình đã đặt, thanh điều khiển bản đồ (`map-controls-toolbar`).
     - Ranh giới 4×4 Chunk (`Unlocked Chunk Boundaries`, dòng 474–498: `border border-emerald-500/35` + nhãn `(0,0)`): được giữ nguyên vì đây là mốc ranh giới chunk lãnh thổ 4×4, không phải lưới từng ô.
- **Chống đường hở li ti (`hairline seam`) ở mọi mức zoom:**
  - Trước đây `ZOOM_STEP = 0.2`, `handleWheel` tăng giảm `0.1`, và `computeExpansionFitZoom` làm tròn `0.01` (ví dụ `0.44`), khiến kích thước ô sau scale là số thập phân (`32 * 0.8 = 25.6px`, `32 * 0.44 = 14.08px`), dễ lộ đường kẻ mảnh giữa hai ô.
  - Đã thêm `ZOOM_PIXEL_DENOMINATOR = 16`, `snapZoomToIntegerPixels()`, cập nhật `MIN_ZOOM = 0.5`, `EXPANSION_MIN_ZOOM = 0.375`, `ZOOM_STEP = 0.25`, `WHEEL_ZOOM_STEP = 0.125`, và chuẩn hóa `computeExpansionFitZoom` về bội của `1/16`: **ở mọi mức zoom**, `CELL_SIZE * zoom` (`12px..64px`) và `16 * zoom` (`6px..32px`) **đều là số nguyên pixel**. Đồng thời làm tròn `Math.round(pan.x/y)` và gắn `imageRendering: 'pixelated'` cho container lưới (bên cạnh `imageRendering: 'pixelated'` sẵn có trên từng `<img>` trong `TileImage.tsx`).

---

## 3. KIỂM THỬ MỚI & TEST CŨ ĐÃ CẬP NHẬT

- **Test mới (`__tests__/ui/ux3MapAndForestUi.test.ts` — 3 tests SSR):**
  1. Kiểm tra ô rừng chưa mở render đúng thứ tự `nền → cây → lớp tối` (`data-locked-forest="true"` sau `overlayTile`) dùng `LOCKED_FOREST_DARKEN_OPACITY = 0.44` và `LOCKED_TREE_DARKEN_FACTOR = 1.0`; kiểm tra đổi hệ số cây `0.7` qua `computeLockedForestOpacities` & `TerrainCellLayers` giữ độ tối nền `0.44` và giảm độ tối cây xuống `0.308`.
  2. Kiểm tra ô đã mở không còn `border-[0.5px]`, `border-emerald-950`, `border-slate-900`, `divide-`, `outline`, `ring`; vẫn giữ `hover:after:bg-emerald-300/35`, `cursor-crosshair`, công trình, thanh zoom, Expansion Mode, `image-rendering:pixelated` và kích thước pixel nguyên ở mọi mức zoom + auto-fit.
  3. Kiểm tra `SpriteGallery` (`#sprites`) render cùng thứ tự `nền → cây → lớp tối` với `opacity:0.44` ở cả card mẫu tán lá lẫn `16×11 Locked Forest Algorithm Preview`, và đã gỡ mọi dòng chú thích `"trees stay full color"` / `"trees stay 100% color"`.
- **Test cũ bắt buộc cập nhật (1 test):**
  - `__tests__/ui/terrainDecor.test.ts` (dòng **471–496**): test `Terrain Decor Stage 4a-3` trước đây kiểm tra quy tắc cũ `overlayIdx > scrimIdx` (*"Tree overlay MUST render AFTER dark scrim so tree keeps 100% color"*). Đã cập nhật thành kiểm tra quy tắc mới UX-3: `secondTileIdx < scrimIdx` (*"Tree overlay MUST render BEFORE dark scrim so ground and trees darken uniformly"*). Toàn bộ test `getCellDecor` / mẫu `M1–M6` / mật độ 24×24 còn lại giữ nguyên 100% và PASS.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,739 modules transformed`, `681ms`, tổng dung lượng `dist/`: `1,076,448 B`):
  - `dist/index.html`: `0.71 kB` | `dist/assets/popup-DduAWiN5.css`: `87.51 kB`
  - `dist/assets/popup-B6pNM7KC.js`: `759.54 kB` (gzip: `200.64 kB`)
  - `dist/assets/translator-B5-w4v6G.js`: `52.47 kB` | `dist/assets/statsAggregator-DM7wxVkB.js`: `53.96 kB` | `dist/assets/storageKeys-BmLuJ1Do.js`: `0.37 kB`
  - `dist/background.js`: `87.39 kB` | `dist/offscreen.js`: `3.87 kB` | `dist/blocked.js`: `1.32 kB`
- **`npm test` — chạy 3 lần liên tiếp (sau lần sửa code & test cuối cùng):**
  - **Lần 1:** `554 / 554 PASS` (`0` fail, `0` skipped, `0` cancelled, `18,835.57 ms`, Exit `0`).
  - **Lần 2:** `554 / 554 PASS` (`0` fail, `0` skipped, `0` cancelled, `14,944.56 ms`, Exit `0`).
  - **Lần 3:** `554 / 554 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,070.48 ms`, Exit `0`).

---

## 5. GIỚI HẠN KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Chưa xem bằng mắt trực tiếp trên trình duyệt Chrome thật (`400×600` popup và `#sprites`); toàn bộ kiểm tra UI thực hiện qua React SSR (`renderToString`).
- **Các bước để bạn tự kiểm trên Chrome (`chrome://extensions` → Load unpacked `dist/` và trang Web Preview `#sprites`):**
  1. **Mở tab Bản đồ (`Map`), vùng chưa mở:** kiểm tra các cây, bụi và nền cỏ tối đồng đều với nhau, vẫn phân biệt được rõ từng cụm cây `M1–M6` và bụi `#5`.
  2. **Vùng đã mở:** kiểm tra nền cỏ/đất/đá/hoa liền mạch, không còn đường lưới mỏng chia từng ô; thử bấm `+` / `-` và lăn chuột zoom ở các mức (`50%..200%`), kéo pan qua lại để xác nhận không có khe sáng/tối li ti giữa các ô.
  3. **Rê chuột và đặt thử công trình:** chọn một công trình từ Catalog, rê chuột qua các ô để xác nhận hiệu ứng hover và khung ghost hợp lệ (xanh) / không hợp lệ (đỏ) vẫn hiện rõ ràng.
  4. **Bật Expansion Mode (`Mở rộng đất`):** xác nhận bản đồ tự zoom vừa khung và các ô/chunk ứng viên mở rộng cùng viền nổi bật, nhãn tọa độ vẫn hiển thị rõ ràng.
  5. **So với trang `#sprites`:** mở Web Preview tại `#sprites`, đối chiếu khối `"Locked Forest Darkened (2×)"`, panel `8×4 Locked Forest Border Sample`, và `"16×11 Locked Forest Algorithm Preview"` xem màu tối cây + đất khớp với Bản đồ thật và không còn chữ nói cây giữ nguyên 100% màu.
  6. **Thử chỉnh hệ số cây (tùy chọn):** mở `src/ui/components/civilization/terrainDecor.ts`, đổi `LOCKED_TREE_DARKEN_FACTOR` từ `1.0` sang `0.7` (không cần sửa JSX nào khác) và xem cả Bản đồ lẫn `#sprites` đổi độ tối cây đồng bộ mà nền xung quanh cây vẫn giữ nguyên độ tối `0.44`.
