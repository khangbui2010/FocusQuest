# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 4a: SPRITE BẢN ĐỒ & CÔNG TRÌNH STONE AGE

**Ngày hoàn thành:** 14/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 4a** theo **ĐC-11** trong `respond_plan_5B.5.md` (`5b-3 → 4a → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`).

---

## 1. Tóm tắt
- Đã sao lưu báo cáo Giai đoạn 5b-3 sang `respond_phase5b3_report.md` và cập nhật **ĐC-11** vào `respond_plan_5B.5.md` (giữ nguyên mọi file `respond_*.md` trước đó).
- **Xác minh tài nguyên CC0:** Tìm thấy gói lưu trữ đính kèm `public/assets/aistudio/focus-quest-sprites-cc0_f51ac367.zip`, giải nén đúng cấu trúc repo vào `public/assets/sprites/` và `docs/sprites/` (đủ cả 6 file bắt buộc + `tiny-town-labeled.png`, `tiny-dungeon-characters-labeled.png`, kèm `License.txt` CC0 1.0 cho cả hai gói). Xác minh qua `file` rằng cả hai sheet `tilemap_packed.png` đều là PNG `192×176` (`12×11` ô `16×16px`, không khoảng cách).
- **Hạ tầng sprite SSR-safe:** Tạo `spriteData.ts` (26 màu bảng Tiny Town chuẩn, 6 ma trận pixel-art Stone Age kèm validator `validatePixelSpriteData` / `validateAllSpriteData`), `PixelSprite.tsx` (gom pixel liền kề theo hàng thành `<rect>` trong `<svg shape-rendering="crispEdges">`), `TileImage.tsx` (cắt ô từ sheet CC0 với `image-rendering: pixelated` và đường dẫn gốc `/assets/sprites/...`), và `spriteRegistry.ts` (`getBuildingSprite` fallback `null` an toàn, `getTerrainTile` hash xác định tọa độ `(x, y)` cho ô cỏ `0/1/2`).
- **Tích hợp UI & Preview `#sprites`:** Gắn nền cỏ CC0 + sprite công trình vào `MapGridView.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx` (giữ icon cũ làm fallback, giữ nguyên toàn bộ logic placement/pan/zoom/demolish/khóa `"Milestone 5C"`). Thêm `SpriteGallery.tsx` chỉ mở trong Preview (`!isChromeExtension() && location.hash === '#sprites'`), cập nhật `CREDITS.md` và `README.md`.

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới / giải nén vào repo
1. `respond_phase5b3_report.md` — Bản lưu báo cáo Giai đoạn 5b-3.
2. **Tài nguyên CC0 giải nén từ `public/assets/aistudio/focus-quest-sprites-cc0_f51ac367.zip`:**
   - `public/assets/sprites/CREDITS.md`
   - `public/assets/sprites/kenney-tiny-town/{tilemap_packed.png, License.txt, Tilesheet.txt}`
   - `public/assets/sprites/kenney-tiny-dungeon/{tilemap_packed.png, License.txt, Tilesheet.txt}`
   - `docs/sprites/{TILE_INDEX.md, tiny-town-labeled.png, tiny-dungeon-characters-labeled.png}`
3. `src/ui/components/civilization/spriteData.ts` — Dữ liệu văn bản 6 sprite Stone Age, bảng màu Tiny Town 26 màu, danh mục `REUSED_TINY_TOWN_TILES`, hàm `validatePixelSpriteData` & `validateAllSpriteData`.
4. `src/ui/components/civilization/PixelSprite.tsx` — Component `<PixelSprite />` gom đoạn ngang RLE thành `<rect>` trong `<svg shape-rendering="crispEdges">`.
5. `src/ui/components/civilization/TileImage.tsx` — Component `<TileImage />` hiển thị ô 16×16 từ sheet CC0 `192×176` (`image-rendering: pixelated`).
6. `src/ui/components/civilization/spriteRegistry.ts` — `getBuildingSprite`, `getTerrainTile`, `renderBuildingSprite`, re-export `PixelSprite` & `TileImage`.
7. `src/ui/components/civilization/SpriteGallery.tsx` — Trang xem thử 6 công trình + mảng nền cỏ 6×4 ở tỷ lệ `1×`, `2×`, `4×` (chỉ ở Web Preview `#sprites`).
8. `__tests__/ui/spriteRegistry.test.ts` — Bộ `12` unit tests mới cho Giai đoạn 4a.

### File chỉnh sửa (7 files)
1. `respond_plan_5B.5.md` — Bổ sung **ĐC-11** và cập nhật Mục J.
2. `src/ui/components/civilization/MapGridView.tsx` — Render nền cỏ `TileImage` trên ô đã mở khóa, giữ nguyên ô khóa; render `<PixelSprite />` cho công trình đặt trên lưới với fallback Lucide icon.
3. `src/ui/components/civilization/BuildingCatalogPanel.tsx` — Hiển thị `<PixelSprite />` làm hình đại diện công trình trong danh mục, giữ nguyên text & unlock gates.
4. `src/ui/components/civilization/BuildingDetailsModal.tsx` — Hiển thị `<PixelSprite />` ở phần đầu modal chi tiết, giữ nguyên `"Milestone 5C"` & demolish.
5. `src/App.tsx` — Gắn route `#sprites` trả về `<SpriteGallery />` **duy nhất** khi `!isChromeExtension()`.
6. `public/assets/sprites/CREDITS.md` — Ghi rõ các ô Tiny Town đã dùng/tham khảo trong 4a (`0, 1, 2` trực tiếp; `5, 106, 107, 130` tham khảo/minh họa) và giữ chỗ Tiny Dungeon cho 4b.
7. `README.md` — Bổ sung mục `Assets & Credits` liên kết tới `./public/assets/sprites/CREDITS.md`.

### File xóa
- Không xóa file nào (chỉ dọn `dist/` qua `npm run clean` khi build).

---

## 3. Bảng So sánh Baseline vs Sau Giai đoạn 4a

| Hạng mục | Baseline (sau 5b-3 + giải nén sprites) | Sau Giai đoạn 4a | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **433 / 433 PASS** (`0` fail, `31.94s`) | **445 / 445 PASS** (`0` fail, `0` cancelled, `0` skipped, `24.41s`) | **+12 tests mới** (`spriteRegistry.test.ts`), **0 test cũ bị sửa** |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Sạch lỗi TypeScript (kèm `compile_applet` & `lint_applet`) |
| `npm run clean && npm run build` | **PASS** (`908ms`, 1,719 modules) | **PASS** (`931ms`, 1,724 modules) | Sạch lỗi Vite |
| `dist/` (tổng kích thước) | `2,101,839 B` (`2.1M` `du -sh`) | **`2,125,438 B`** (`2.1M` `du -sh`) | `+23,599 B` *(bao gồm `dist/assets/aistudio/` `1,255,713 B` của template; phần extension thực ~`869.7 kB`)* |
| `dist/background.js` | `77.67 kB` (gzip `16.82 kB`) | **`77.67 kB`** (gzip **`16.84 kB`**) | **0 kB** — không kéo code sprite UI vào background |
| `dist/assets/domainNormalizer-*.js` | `21.97 kB` (gzip `6.87 kB`) | **`21.98 kB`** (gzip **`6.88 kB`**) | Gần như không đổi |
| `dist/assets/popup-*.js` | `653.76 kB` (gzip `174.08 kB`) | **`673.50 kB`** (gzip **`179.87 kB`**) | `+19.74 kB` (`+5.79 kB` gzip) cho 6 ma trận sprite + `PixelSprite` + `TileImage` + `SpriteGallery` |
| `dist/assets/popup-*.css` | `66.27 kB` (gzip `10.34 kB`) | **`69.29 kB`** (gzip **`10.86 kB`**) | `+3.02 kB` |
| `dist/assets/sprites/` | — *(vừa giải nén)* | **`14,462 B`** (`16K` `du -sh`) | Đủ `CREDITS.md`, `kenney-tiny-town/{tilemap_packed.png, License.txt, Tilesheet.txt}`, `kenney-tiny-dungeon/{tilemap_packed.png, License.txt, Tilesheet.txt}` |

---

## 4. Bản đồ Thực tế: Bố trí Sprite trên Lưới & Quyết định `CELL_SIZE`

### Quyết định kích thước ô: Giữ nguyên `CELL_SIZE = 22px` và `zoom = 1.0` (`100%`)
Đã đánh giá hai phương án:
- **Phương án (b) — Đổi sang số nguyên (`24px` hoặc `32px`) & chỉnh zoom mặc định:**
  - `24px` vẫn cho tỷ lệ `24 / 16 = 1.5×` (không nguyên); `32px` cho `2×` nhưng làm lưới 4 chunk khởi đầu (`20×20` ô) phình từ `440×440px` lên `640×640px`, tràn quá sâu khỏi vùng nhìn thấy `400 × ~390px` nếu giữ zoom `1.0`.
  - Đồng thời `__tests__/ui/civilizationView.test.ts:233` đang **assert cứng `html.includes('100%')`** cho zoom mặc định — hạ zoom mặc định sẽ phá vỡ test cũ trái ràng buộc.
- **Phương án (a) — Giữ `CELL_SIZE = 22px`, `zoom = 1.0` (ĐÃ CHỌN):**
  - Rủi ro bằng 0 cho `433` test hiện có và khớp khung `400×600px` (`overflow-hidden`, hỗ trợ zoom `60%–200%` mượt mà).
  - 6 công trình vẽ bằng **SVG nội tuyến `shape-rendering="crispEdges"`**, nên co giãn sắc nét không nhòe ở cả `CELL_SIZE = 22` lẫn mọi mức zoom; nền cỏ Tiny Town dùng `image-rendering: pixelated` bám khít lưới `CELL_SIZE × CELL_SIZE` không kẽ hở.

### Sơ đồ đặt nền và sprite trên lưới `MapGridView` (tọa độ lưới 22×22px/ô)
```text
+----+----+----+----+----+----+----+----+  (Mỗi ô mở khóa = <TileImage> grass 0/1/2,
| 0  | 1  | 0  | 0  | 2  | 0  | 1  | 0  |   hash xác định theo (x, y); ô khóa giữ nền xám)
+----+----+----+----+----+----+----+----+
| 0  | 0  |[🔥1×1]| 0  | 0  | ┌──────┐ |
+----+----+----+----+----+  | 🌾   | |  <PixelSprite> neo tại:
| 1  | ┌───────┐ | 0  | 0  | | 2×3  | |  left = (x - minX) * 22px
+----+ | ⛰️2×2 | +----+----+ |Lv.2  | |  top  = (y - minY) * 22px
| 0  | └───────┘ | 2  | 0  | └──────┘ |  width = w * 22px, height = h * 22px
+----+----+----+----+----+----+----+----+  (Huy hiệu góc "Lv.N" giữ lại cho width > 1)
```

---

## 5. Bảng 6 Công trình Stone Age & Tài nguyên Tiny Town Sử dụng

Tất cả sprite công trình đều vẽ bằng 26 màu bảng Tiny Town (viền ngoài `#3f2631`), gom đoạn ngang RLE thành `<rect>` SVG:

| ID | Tên | Footprint | Kích thước gốc | Số `<rect>` RLE (so với pixel gốc) | Mô tả & Ô Tiny Town tái sử dụng / tham khảo |
|---|---|---|---|---|---|
| `stone_age_campfire` | Campfire | `1×1` | `16×16` | `119` / `146 px` | Vòng đá xám, củi nâu xếp chéo, ngọn lửa đỏ-cam-vàng-trắng; tham khảo bảng màu củi **#106** |
| `stone_age_totem` | Ancient Totem | `1×1` | `16×16` | `100` / `156 px` | Cột gỗ nâu chạm mặt, mắt vàng sáng, vằn đỏ/vàng, chân đá xám |
| `stone_age_study_cave` | Meditation Cave | `2×2` | `32×32` | `407` / `783 px` | Gò đá xám vát cạnh, rêu xanh trên chóp & đá chân, cửa hang tối `#262b44` + ánh nến nhỏ |
| `stone_age_elder_hut` | Elder's Hut | `2×2` | `32×32` | `371` / `675 px` | Lều tròn mái tranh vàng-cam, cờ đỏ-vàng trên chóp, cửa gỗ nâu & bùa xương trắng trên mi cửa |
| `stone_age_foraging_post` | Foraging Post | `2×2` | `32×32` | `303` / `561 px` | Khung gỗ có giá phơi thảo mộc, bụi cây quả mọng, giỏ & bao tải; tham khảo ô **#5** (bụi cây), **#107** (bao tải), **#130** (thùng/giỏ) |
| `stone_age_food_cache` | Primitive Granary | `2×3` | `32×48` | `452` / `998 px` | Kho mái tranh nâng trên 4 cọc gỗ, cửa kho hạt, bao tải, thùng gỗ & đống hạt vàng dưới gầm; tham khảo **#107**, **#130** |
| *(Địa hình mở khóa)* | Grass Terrain | `1×1` / ô | `16×16` | `<img>` PNG CC0 | Dùng trực tiếp ô CC0 Tiny Town **#0** (~74% trơn), **#1** (~21% cỏ), **#2** (~5% hoa) qua `TileImage` |

---

## 6. Kết luận về Đường dẫn Tài nguyên (`/assets/sprites/...`) ở Preview & Extension

1. **Web Preview (`npm run dev`):** `vite.config.ts` dùng cấu hình mặc định `base: '/'`. Toàn bộ thư mục `public/assets/sprites/...` được phục vụ trực tiếp tại gốc HTTP `/assets/sprites/...`, nên `TileImage` trỏ `/assets/sprites/kenney-tiny-town/tilemap_packed.png` nạp chính xác.
2. **Chrome Extension build (`dist/`):** Vite copy nguyên vẹn `public/` sang `dist/assets/sprites/...`, đặt cạnh `dist/index.html` ở gốc package extension (`chrome-extension://<ID>/index.html`). Trong popup (`index.html`), URL gốc `/assets/sprites/...` phân giải thành `chrome-extension://<ID>/assets/sprites/...` (same-origin, hoạt động offline 100% không cần sửa `vite.config.ts` hay `manifest.json`; thêm nữa `manifest.json` đã khai báo `"assets/*"` trong `web_accessible_resources`).

---

## 7. Xác nhận Ràng buộc & Những gì Cố ý Không Làm

- **Không** sửa bất kỳ assertion nào trong `433` test hiện có (`433 + 12 = 445` PASS toàn bộ).
- **Không** làm cảnh nhóm người hoạt ảnh `FocusSceneArea` (dành cho **4b**), không thêm hoạt ảnh, không làm biến thể theo cấp độ (`Lv. 1..5`), không làm Era khác.
- **Không** chạm Quest/Stats, `blocked.html`, `_locales`, `manifest.json`, `vite.config.ts`, logic Civilization, schema, kinh tế hay timer; **không** cài thêm dependency và **không** thêm tài nguyên ngoài bộ CC0 đã cấp.

---

## 8. Phát hiện thêm

1. **Vị trí tệp zip tài nguyên từ AI Studio:** Các tệp sprite CC0 ban đầu nằm trong gói đính kèm `public/assets/aistudio/focus-quest-sprites-cc0_f51ac367.zip` (AI Studio không tự giải nén khi tải lên). Đã giải nén nguyên trạng gói này vào đúng `public/assets/sprites/` và `docs/sprites/` (giữ nguyên mọi giấy phép và tệp gốc).
2. **Ghi chú `Tilesheet.txt` vs `tilemap_packed.png`:** File text mẫu `Tilesheet.txt` trong pack ghi mô tả spacing `1px×1px` (cho bản chưa đóng gói), nhưng kiểm tra ảnh thực tế `tilemap_packed.png` xác nhận kích thước chính xác là `192×176` (`12×11` ô `16×16`, **không** khoảng cách) đúng như `docs/sprites/TILE_INDEX.md`.
3. **Tailwind v4 Preflight với `<img>`:** Preflight đặt `img { max-width: 100% }`; nếu không ghi đè `maxWidth: 'none'` trên `<img>` bên trong `TileImage`, ảnh sheet `12×11` bị ép về `1×1` ô. Đã đặt `maxWidth: 'none', maxHeight: 'none'` tường minh trong `TileImage.tsx`.

---

## 9. Hạn chế

- Toàn bộ `445` unit tests chạy qua React SSR (`renderToString`) trên `Node.js`; chưa kiểm tra trực tiếp bằng mắt trên Chrome Extension unpacked thật (cần xác nhận hiển thị pixel thực tế của 6 công trình, nền cỏ `22px` khi zoom/pan và xem trang `#sprites` ở Web Preview để chủ dự án đánh giá thẩm mỹ chi tiết từng công trình).
- Cảnh báo kích thước Vite chunk `popup-*.js > 500 kB` vẫn tồn tại (chỉ hoãn theo kế hoạch, không thay đổi `vite.config.ts`).

---

## 10. Đề xuất Bước Kế tiếp

- Đề xuất tiến hành **Giai đoạn 4b — Hoạt ảnh Cảnh Nhóm Người (`FocusSceneArea`)**: sử dụng bộ nhân vật CC0 `kenney-tiny-dungeon/tilemap_packed.png` (ô `84–88`, `98–100` đã có sẵn + bảng màu đất/da Stone Age) kết hợp khung cảnh `FocusSceneArea` để thể hiện nhóm dân làng đang làm việc / nghỉ ngơi / tạm dừng theo trạng thái phiên Focus.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 4b
