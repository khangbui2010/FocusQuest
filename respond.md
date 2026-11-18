# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-5

**Giai đoạn:** Milestone UX — Giai đoạn UX-5 *(Sửa dứt điểm khe sáng / lưới mờ giữa các ô địa hình trên bản đồ bằng Composite Terrain Canvas Một Tấm — tách biệt hoàn toàn với 5B.5 / LOFI)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_ux5_prev.md` *(sao lưu từ báo cáo Stage 2a trước đó; các bản sao lưu lịch sử khác vẫn giữ nguyên)*  
**Trạng thái:** `579 / 579` tests PASS 3/3 lần | `npm run lint` PASS | `npm run build` PASS — **CHƯA KIỂM CHỨNG TRỰC QUAN TRÊN CHROME THẬT** — **DỪNG chờ duyệt UX-5**

---

## 1. BƯỚC 0 — ĐIỀU TRA NGUYÊN NHÂN GỐC & RÀNG BUỘC THỰC TẾ

### 1.1. Vị trí phát sinh lỗi thực tế trong code (trước UX-5)
1. **Hàng nghìn DOM node cắt riêng từng ô (`MapGridView.tsx` & `TileImage.tsx`):**
   - Trong `MapGridView.tsx`, mỗi ô trong lưới `24×24` (`576` ô ban đầu, hoặc lớn hơn khi mở rộng chunk `4×4`) dựng một `<GridCell>` bọc `<TerrainCellLayers>` gồm 2–3 `<TileImage>` (`TileImage.tsx:72-99`, mỗi ô là `<span className="... overflow-hidden">` kèm `<img style={{ position: 'absolute', left: -col * size, top: -row * size }} />`) và thẻ phủ tối `div[data-locked-forest]` — tổng cộng ~`2,300–2,800` node DOM xếp cạnh nhau trên CSS Grid.
2. **Các lớp biến đổi tọa độ lồng nhau quanh sân khấu bản đồ (`MapGridView.tsx:448-465`):**
   - Khung bao `MapGridView` dùng `flex items-center justify-center` (`MapGridView.tsx:448`), căn giữa phần tử `data-testid="map-grid-stage"` có `transform: translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px) scale(${zoom})`, `transformOrigin: 'center center'`, cùng class `transition-transform duration-150 ease-out shadow-sm`.
   - `transition-transform duration-150 ease-out` luôn bật kể cả trong lúc người dùng đang nhấn giữ chuột để kéo (`isDragging`) hoặc xoay con lăn zoom (`handleWheel`).

### 1.2. Chứng minh số học vì sao bản UX-3 vẫn hở khe ở DPR / Zoom / Pan thực tế
Bản UX-3 chỉ ép `CELL_SIZE * zoom` và `16 * zoom` thành số nguyên **pixel CSS** (`snapZoomToIntegerPixels` làm tròn theo mẫu số `ZOOM_PIXEL_DENOMINATOR = 16`). Tuy nhiên trình duyệt (Blink / Skia) raster hóa hình học từng node DOM theo **pixel vật lý = pixel CSS × `devicePixelRatio` (`dpr`)**:
- **Zoom nguyên pixel CSS × DPR lẻ (Windows 125% / 150% / 175% / Zoom trình duyệt):**
  - Với `zoom = 11/16 = 0.6875` → `cellCss = 32 × 0.6875 = 22` CSS px (nguyên):
    - Trên `dpr = 1.25` (125%): `22 × 1.25 = 27.5` physical px *(lẻ `.5` px)*.
    - Trên `dpr = 1.75` (175%): `22 × 1.75 = 38.5` physical px *(lẻ `.5` px)*.
  - Với `zoom = 9/16 = 0.5625` → `cellCss = 18` CSS px (nguyên):
    - Trên `dpr = 1.25`: `18 × 1.25 = 22.5` physical px; trên `dpr = 1.75`: `18 × 1.75 = 31.5` physical px.
  - Ở bất kỳ giá trị nào mà `cellCss` không chia hết cho `4` (trên 125%/175%) hoặc `2` (trên 150%/250%), kích thước mỗi ô `GridCell` trong `screen space` trở thành số thập phân.
- **Pan & Flex centering ở DPR khác 1 + nội suy `transition-transform`:**
  - Khi người dùng kéo `pan.x = 1` CSS px (số lẻ từ `Math.round`), tại `dpr = 1.25` độ dời thành `1.25` physical px; tại `dpr = 1.5` thành `1.5` physical px.
  - `flex items-center justify-center` đặt stage có kích thước `768×768` vào viewport chiều cao/rộng lẻ (ví dụ `427px` → offset `(427 - 768) / 2 = -170.5` CSS px).
  - Trong `150ms` chạy `transition-transform`, Chromium nội suy ma trận `translate`/`scale` qua hàng loạt số thực liên tục mỗi khung hình.
- **Hệ quả:** Mỗi `<span>` có `overflow: hidden` được Blink làm tròn hộp clip độc lập theo pixel vật lý → ranh giới giữa ô `c` và `c + 1` thường chênh `1` pixel vật lý, làm lọt màu nền container (`bg-slate-100` / `bg-slate-950`) thành **khe sáng dọc/ngang hoặc lưới mờ lúc ẩn lúc hiện** đúng như hiện tượng quan sát trên Chrome thật.

### 1.3. Đối chiếu hiệu ứng phụ thuộc (Rìu chém 680ms, Hover, Buildings, Chunk Frames, `#sprites`)
- **Rìu chém mở đất (`CivilizationScreen.tsx:120-134`, `expansionReveal.ts:7-9`):** Khi vừa mở chunk mới, `CivilizationScreen` giữ `unrevealedChunkOrigin` trong `680ms` (`EXPANSION_IMPACT_MS = 680`) rồi mới đặt về `null` khi rìu chạm đất và chạy rung `fq-map-shake-active` (`340ms`). Vì `MapGridView.tsx:263-271` đưa `unrevealedChunkOrigin` vào `isCellUnlockedFn`, `<canvas>` giữ 16 ô chunk mới ở trạng thái rừng tối tới đúng mốc `680ms`, rồi đổi `contentKey` để vẽ lại 1 lần duy nhất thành đất mở — giữ nguyên 100% nhịp điệu hoạt ảnh mà không có bất kỳ khe ô nào kể cả khi rung map.
- **Lớp tương tác & UI phía trên (`MapGridView.tsx:490-700`):** Toàn bộ `hover:after:bg-emerald-300/35`, placement ghost, `PixelSprite` công trình (`z-10`), khung Chunk (`border-emerald-500/35`, `z-[2]`), nút chunk mở rộng (`z-20`) và toolbar zoom giữ nguyên vị trí tọa độ trên `map-grid-stage`.

---

## 2. PHẠM VI BẢO TOÀN & GIẢI PHÁP ĐÃ TRIỂN KHAI

- **Bất biến giữ nguyên 100%:** Thuật toán đặt cây & 6 mẫu M1–M6 (`getCellDecor`, `TERRAIN_DECOR_SEED`, `computeLockedForestOpacities`, `LOCKED_FOREST_DARKEN_OPACITY = 0.44` trong `terrainDecor.ts`), logic mở đất, đặt/gỡ công trình, `GridMap`, civilization core, schema, kinh tế, `SessionCoordinator`, LOFI music, và Quest Engine Stage 2a hoàn toàn **không đụng**.

### 2.1. Module vẽ Bitmap tổng hợp (`src/ui/components/civilization/terrainBitmapRenderer.ts` — MỚI)
- **`buildTerrainBitmapPlan`:** Duyệt qua toàn bộ lưới `(cols × rows)` bắt đầu từ `(minX, minY)`, gọi `getCellDecor(gx, gy, isUnlocked, seed, isCellUnlocked)` và tạo **`contentKey`** chỉ từ `{ seed, minX, minY, cols, rows, darkenOpacity, treeDarkenFactor, unlockedBits }` — tuyệt đối không chứa trạng thái pan/zoom.
- **`renderTerrainBitmap`:** Dựng một bitmap nguyên kích thước `(cols × 16) × (rows × 16)` px:
  - Ép `ctx.imageSmoothingEnabled = false`, `ctx.clearRect?.(0, 0, bitmapWidth, bitmapHeight)`.
  - Vẽ từng ô tại đúng tọa độ nguyên `(col * 16, row * 16, 16, 16)` theo đúng thứ tự lớp UX-3:
    1. Nền đất (`baseTile` từ `tilemap_packed.png` qua `getTileSourceCoords`, hoặc màu phẳng `FALLBACK_TERRAIN_COLORS` nếu `tileSheet === null`).
    2. Lớp bù nền tùy chọn (`opacities.groundUnderOverlayOpacity`) với `#020617` (`LOCKED_FOREST_SCRIM_COLOR`, xác minh khớp `--color-slate-950` trong Tailwind CSS v4).
    3. Lớp phủ cây / bụi / mầm / nấm (`overlayTile`, hỗ trợ `treeBrightnessFactor` nếu tinh chỉnh `LOCKED_TREE_DARKEN_FACTOR < 1`).
    4. Lớp phủ tối trên cùng (`opacities.topScrimOpacity`, mặc định `0.44`) đè đồng đều lên cả nền và cây.
- **`renderTerrainBitmapIfNeeded`:** So sánh `${plan.contentKey}:${sheet ? 'sheet' : 'fallback'}`, **chỉ vẽ lại khi nội dung địa hình hoặc trạng thái tải ảnh thay đổi** (kéo/zoom trả về `drawn: false`).
- **Tải ảnh singleton (`getCachedTinyTownTileSheet`, `loadTinyTownTileSheet`):** Tải `tilemap_packed.png` tối đa 1 lần mỗi vòng đời trang, an toàn SSR (`typeof Image === 'undefined'`), xử lý fallback màu phẳng không crash khi lỗi ảnh.

### 2.2. Component `<TerrainBitmapCanvas>` dùng chung (`src/ui/components/civilization/TerrainBitmapCanvas.tsx` — MỚI)
- Render đúng 1 thẻ `<canvas>` kích thước buffer gốc `bitmapWidth × bitmapHeight` (`384×384` với bản đồ `24×24`, `256×176` với mẫu gallery `16×11`), kích thước hiển thị CSS `cols * cellSize × rows * cellSize` cùng `imageRendering: 'pixelated'`, `data-terrain-key={plan.contentKey}`, và quản lý cờ `cancelled` khi unmount trong lúc ảnh đang tải.

### 2.3. Tái cấu trúc `MapGridView.tsx`
- Thay toàn bộ cây `<TerrainCellLayers>` / `<TileImage>` trong `GridCell` (`MapGridView.tsx:108-148`, `477-513`) bằng `<TerrainBitmapCanvas testId="map-terrain-bitmap" ... />` đặt ở đáy `map-shake-layer`, bên trên là lưới ô tương tác trong suốt `<div data-testid="map-interaction-grid">` chỉ chứa thuộc tính `data-cell-coord`, `data-unlocked`, hover highlight (`hover:after:bg-emerald-300/35`), cursor và click handler (`0` thẻ `<img>` địa hình).
- Export `getMapStageClassName(isDragging, isZoomTransitionActive)` (`MapGridView.tsx:88-96`): gỡ bỏ `shadow-sm` khỏi stage, tắt hoàn toàn `transition-transform` khi kéo chuột (`isDragging === true`), ở trạng thái tĩnh và khi dùng con lăn (`handleWheel`); chỉ kích hoạt ngắn `160ms` khi người dùng chủ động bấm nút zoom `+` / `-` / `Reset` / `Recenter` (và hủy ngay lập tức trong `handleMouseDown`).

### 2.4. Khối đối chiếu trong `#sprites` (`src/ui/components/civilization/SpriteGallery.tsx`)
- Giữ nguyên 100% toàn bộ khối xem trước DOM hiện có (kể cả `data-testid="gallery-locked_forest_16x11"`), tách `GALLERY_16X11_IS_UNLOCKED`, và bổ sung khối `data-testid="gallery-terrain_bitmap_16x11"` (`"Map terrain bitmap (16×11 Locked Forest · UX-5 Single Canvas)"`) dùng chung `<TerrainBitmapCanvas>` vẽ đúng vùng `16×11` `(-8,-8)` để người dùng đối chiếu trực tiếp DOM grid phía trên và Canvas tổng hợp phía dưới trong `#sprites`.

---

## 3. DANH SÁCH FILE THAY ĐỔI & TEST CŨ ĐÃ CẬP NHẬT

### 3.1. Code sản phẩm (Production)
- **Tạo mới:**
  - `src/ui/components/civilization/terrainBitmapRenderer.ts`
  - `src/ui/components/civilization/TerrainBitmapCanvas.tsx`
- **Chỉnh sửa:**
  - `src/ui/components/civilization/MapGridView.tsx`
  - `src/ui/components/civilization/SpriteGallery.tsx`
- **Tài liệu:**
  - `ARCHITECTURE.md` (`Version: 1.5.2`, cập nhật §6 kiến trúc UX-5 Composite Terrain Canvas)
  - `PROJECT_STATUS.md` (bổ sung mục UX-5, cập nhật số liệu thực tế & ranh giới kiểm chứng Chrome)
  - `respond_ux5_prev.md` (sao lưu báo cáo Stage 2a cũ), `respond.md` (báo cáo này)

### 3.2. Bộ kiểm thử mới & Các test DOM-tile cũ buộc phải cập nhật
- **Thêm mới (`+5` tests) — `__tests__/ui/ux5TerrainBitmap.test.ts`:**
  1. Kiểm toán từng lệnh `drawImage` / `fillRect` trên `24×24`: tọa độ đích nguyên `(col*16, row*16, 16, 16)`, `0` khe hở/trùng lặp, thứ tự vẽ `nền → cây → scrim #020617` khớp `LOCKED_FOREST_DARKEN_OPACITY = 0.44` và `computeLockedForestOpacities(treeFactor=0.7)`, `imageSmoothingEnabled = false`, deterministic 2 lần liên tiếp.
  2. Guard chống vẽ thừa (`renderTerrainBitmapIfNeeded` trả `drawn: false` khi `contentKey` giữ nguyên qua pan/zoom, vẽ lại khi mở chunk) & fallback màu phẳng khi `tileSheet = null`.
  3. SSR & tương tác: `MapGridView` idle/placement/expansion có đúng 1 `<canvas data-testid="map-terrain-bitmap">`, `0` `<img>` địa hình, `image-rendering:pixelated`, giữ đủ `hover:after:bg-emerald-300/35` / công trình / khung chunk / slot mở đất / `map-controls-toolbar`, `getMapStageClassName` tắt `transition-transform` khi kéo, không có `shadow-sm`, và `SpriteGallery` có đủ cả 2 khối `16×11` đối chiếu.
  4. Chứng minh số học qua ma trận `DPR [1, 1.25, 1.5, 1.75, 2, 2.5, 3]` × `zoom [0.375..2.0 + computeExpansionFitZoom]` × `pan [0, 1, -17, 43]`: các ô DOM cũ lệch fractional physical px (`22*1.25 = 27.5`), trong khi mọi ô trong bitmap nối khít `tile.dx + tile.dw === right.dx` độc lập với DPR/zoom/pan.
  5. Tích hợp `GridMap`: mở rộng chunk `{ x: 8, y: 0 }` làm đổi `contentKey` sạch sẽ và mở sáng đúng ô góc chunk mới.
- **Cập nhật 4 test DOM-tile cũ trên `MapGridView` (do `MapGridView` không còn render `TileImage` / `<img>` / `div[data-locked-forest]` cho từng ô; riêng các test của `SpriteGallery` & `TerrainCellLayers` giữ nguyên):**
  1. `__tests__/ui/ux3MapAndForestUi.test.ts` (Test 1): đổi từ tìm chuỗi HTML `data-tile-index` / `data-locked-forest` trong `MapGridView` sang kiểm tra `<canvas data-testid="map-terrain-bitmap">`, `0` `<img>` trong `MapGridView`, và xác minh thứ tự vẽ canvas `drawImage → drawImage → fillRect(0.44)` qua `renderTerrainBitmap` (giữ nguyên các assertion `TerrainCellLayers` và `SpriteGallery`).
  2. `__tests__/ui/terrainDecor.test.ts` (dòng `472–502`): đổi kiểm tra `data-locked-forest="true"` / `<TileImage>` trong HTML của `MapGridView` sang kiểm tra `<canvas data-testid="map-terrain-bitmap">` `width="384" height="384" pixelated`, `0` `<img>`, và kiểm tra trực tiếp `buildTerrainBitmapPlan` tại `(-8,-8)` tối + không có tile giải nghệ `27/28` (các kiểm tra `SpriteGallery` ngay sau đó giữ nguyên).
  3. `__tests__/ui/spriteRegistry.test.ts` (dòng `248–251`, `397–405`): thay assertions URL `tilemap_packed.png` & `data-locked-forest="true"` trên `MapGridView` bằng `data-testid="map-terrain-bitmap"`, `image-rendering:pixelated`, `:0.44:` trong `data-terrain-key`, và `0` `<img>`.
  4. `__tests__/ui/civilizationView.test.ts` (dòng `311–312`): thay assertion `data-locked-forest="true"` trên `MapGridView` bằng `data-testid="map-terrain-bitmap"` kèm `data-unlocked="false"`.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,748 modules transformed`, **`643ms`**, tổng dung lượng tệp `dist/`: **`1,095,217 B`**):
  - **So sánh bundle `popup` Trước UX-5 (Stage 2a) → Sau UX-5:**
    - `popup` JS: `765,071 B` (`765.07 kB`, gzip `201.50 kB`) → **`770,675 B` (`770.67 kB`, gzip `203.30 kB`)** (`+5,604 B` / `+5.60 kB`).
    - `popup` CSS: `88,298 B` (`88.29 kB`, gzip `13.79 kB`) → **`88,317 B` (`88.31 kB`, gzip `13.80 kB`)** (`+19 B` / `+0.02 kB`).
  - Các artifacts khác giữ nguyên: `dist/background.js` (`93,016 B` / `93.01 kB`), `dist/offscreen.js` (`3,878 B` / `3.87 kB`), `dist/blocked.js` (`1,321 B` / `1.32 kB`), `dist/assets/translator-B5-w4v6G.js` (`52,477 B`), `dist/assets/statsAggregator-C5H9LvvS.js` (`55,154 B`), `dist/assets/storageKeys-C4hhw6ET.js` (`398 B`), `dist/manifest.json` (`984 B`), `dist/index.html` (`716 B`).
- **`npm test` — chạy 3 lần liên tiếp (sau toàn bộ chỉnh sửa cuối):**
  - **Lần 1:** `579 / 579 PASS` (`0` fail, `0` skipped, `0` cancelled, `19,922.03 ms`, Exit `0`).
  - **Lần 2:** `579 / 579 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,918.03 ms`, Exit `0`).
  - **Lần 3:** `579 / 579 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,885.90 ms`, Exit `0`).

---

## 5. GIỚI HẠN HIỆN TẠI & 6 BƯỚC TỰ KIỂM TRA TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Bản UX-5 **CHƯA kiểm chứng trực quan trên Chrome thật** — toàn bộ kiểm tra vừa chạy là kiểm toán logic vẽ qua Node mock Canvas 2D context, kiểm tra HTML qua React SSR (`renderToString`), kiểm chứng số học DPR/zoom/pan, `tsc --noEmit` và build `dist/`.
- **6 bước đề nghị bạn kiểm tra trực tiếp trên Chrome thật (`dist/` sau khi nạp unpacked hoặc Web Preview):**
  1. **Kiểm tra ở nhiều tỉ lệ màn hình / zoom trình duyệt (`100%`, `125%`, `150%`, `175%` hoặc Dev Zoom `Ctrl+`/`Ctrl-`):** Quan sát vùng cỏ đã mở lẫn rừng tối xung quanh xem còn bất kỳ khe sáng dọc/ngang hay lưới mờ nào xuất hiện khi đứng yên hoặc lúc kéo bản đồ hay không.
  2. **Mở Expansion Mode (auto-fit zoom):** Xác nhận bản đồ thu nhỏ vừa khung mà mặt đất + rừng vẫn liền khít 100%, viền xanh/hổ phách của 4×4 chunk mở rộng hiển thị đúng.
  3. **Kiểm tra đặt công trình:** Chọn 1 công trình → rê chuột xem ô hover xanh (`hover:after:bg-emerald-300/35`), tooltip ghost đặt hợp lệ/lỗi, đặt xuống và bấm kiểm tra công trình đã đặt.
  4. **Kiểm tra hoạt ảnh rìu chém khi mở đất:** Mở 1 chunk mới → xác nhận vùng rừng giữ nguyên tối liền lạc cho tới mốc rìu chạm đất `680ms` rồi mới lộ cỏ mở + rung nhẹ bản đồ không hở khe.
  5. **Đối chiếu `#sprites` (Web Preview):** Kéo xuống phần cuối `Section 3` kiểm tra khối `"16×11 Locked Forest Algorithm Preview"` (DOM) và khối `"Map terrain bitmap (16×11 Locked Forest · UX-5 Single Canvas)"` ngay bên dưới khớp nhau về cây M1–M6, nền và độ tối `44%`.
  6. **Kéo nhanh liên tục bản đồ:** Giữ chuột trái kéo đảo chiều liên tục trên cả vùng cỏ mở và rừng tối để xác nhận pan bám tay tức thì (không bị trễ `transition-transform`), không giật hoặc nháy lưới.

---

**DỪNG tại đây chờ bạn nghiệm thu trực quan và duyệt UX-5.**
