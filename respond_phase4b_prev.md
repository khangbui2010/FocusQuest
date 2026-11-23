# BÁO CÁO GIAI ĐOẠN 4a-3 — RỪNG VÙNG CHƯA MỞ: GHÉP CÂY THEO 6 MẪU, SỬA TƯƠNG PHẢN & HẠ MẬT ĐỘ ~30%

**Ngày hoàn thành:** 2026-11-16  
**Bản sao lưu báo cáo trước:** `respond_phase4a3_prev.md` *(sao lưu nguyên bản báo cáo `5B.6a-fix` từ `respond.md` trước khi thực hiện 4a-3)*  
**Phạm vi:** Thực hiện **ĐÚNG MỘT** giai đoạn nhỏ `4a-3` thuần lớp hiển thị UI (`terrainDecor.ts`, `MapGridView.tsx`, `TileImage.tsx`, `SpriteGallery.tsx`, tests & docs); **không** đụng `GridMap`, schema, kinh tế, session, message protocol, **không** làm `4b`, `5B.6b` hay giai đoạn khác.  
**Giới hạn kiểm chứng:** Kiểm tra tự động qua Node.js (`tsx --test` + React SSR `renderToString`) và tự dựng PNG thật từ `tilemap_packed.png` cho lưới `24×24` & `16×11`; **chưa kiểm chứng tương tác trực tiếp bằng mắt trên Chrome thật (`chrome://extensions` Load unpacked `dist/`)**.

---

## 1. Tóm tắt các lỗi đã xử lý & thay đổi kỹ thuật

### 1.1. Sửa lỗi không hiện cây (`TileImage.tsx`) & thứ tự lớp tương phản (`MapGridView.tsx`)
- **Lỗi CSS ẩn toàn bộ cây (`TileImage.tsx`):** Trong Tailwind v4 (`popup-*.css`), `.relative` được xuất *sau* `.absolute`, nên `<TileImage className="absolute inset-0 ...">` từng nhận đồng thời cả `relative` mặc định lẫn `absolute`, bị `.relative` thắng cascade và đẩy mọi `overlayTile` xuống dưới mép ô `overflow-hidden`. Đã thêm guard kiểm tra class định vị/hiển thị trước khi gắn `relative`/`inline-block`, kèm test chặn hồi quy trong `terrainDecor.test.ts`.
- **Thứ tự 3 lớp trong `GridCell` (`MapGridView.tsx`) & `SpriteGallery.tsx`:**  
  `baseTile` (cỏ nền) → `<div data-locked-forest="true">` (`bg-slate-950`, `LOCKED_FOREST_OVERLAY_OPACITY = 0.44`) → `overlayTile` (cây/bụi giữ **100% màu sắc gốc**). Khe trong suốt ở ô tâm `19`/`22` (`M5/M6`) lộ nền cỏ tối tự nhiên.

### 1.2. Loại bỏ `15/16` cụt đầu & hạ mật độ cây còn ~30% (`terrainDecor.ts`)
- **Nguyên nhân lỗi hình ảnh `image_e460e695.png`:**
  1. Ô `15` (`TREE_ROUND_ORANGE`) và `16` (`TREE_ROUND_GREEN`) trong Tiny Town là nửa dưới của cây cao `M1` (`3/15`) và `M2` (`4/16`), mép trên không có viền nâu `#3f2631`. Khi đặt đứng lẻ làm filler `1×1` hoặc chạm ngay dưới `5`/`15`/`16`, tán bị cụt phẳng hoặc dính thành khối đôi.
  2. Mật độ cũ >90% khiến các cây ken dày sát nhau.
- **Cách khắc phục:**
  - **Cấm `15` và `16` đứng lẻ hoàn toàn:** Gỡ `round_green` / `round_orange` khỏi filler (`test` khẳng định `15` chỉ đi với `tall_orange` `M1` và `16` chỉ đi với `tall_green` `M2`).
  - **Filler `1×1` duy nhất là bụi xanh `5` (`GREEN_BUSH`):** Có viền tối kín cả 4 phía (`STANDALONE_FOREST_TILES = [5]`).
  - **Giữ nguyên 6 mẫu bắt buộc (`M1–M6`)** khớp `tree_recipes_57acd418.png`:
    - `M1` (`1×2`): `3 / 15` | `M2` (`1×2`): `4 / 16`
    - `M3` (`2×2`): `[6, 8] / [30, 32]` | `M4` (`2×2`): `[9, 11] / [33, 35]`
    - `M5` (`3×3`): `[—, 7, —] / [18, 19, 20] / [—, 31, —]` | `M6` (`3×3`): `[—, 10, —] / [21, 22, 23] / [—, 34, —]`
    - Giải nghệ hoàn toàn `27/28`; `3/4/15/16` chỉ xuất hiện trong `M1/M2`; mảnh tán lá `6–11, 18–23, 30–35` chỉ trong `M3–M6`; góc `"—"` của `M5/M6` được khóa trong `occupiedGrid` và kiểm tra biên `lockedMask` (`isCellUnlockedFn`).
  - **Giảm mật độ cây xuống ~30% (`25%–35%`):** Cấu hình lại tỷ lệ đặt unit theo 4 vai macro-chunk (`role 0..3`) và ưu tiên khoảng trống 4 hướng (`'none' → 'not_same' → 'any'`) để cây thưa thoáng tự nhiên.

### 1.3. `SpriteGallery` (`#sprites`)
- Cập nhật nhãn `15` (`M1 Only`), `16` (`M2 Only`), `5` (`Sole Filler & Unlocked`), mô tả ~30% mật độ cây, 6 card `M1–M6` ở chế độ *Full Light* vs *44% Darkened Ground*, và preview `16×11` tại `(-8, -8)` dùng boundary `(cx, cy) => cx < -8 || cx >= 8 || cy < -8 || cy >= 3` tránh cắt đôi cây ở mép dưới.

---

## 2. Số liệu đo kiểm thực tế trên mẫu (`~30%` cây)

| Vùng kiểm tra | Số ô cây (`overlays`) | Tỉ lệ mật độ cây *(mục tiêu ~30%, [25–35%])* | Cỏ trống (`forest_clearing`) | Ô xanh / cam | Thành phần cùng `unitKind` / cùng filler liền kề max |
|---|---|---|---|---|---|
| `24×24` tại `(0, 0)` | `182 / 576` | **`31.60%`** | `394 / 576` (`68.40%`) | `120 / 62` | `5` ô / `1` ô |
| `24×24` tại `(-24, -24)` | `183 / 576` | **`31.77%`** | `393 / 576` (`68.23%`) | `131 / 52` | `6` ô / `1` ô |
| `24×24` tại `(-13, -7)` | `183 / 576` | **`31.77%`** | `393 / 576` (`68.23%`) | `116 / 67` | `5` ô / `2` ô |
| `24×24` tại `(16, -20)` | `182 / 576` | **`31.60%`** | `394 / 576` (`68.40%`) | `134 / 48` | `8` ô / `2` ô |
| `16×11` Gallery `(-8, -8)` | `62 / 176` | **`35.23%`** | `114 / 176` (`64.77%`) | Đủ toàn bộ `M1–M6` + `5` | — |

---

## 3. File đã thay đổi & Test đã cập nhật

- `src/ui/components/civilization/terrainDecor.ts`: Gỡ `round_green`/`round_orange` (`15/16` chỉ nằm trong `M1/M2`), `FOREST_FILLER_TILES = [5]`, mục tiêu mật độ `[0.25, 0.35]`, 4 vai macro-chunk ~30%.
- `src/ui/components/civilization/TileImage.tsx`: Fix cascade `.relative` ghi đè `.absolute`.
- `src/ui/components/civilization/MapGridView.tsx`: Thứ tự 3 lớp `baseTile → bg-slate-950 (0.44) → overlayTile`.
- `src/ui/components/civilization/SpriteGallery.tsx`: Cập nhật nhãn, mô tả ~30%, boundary mẫu `16×11`.
- `__tests__/ui/terrainDecor.test.ts`: Cập nhật assert filler duy nhất `[5]`, chặn `15/16` đứng lẻ ngoài `M1/M2`, assert mật độ cây `[25%, 35%]` và cỏ trống `[65%, 75%]` trên 4 vùng `24×24`. (`__tests__/ui/spriteRegistry.test.ts` giữ nguyên `14/14 PASS`).
- `docs/sprites/TILE_INDEX.md`, `public/assets/sprites/CREDITS.md`, `PROJECT_STATUS.md`, `respond.md`.

---

## 4. Kết quả kiểm định thực tế (`lint`, `build`, `test`)

1. **`npm run lint` (`tsc --noEmit`):** **PASS (Exit code 0)** — `0` lỗi.
2. **`npm run clean && npm run build` (`vite v8.3.5`):** **PASS (Exit code 0)** — `1,731 modules transformed`, **`999ms`**.
   - `dist/index.html`: `0.71 kB` (`717 B`, gzip `0.40 kB`)
   - `dist/blocked.html`: `1,810 B` | `dist/blocked.js`: `1.32 kB` (`1,321 B`, gzip `0.60 kB`)
   - `dist/background.js`: **`78.13 kB`** (`78,131 B`, gzip `16.91 kB`)
   - `dist/manifest.json`: `967 B` | `dist/_locales/en/messages.json`: `382 B` | `dist/_locales/vi/messages.json`: `440 B`
   - `dist/assets/popup-Chr5qpGi.js`: **`699.09 kB`** (`699,094 B`, gzip `186.14 kB`) *(cảnh báo chunk > 500 kB, ngoài phạm vi 4a-3)*
   - `dist/assets/popup-AVKxB_6W.css`: `76.30 kB` (`76,305 B`, gzip `11.97 kB`)
   - `dist/assets/translator-BersRAKQ.js`: `43.98 kB` (`43,980 B`, gzip `12.00 kB`)
   - `dist/assets/domainNormalizer-DnXGcnwF.js`: `23.17 kB` (`23,175 B`, gzip `7.25 kB`)
   - `dist/assets/storageKeys-iohUx5lT.js`: `0.30 kB` (`305 B`, gzip `0.23 kB`)
3. **`npm test`:** **485 / 485 PASS** (`0` fail, `0` skip, `25.78s`).

---

## 5. Hướng dẫn kiểm tra trên Chrome / Web Preview

1. Mở `chrome://extensions` → **Load unpacked** chọn `dist/` (hoặc bấm **Reload** extension) → mở popup `Focus Quest` tab **Map**: kiểm tra vùng rừng tối xung quanh vùng đất mở `8×8` đã thưa thoáng (~30% cây), không còn mảnh cây cụt phẳng đầu (`15/16` đứng lẻ), không còn mảng dính liền, các cây giữ màu tươi nổi bật trên nền tối `44%`.
2. Bật **Expand Land**: kiểm tra auto-zoom, hover & chọn chunk mở đất vẫn mượt và sạch ở biên.
3. Mở Web Preview `/#sprites` kiểm tra thẻ `15`, `16`, `5`, 6 card `M1–M6` và khung `16×11` xem khớp mẫu `tree_recipes_57acd418.png`.

**Trạng thái hiện tại:** **DỪNG chờ duyệt** trước khi sang giai đoạn tiếp theo.
