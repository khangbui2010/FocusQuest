# BÁO CÁO TỔNG HỢP LÔ 5 CHẶNG (A → B → C → D → E) — FOCUS QUEST

**Bản sao lưu báo cáo trước lô:** `respond_before_batch_report.md`  
**Bất biến giữ nguyên:** Kinh tế (`Coins`/`XP`/`Multiplier`/`CoinBonus`, Zero Passive Income), All-or-Nothing Pomodoro Countdown, giá & Level mở rộng đất (`cost(k) = round(60 * prod_{i=1..k-1} min(1.5, 1.25 + 0.01*(i-1)))`, level `k+2`), `CURRENT_SCHEMA_VERSION = 2`, `GridMap`/coordinator/transaction, DNR blocking, nút Upgrade khóa `"Milestone 5C"`.  
**Giới hạn chung về kiểm chứng UI:** Toàn bộ unit/UI tests chạy trên Node.js qua React SSR (`renderToString`), **chưa kiểm chứng trực quan hoặc tương tác chuột trên Chrome Extension thật (`Load unpacked`)**.

---

## CHẶNG A — XÁC MINH NỀN & SỬA LỖI MÔI TRƯỜNG

### 1. Kiểm kê Cây `src/` & Marker Ban đầu
- **Các thư mục nền đã xác minh tồn tại đầy đủ:**
  - `src/core/` (`civilization`, `economy`, `profiles`, `reward`, `stats`, `timer`, `utils`)
  - `src/storage/` (`chromeStorageAdapter.ts`, `memoryStorageAdapter.ts`, `storageInterface.ts`, `storageKeys.ts`, `storageManager.ts`, `storageMutex.ts`, `migrations/{migrationRunner,types,v1_initialSchema,v2_civilizationSchema}.ts`)
  - `src/types/` (`economy.ts`, `index.ts`, `lifecycle.ts`, `messages.ts`, `profiles.ts`, `session.ts`, `storageSchema.ts`)
  - `src/i18n/` (`I18nContext.tsx`, `locale.ts`, `translator.ts`, `types.ts`, `locales/{en,vi}.ts`)
  - `src/chrome/` (`alarmsAdapter.ts`, `badgeAdapter.ts`, `dnrAdapter.ts`, `notificationsAdapter.ts`, `tabsAdapter.ts`)
  - `src/background/` (`blockingCoordinator.ts`, `civilizationCoordinator.ts`, `index.ts`, `messageHandler.ts`, `sessionCoordinator.ts`)
  - `src/ui/` (`components/`, `services/{extensionClient,sessionActions,soundEffects}.ts`, `utils/{formatters,sessionModeLabel}.ts`)
- **Trạng thái các marker trước khi chạy Chặng A:**
  - `src/blocked/blocked.ts`: **chưa có** (chỉ có `public/blocked.html` tĩnh)
  - `src/ui/components/civilization/expansionReveal.ts`: **chưa có**
  - `Navbar` 5 tab: **chưa có** (đang là 3 tab: `Quest`, `Start Focus`, `Stats`)
  - `FOREST_UNIT_TEMPLATES` trong `terrainDecor.ts`: **chưa có**
  - `public/_locales/`: **chưa có**
  - `EXPANSION_AXE_TILE_INDEX`: **chưa có**

### 2. Thay đổi Đã thực hiện ở Chặng A
- **File tạo/sao lưu:**
  - `respond_before_batch_report.md` (sao lưu `respond.md` trước khi bắt đầu lô)
- **File chỉnh sửa:**
  - `src/i18n/translator.ts`: Bổ sung `isNodeRuntime()` để bỏ qua `globalThis.navigator` khi chạy trên Node ≥ 21 (tránh locale hệ điều hành như `vi-VN` làm `detectDefaultLocale()` trả `'vi'` trong unit test), vẫn giữ đọc `chrome.i18n.getUILanguage()` / `navigator.language` trên Chrome/Web Preview thật và fallback `'en'`.
  - `src/storage/migrations/migrationRunner.ts`: Chuẩn hóa dấu phân cách đường dẫn trong stack trace bằng `.replace(/\\/g, '/')` khi kiểm tra legacy v1 trên Windows.
  - `package.json`: Sửa script `"clean"` sang lệnh Node đa nền tảng `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"`. Xác nhận script `"test"` đã bao gồm `__tests__/ui/*.test.ts`.
  - `__tests__/core/i18n.test.ts`: Bổ sung assertion giả lập `navigator.language = 'vi-VN'` trong test `'i18n: Node test environment falls back to en by default even if navigator.language is vi-VN'` để kiểm chứng trực tiếp behavior mới.

### 3. Kết quả Kiểm định Chặng A (chạy với `LANG=vi_VN.UTF-8 LC_ALL=vi_VN.UTF-8`)
| Hạng mục | Baseline trước lô | Sau Chặng A (`vi_VN.UTF-8`) | Ghi chú |
|---|---|---|---|
| `npm test` | **467 / 467 PASS** (`43.68s`) | **467 / 467 PASS** (`0` fail, `0` skipped, `0` cancelled, `0` todo, **`29.38s`**) | Toàn bộ test pass cả khi ép locale `vi_VN.UTF-8` |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0` lỗi) | **PASS** (`0` lỗi) | Sạch TypeScript |
| `npm run clean && npm run build` | **PASS** (`1.30s`, `1,726` modules) | **PASS** (**`1.34s`**, Vite `v8.3.5`, **`1,726` modules**) | — |
| `dist/background.js` | `78.14 kB` (gzip `17.01 kB`) | **`78.16 kB`** (gzip `17.02 kB`) | — |
| `dist/assets/popup-*.js` | `698.36 kB` (gzip `186.13 kB`) | **`698.49 kB`** (gzip `186.19 kB`) | `isNodeRuntime` trong bundle chung |
| `dist/assets/popup-*.css` | `73.50 kB` (gzip `11.33 kB`) | **`73.50 kB`** (gzip `11.33 kB`) | — |
| `dist/assets/domainNormalizer-*.js` | `23.22 kB` (gzip `7.27 kB`) | **`23.22 kB`** (gzip `7.27 kB`) | — |

### 4. Assertion / Hạn chế Chặng A
- **Assertion sửa đổi:** Không sửa assertion cũ; bổ sung thêm assertion `navigator.language = 'vi-VN'` trong `__tests__/core/i18n.test.ts`.
- **Hạn chế:** Môi trường chạy hiện tại là Linux với `LANG=vi_VN.UTF-8`; chưa chạy thực tế trên PowerShell/cmd Windows native nhưng đã loại bỏ các phụ thuộc POSIX (`rm -rf`, `\\` trong stack, `navigator.language`).

---

## CHẶNG B — SỬA HIỂN THỊ CÂY / RỪNG THEO CHUNK 4×4 & ĐỘ SÁNG LỚP PHỦ

### 1. Tóm tắt Thay đổi Đã thực hiện
1. **Sửa đúng vai trò ô sprite (`tiny-town/tilemap_packed.png` 12×11, xác minh trực quan trên `tiny-town-labeled.png`):**
   - `3`/`15` là cây cao `1×2` cam (nửa trên `3`, nửa dưới/gốc `15`); `4`/`16` là cây cao `1×2` xanh (nửa trên `4`, nửa dưới/gốc `16`). Đã loại bỏ hoàn toàn `3, 4, 15, 16` khỏi danh sách cây đứng đơn `1×1`.
   - `28` (thông xanh `1×1`), `27` (thông cam `1×1`), `5` (bụi xanh `1×1`) là các đơn vị `1×1` đứng độc lập.
   - Cụm A `2×2` khép kín: `[6,8]/[30,32]` (xanh) và `[9,11]/[33,35]` (cam).
   - Cụm B chữ thập `5` ô (hộp `3×3`, 4 góc để trống): `[·,7,·]/[18,19,20]/[·,31,·]` (xanh) và `[·,10,·]/[21,22,23]/[·,34,·]` (cam); `19`/`22` chỉ xuất hiện ở tâm Cụm B.
   - Đã gỡ bỏ mẫu `diamond_3x3_green` và cặp `1×2` sai (`[7]/[31]`) khỏi `SpriteGallery.tsx` & `TILE_INDEX.md`.
2. **Bộ sinh rừng thuần UI theo từng chunk `4×4` (`terrainDecor.ts`):**
   - Dùng `floorDiv(coord, 4)` + `mulberry32(hashTerrainCoords(cx, cy))` có cache (`chunkLayoutCache`), mỗi chunk `4×4` tự khép kín, không phụ thuộc chunk lân cận và không cắt qua biên chunk.
   - Mật độ mục tiêu `T ∈ {5, 6}` ô rừng/chunk với công thức trọng số: Cụm B + 0–1 nhỏ/bụi (`20%`), Cụm A + 1–2 nhỏ/bụi (`30%`), 2 cây cao + 1–2 nhỏ/bụi (`20%`), 1 cây cao + 3–4 nhỏ/bụi (`15%`), chỉ nhỏ/bụi (`15%`). Ưu tiên vị trí không kề 4 hướng, giảm số cây nhẹ nhàng nếu hết chỗ hợp lệ.
   - Vùng đã mở (`isUnlocked = true`): giữ cỏ (`0, 1, 2`), đất thưa (`12–14, 24–26, 36–42`), đá rêu (`43`), mầm/nấm (`17, 29`), thêm bụi xanh `5` thưa thớt (`≤ 5%`) **chỉ đặt trên cỏ trơn `0`**, không bao giờ có cây/tán lá, không chặn đặt công trình.
3. **Hiển thị `MapGridView` & `SpriteGallery`:**
   - `MapGridView.tsx`: Dùng `FOREST_MARGIN_CHUNKS = 2` (`8` ô mỗi cạnh, tổng sân `24×24` cho bản đồ đầu `8×8`), bỏ viền ô (`border-0`) và nền xám trên vùng khóa để các tán cây `2×2` / `3×3` liền mạch không bị kẻ cắt, dùng hằng số `LOCKED_FOREST_OVERLAY_OPACITY = 0.40`, giữ zoom mặc định `100%`.

### 2. File Chỉnh sửa ở Chặng B
- `src/ui/components/civilization/terrainDecor.ts`
- `src/ui/components/civilization/MapGridView.tsx`
- `src/ui/components/civilization/spriteData.ts` *(comment mapping)*
- `src/ui/components/civilization/SpriteGallery.tsx`
- `docs/sprites/TILE_INDEX.md`
- `public/assets/sprites/CREDITS.md`
- `__tests__/ui/terrainDecor.test.ts`
- `__tests__/ui/spriteRegistry.test.ts`
- `__tests__/ui/civilizationView.test.ts`

### 3. Số liệu Đo Đạc Thực tế (Quét 10,000 Chunks & Kiểm định)
- **Kết quả quét `10,000` chunks (`-50..-50` đến `49..49`):**
  - Tổng chunk hợp lệ: **`10,000`** (`0` đơn vị tràn biên chunk, `0` trùng ô, `0` mảnh tán lá mồ côi)
  - Số ô rừng trung bình/chunk: **`5.500`** ô/16 ô (`T ∈ {5, 6}`) → Mật độ cây rừng: **`34.37%`**
  - Tỉ lệ chunk có Cụm A hoặc Cụm B: **`50.13%`** (`1,988` Cross B = `19.88%`, `3,025` Cluster A = `30.25%`)
  - Tổng đơn vị rừng sinh ra: **`32,539`** (`tall = 5,432`, `smallGreen = 13,170` = `59.61%` nhóm nhỏ/bụi, `bush = 6,851` = `31.01%`, `smallOrange = 2,073` = `9.38%`)
  - Tỉ lệ đơn vị màu cam trên toàn bộ đơn vị: **`9.05%`** (`≤ 10%`)

| Hạng mục | Sau Chặng A | Sau Chặng B | Ghi chú |
|---|---|---|---|
| `npm test` | **467 / 467 PASS** (`29.38s`) | **467 / 467 PASS** (`0` fail, `0` skipped, **`29.80s`**) | Bao gồm test quét 10,000 chunks trong `terrainDecor.test.ts` |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0` lỗi) | **PASS** (`0` lỗi) | — |
| `npm run clean && npm run build` | **PASS** (`1.34s`, `1,726` modules) | **PASS** (**`1.08s`**, **`1,726` modules**) | — |
| `dist/background.js` | `78.16 kB` | **`78.16 kB`** (gzip `17.02 kB`) | Không đổi |
| `dist/assets/popup-*.js` | `698.49 kB` | **`703.68 kB`** (gzip `187.69 kB`) | Bộ sinh rừng 4×4 + mẫu SpriteGallery |
| `dist/assets/popup-*.css` | `73.50 kB` | **`73.24 kB`** (gzip `11.29 kB`) | Gỡ bớt lớp border trên ô rừng |

### 4. Assertion cũ Đã sửa & Hạn chế Chặng B
1. `__tests__/ui/terrainDecor.test.ts`:
   - *Cũ:* `FORBIDDEN_UNLOCKED_SET` cấm cả bụi `5` (`GREEN_BUSH`) và kiểm tra `24×24` theo từng block `2×2` (`pair_1x2`).
   - *Mới:* Cho phép bụi `5` thưa (`≤ 5%`) trên ô đã mở **chỉ khi `baseTile === 0` (plain grass)**, giữ nguyên cấm tuyệt đối cây (`3,4,15,16,27,28`) và mảnh tán lá (`6–11, 18–23, 30–35`); chuyển kiểm định rừng sang quét `10,000` chunk `4×4` theo `FOREST_UNIT_TEMPLATES`.
   - *Lý do:* Yêu cầu Chặng B sửa lại vai trò ô sprite (`3/15, 4/16` là `1×2`; bỏ `pair_1x2` `[7]/[31]`) và thêm bụi `5` thưa trên cỏ trơn vùng đã mở.
2. `__tests__/ui/spriteRegistry.test.ts` (dòng 384–413) & `__tests__/ui/civilizationView.test.ts` (dòng 309–332):
   - *Cũ:* `data-render-width="12"` / `data-render-height="12"` (thường) và `"16"` (expansion), `gallery-canopy-diamond_3x3_green`, `gallery-canopy-pair_1x2_green`.
   - *Mới:* `data-render-width="24"` / `data-render-height="24"` (`opacity:0.4`), kiểm tra `cross_b_green/orange`, `tall_1x2_green/orange`, `rect_border_sample`, `l_border_sample`, và phủ nhận `diamond_3x3_green` / `pair_1x2_green`.
   - *Lý do:* Do `FOREST_MARGIN_CHUNKS = 2` (`8` ô mỗi cạnh để không cắt chunk rừng `4×4`), `LOCKED_FOREST_OVERLAY_OPACITY = 0.40`, và gỡ mẫu tán lá sai trong `SpriteGallery`.
- **Hạn chế:** Vẫn chỉ kiểm định qua SSR `renderToString` + unit test logic; **chưa mở trực tiếp trong Chrome (`Load unpacked`) hoặc trang `#sprites` trên trình duyệt** để nhìn bằng mắt độ mịn viền rừng và màu phủ 40%.

---

## CHẶNG C (MILESTONE 5B.6b) — ANIMATION RÌU CHÉM RỪNG & RUNG MÀN HÌNH MỞ RỘNG ĐẤT

### 1. Tóm tắt Thiết kế & Triển khai
1. **Logic thuần & An toàn SSR (`src/ui/components/civilization/expansionReveal.ts`):**
   - `EXPANSION_AXE_TILE_INDEX = 127` (ô rìu CC0 Tiny Town từ `kenney-tiny-town/tilemap_packed.png`), `EXPANSION_IMPACT_MS = 680`, `EXPANSION_SHAKE_DURATION_MS = 340`, `EXPANSION_ANIMATION_DURATION_MS = 1150`.
   - Hàm thuần `buildExpansionAnimationPlan`, `detectNewlyAddedChunks`, `isExpansionChunkRevealed`, `isCellInChunk`, `doesFootprintOverlapChunkOrigin` (hỗ trợ cả tọa độ âm và dương), `prefersReducedMotion()` an toàn khi thiếu `window` trên SSR.
2. **Overlay Animation & Keyframes CSS (`ExpansionRevealOverlay.tsx` & `src/index.css`):**
   - Render rìu rơi từ trên xuống chém vào tâm chunk mới tại mốc `680ms` (`--fq-impact-delay`), lóe sáng + `6` mảnh bụi/vụn gỗ màu bảng Tiny Town, kết hợp rung nhẹ **chỉ trên lớp bản đồ** (`data-testid="map-shake-layer"`, biên độ `~2.5px` trong `340ms`, trả về `transform: none`, không đụng Header/Navbar/modals).
   - Tuân thủ `@media (prefers-reduced-motion: reduce)` trong cả JS (`prefersReducedMotion()`) và CSS fallback (`display: none !important; animation: none !important`).
   - Giữ nguyên zoom `100%` (không tự động thu/phóng khi chém) và không chặn thao tác đóng/chuyển tab nhờ dọn timer trên unmount.
3. **Đồng bộ Trạng thái Sau Commit (`CivilizationScreen.tsx` & `MapGridView.tsx`):**
   - Phát hiện chênh lệch tập chunk sau hydrate (không kích hoạt khi tải lại state ban đầu); hỗ trợ mở nối tiếp nhiều chunk (hủy timer cũ và chuyển mượt sang chunk mới).
   - Trước mốc `680ms` (`unrevealedChunkOrigin`), `16` ô chunk mới vẫn giữ hiển thị rừng tối và chặn hover/click đặt công trình đè lên vùng đang mở; sau `680ms` mở lộ đồng bộ sang cảnh quan đã mở Chặng B.
   - Bổ sung vùng `aria-live="polite"` song ngữ EN/VI (`civ.expand.ariaAnnouncement`).

### 2. File Tạo mới & Chỉnh sửa ở Chặng C
- **Tạo mới:**
  - `src/ui/components/civilization/expansionReveal.ts`
  - `src/ui/components/civilization/ExpansionRevealOverlay.tsx`
  - `__tests__/ui/expansionReveal.test.ts` *(5 tests)*
- **Chỉnh sửa:**
  - `src/index.css`
  - `src/ui/components/civilization/{MapGridView.tsx,CivilizationScreen.tsx,spriteData.ts,SpriteGallery.tsx}`
  - `src/i18n/locales/{en,vi}.ts`
  - `public/assets/sprites/CREDITS.md`

### 3. Kết quả Kiểm định Chặng C
| Hạng mục | Sau Chặng B | Sau Chặng C | Ghi chú |
|---|---|---|---|
| `npm test` | **467 / 467 PASS** (`29.80s`) | **472 / 472 PASS** (`0` fail, `0` skipped, **`32.92s`**) | **+5 tests mới** trong `expansionReveal.test.ts` |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0` lỗi) | **PASS** (`0` lỗi) | — |
| `npm run clean && npm run build` | **PASS** (`1.08s`, `1,726` modules) | **PASS** (**`1.26s`**, **`1,728` modules**) | — |
| `dist/background.js` | `78.16 kB` | **`78.16 kB`** (gzip `17.02 kB`) | Không đổi |
| `dist/assets/popup-*.js` | `703.68 kB` | **`708.99 kB`** (gzip `189.57 kB`) | +5.31 kB cho `expansionReveal` + overlay |
| `dist/assets/popup-*.css` | `73.24 kB` | **`75.77 kB`** (gzip `11.90 kB`) | Keyframes chém rìu, hạt gỗ & rung bản đồ |

### 4. Assertion cũ Đã sửa & Hạn chế Chặng C
- **Assertion cũ đã sửa:** Không có assertion cũ nào bị sửa ở Chặng C.
- **Hạn chế:** Test kiểm tra cấu trúc CSS keyframes, logic timer `680ms`/`1150ms`, trạng thái DOM SSR trước/sau mốc mở khóa và `prefersReducedMotion`; **chưa xem bằng mắt hiệu ứng chuyển động trên Chrome Extension thật (`Load unpacked`)**, nên không đánh giá chủ quan mức độ "đẹp/mượt".

---

## CHẶNG D — THANH ĐIỀU HƯỚNG DƯỚI 5 TAB & MẶC ĐỊNH MÀN HÌNH BẢN ĐỒ

### 1. Tóm tắt Thiết kế & Triển khai
1. **Thanh điều hướng dưới 5 tab (`src/ui/components/Navbar.tsx`):**
   - Bố cục lưới `grid-cols-[1fr_1fr_1.6fr_1fr_1fr]` với tổng chiều cao `h-[64px]` (`56px` thanh nền + `8px` khoảng hở trong suốt phía trên) để hiệu ứng nhô lên `-translate-y-2` của tab đang chọn không bị cắt hoặc đẩy layout.
   - Thứ tự cố định trái → phải: **`Quests | Focus | Map | Awards | Stats`** (EN) / **`Nhiệm vụ | Tập trung | Bản đồ | Thành tựu | Thống kê`** (VI). Tab `Map` nằm chính giữa và rộng nhất (`1.6fr`).
   - Giữ trạng thái chấm xung (`nav-focus-status-dot`) trên tab `Focus` khi phiên đang chạy/tạm dừng/nghỉ, gắn `aria-current="page"` + `data-active="true"`, không xử lý lại khi bấm tab đang active, hỗ trợ `motion-reduce:transition-none`.
   - Placeholder `Quests` (`quests-placeholder-view`) và `Awards` (`awards-placeholder-view`), chưa hiển thị badge số chưa nhận.
2. **Header & PopupShell (`src/ui/components/Header.tsx`, `src/App.tsx`):**
   - `App.tsx` mặc định mở `activeTab = 'map'` (Your Civilization). Mở `ProfileBottomSheet` qua state riêng `isProfileSheetOpen`.
   - Gỡ bỏ nút `← Map` (`back-to-map-btn`) khỏi `Header.tsx`, giữ nguyên phím tắt logo `header-brand-home` và `header-shield-badge`.

### 2. File Tạo mới & Chỉnh sửa ở Chặng D
- **Tạo mới:**
  - `__tests__/ui/bottomNavFiveTabs.test.ts` *(3 tests)*
- **Chỉnh sửa:**
  - `src/ui/components/Navbar.tsx`
  - `src/ui/components/Header.tsx`
  - `src/App.tsx`
  - `src/i18n/locales/{en,vi}.ts` *(thay `nav.{quest,startFocus,backToMap*,backToFocus}` bằng `nav.{ariaLabel,quests,focus,map,awards,stats}` và thêm `awards.placeholder.*`)*
  - `__tests__/ui/navigationRedesign.test.ts`
  - `__tests__/ui/extensionPopupShell.test.ts`

### 3. Kết quả Kiểm định Chặng D
| Hạng mục | Sau Chặng C | Sau Chặng D | Ghi chú |
|---|---|---|---|
| `npm test` | **472 / 472 PASS** (`32.92s`) | **475 / 475 PASS** (`0` fail, `0` skipped, **`33.24s`**) | **+3 tests mới** trong `bottomNavFiveTabs.test.ts` |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0` lỗi) | **PASS** (`0` lỗi) | — |
| `npm run clean && npm run build` | **PASS** (`1.26s`, `1,728` modules) | **PASS** (**`1.28s`**, **`1,728` modules**) | — |
| `dist/background.js` | `78.16 kB` | **`78.16 kB`** (gzip `17.02 kB`) | Không đổi |
| `dist/assets/popup-*.js` | `708.99 kB` | **`712.09 kB`** (gzip `190.26 kB`) | Navbar 5 tab + placeholder `Awards` |
| `dist/assets/popup-*.css` | `75.77 kB` | **`76.27 kB`** (gzip `11.97 kB`) | Class `h-[64px]`, `-translate-y-2`, `1.6fr` |

### 4. Assertion cũ Đã sửa & Hạn chế Chặng D
1. `__tests__/ui/navigationRedesign.test.ts`:
   - *Cũ:* Kiểm tra thanh 3 tab (`nav-tab-quest`, `nav-tab-home`, `nav-tab-stats`), nhãn `'Quest'`, `'Start Focus'`, `'Stats'`, `'Tạo Nhiệm vụ'`, `'Bắt đầu Tập trung'`, nút `data-testid="back-to-map-btn"` (`← Bản đồ`), và `activeView = 'home'`.
   - *Mới:* Kiểm tra thanh 5 tab (`nav-tab-quests`, `nav-tab-focus`, `nav-tab-map`, `nav-tab-awards`, `nav-tab-stats`), nhãn EN (`Quests`, `Focus`, `Map`, `Awards`, `Stats`) & VI (`Nhiệm vụ`, `Tập trung`, `Bản đồ`, `Thành tựu`, `Thống kê`), xác nhận **không còn** `data-testid="back-to-map-btn"`, giữ `header-brand-home`, và kiểm tra `aria-current="page"` trên `quests`/`awards`.
   - *Lý do:* Yêu cầu Chặng D chuyển điều hướng sang 5 tab (`Quests | Focus | Map | Awards | Stats`), mặc định tab `Map` ở giữa, và xóa nút `← Map` trên Header.
2. `__tests__/ui/extensionPopupShell.test.ts`:
   - *Cũ:* Kiểm tra sự hiện diện của `'Start Focus'` trên Navbar trong popup extension.
   - *Mới:* Kiểm tra đủ 5 nhãn tab mới `'Quests'`, `'Focus'`, `'Map'`, `'Awards'`, `'Stats'`.
   - *Lý do:* Tab giữa cũ bị thay thế bởi hệ 5 tab ở Chặng D.
- **Hạn chế:** SSR chỉ xác nhận HTML/class `h-[64px]`, `h-[56px]`, `-translate-y-2`, `grid-cols-[1fr_1fr_1.6fr_1fr_1fr]`; **chưa kiểm chứng hiển thị tràn ngang/độ cao thật trên cửa sổ popup `400px` của Chrome thật**.

---

## CHẶNG E — SONG NGỮ 100% EN/VI, THÔNG BÁO SONG NGỮ, BLOCKED PAGE CSP-SAFE & `_locales`

### 1. Tóm tắt Triển khai
1. **Từ điển & Helper Công trình/Thời đại (`en.ts`, `vi.ts`, `buildingI18n.ts`):**
   - Mở rộng từ điển `EN_MESSAGES` và `VI_MESSAGES` lên **352 khóa** (parity 100% khóa EN/VI không rỗng).
   - Tạo `src/ui/utils/buildingI18n.ts` (`getLocalizedBuildingName`, `getLocalizedBuildingDescription`, `getLocalizedEraName`) phủ toàn bộ 6 công trình Stone Age và 8 `CivilizationEra`.
2. **Ánh xạ Lỗi từ Backend/Coordinator sang VI (`src/i18n/errorTranslator.ts`):**
   - Tạo `localizeErrorMessage(locale, rawError)`: giữ nguyên chuỗi gốc khi locale là `'en'`; dịch toàn bộ lỗi tĩnh & có tham số từ `ProfileManager`, `DomainNormalizer`, `CivilizationCoordinator`, `SessionCoordinator`, `MessageHandler` sang tiếng Việt (bao gồm tên công trình qua `buildingI18n` và tên kỷ nguyên).
3. **Song ngữ Hóa Toàn bộ UI Còn lại & Shell Preview:**
   - Gắn `useTranslation()` / `localizeErrorMessage()` vào `RewardHelpModal.tsx`, `StatsView.tsx`, `CivilizationHeader.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, `CivilizationScreen.tsx`, `MapGridView.tsx`, `ProfileBottomSheet.tsx`, `TimerView.tsx` (cả 2 khối `actionError`), và shell xem trước web standalone trong `src/App.tsx`.
   - Giữ nguyên nút nâng cấp khóa với nhãn `"Milestone 5C"` trong `BuildingDetailsModal.tsx`.
4. **Thông báo Chrome Song ngữ (`src/background/sessionCoordinator.ts`):**
   - Thêm `getActiveLocale()` đọc `this.storage.getSettings()` + `resolveLocale(...)`, dịch toàn bộ 5 điểm `this.notifications.create(...)` (`notif.missionCompleteTitle`, `notif.countdownCompleteMsg`, `notif.pomoCompleteMsg`, `notif.longBreakTitle`/`notif.shortBreakTitle`, `notif.pomoCdBreakMsg`, `notif.pomoSwBreakMsg`, `notif.breakEndedTitle`, `notif.breakEndedMsg`).
5. **Trang Chặn MV3 CSP-Safe (`src/blocked/blocked.ts`, `public/blocked.html`, `vite.config.ts`) & `_locales` Chrome:**
   - Tạo `src/blocked/blocked.ts` (`applyBlockedTranslations`, `initBlockedPage`) đọc `fq_settings` từ `chrome.storage.local`, mở `data-ready="true"` trên `#blocked-card` (anti-flash CSS opacity, fallback timer `80ms`), lắng nghe `chrome.storage.onChanged` đổi ngôn ngữ trực tiếp mà không dùng inline script.
   - Cấu hình entrypoint thứ 3 `blocked` → `dist/blocked.js` trong `vite.config.ts`.
   - Tạo `public/_locales/{en,vi}/messages.json` (`extName`, `extDescription` `<= 120` ký tự) và cập nhật `public/manifest.json` (`default_locale: "en"`, `__MSG_extName__`, `__MSG_extDescription__`, `web_accessible_resources: ["blocked.html", "blocked.js", "assets/*"]`).

### 2. File Tạo mới & Chỉnh sửa ở Chặng E
- **Tạo mới:**
  - `src/ui/utils/buildingI18n.ts`
  - `src/i18n/errorTranslator.ts`
  - `src/blocked/blocked.ts`
  - `public/_locales/en/messages.json`
  - `public/_locales/vi/messages.json`
  - `__tests__/core/manifestLocales.test.ts` *(3 tests)*
  - `__tests__/ui/fullBilingual.test.ts` *(5 tests)*
- **Chỉnh sửa:**
  - `src/i18n/locales/{en,vi}.ts` *(352 khóa đồng bộ)*
  - `src/ui/components/{RewardHelpModal,StatsView,ProfileBottomSheet,TimerView}.tsx`
  - `src/ui/components/civilization/{CivilizationHeader,BuildingCatalogPanel,BuildingDetailsModal,CivilizationScreen,MapGridView}.tsx`
  - `src/App.tsx`
  - `src/background/sessionCoordinator.ts`
  - `public/blocked.html`, `public/manifest.json`, `vite.config.ts`

### 3. Kết quả Kiểm định Chặng E
| Hạng mục | Sau Chặng D | Sau Chặng E | Ghi chú |
|---|---|---|---|
| `npm test` | **475 / 475 PASS** (`33.24s`) | **483 / 483 PASS** (`0` fail, `0` skipped, **`32.26s`**) | **+8 tests mới** (`manifestLocales` 3 + `fullBilingual` 5) |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0` lỗi) | **PASS** (`0` lỗi) | — |
| `npm run clean && npm run build` | **PASS** (`1.28s`, `1,728` modules) | **PASS** (**`1.08s`**, **`1,731` modules**) | 3 entrypoints (`popup`, `background`, `blocked`) |
| `dist/background.js` | `78.16 kB` (`17.02 kB` gzip) | **`78.13 kB`** (`16.91 kB` gzip) | Phần i18n dùng chung tách sang `translator-*.js` |
| `dist/blocked.js` | Chưa có | **`1.32 kB`** (`0.60 kB` gzip) | Entrypoint thứ 3 CSP-safe |
| `dist/blocked.html` | `1.54 kB` | **`1.81 kB`** | CSS anti-flash `#blocked-card`, không inline script |
| `dist/assets/popup-*.js` | `712.09 kB` (`190.26 kB` gzip) | **`696.68 kB`** (`185.50 kB` gzip) | Từ điển dùng chung dồn vào `translator-*.js` (`43.98 kB`) |
| `dist/assets/translator-*.js` | Chưa tách | **`43.98 kB`** (`12.00 kB` gzip) | Chia sẻ giữa popup, blocked và background |
| `dist/assets/domainNormalizer-*.js` | `23.22 kB` (`7.27 kB` gzip) | **`23.17 kB`** (`7.25 kB` gzip) | — |
| `dist/assets/popup-*.css` | `76.27 kB` (`11.97 kB` gzip) | **`76.27 kB`** (`11.97 kB` gzip) | — |
| `dist/_locales/{en,vi}/messages.json` | Chưa có | **`382 B`** (EN) / **`440 B`** (VI) | Có mặt trong `dist/_locales/` |

### 4. Assertion cũ Đã sửa & Hạn chế Chặng E
- **Assertion cũ đã sửa:** Không có assertion cũ nào bị sửa ở Chặng E.
- **Lưu ý rà soát chuỗi cứng:** Quét toàn bộ JSX trong `src/ui/components/` (trừ dev-only `SpriteGallery.tsx` tuyến `#sprites` chỉ mở ở web preview) trả về **0 chuỗi hardcoded**.
- **Hạn chế:** Giao diện `blocked.html` + `blocked.js`, thông báo Chrome, và nút chuyển EN/VI **chưa được mở xem trực tiếp trên trình duyệt Chrome thật (`Load unpacked`)**.

---

## TỔNG HỢP TOÀN BỘ LÔ 5 CHẶNG, KIỂM TOÁN CHỈ ĐỌC & ĐỀ XUẤT KẾ TIẾP

### 1. Bảng So sánh Baseline Trước Lô vs Trạng thái Sau Chặng E (Số liệu Thật)
| Chỉ số / Artifact | Baseline trước lô (Sau 5B.6a) | Cuối Lô (Sau Chặng E + Sync Docs) | Chênh lệch |
|---|---|---|---|
| Tổng số tests (`npm test`) | `467 / 467 PASS` (`43.68s`) | **`483 / 483 PASS`** (`32.26s`) | **+16 tests** (`0` fail, `0` skip) |
| TypeScript (`tsc --noEmit`) | PASS (`0` lỗi) | **PASS (`0` lỗi)** | Sạch 100% |
| Vite Build (`npm run build`) | PASS (`1,726` modules, `1.30s`) | **PASS (`1,731` modules, `1.08s`)** | +5 modules, 3 entrypoints |
| Khóa từ điển `en.ts` / `vi.ts` | Parity < 352 | **`352` / `352`** (parity 100%) | Đủ EN/VI |
| `dist/background.js` | `78.14 kB` | **`78.13 kB`** (`16.91 kB` gzip) | `-0.01 kB` |
| `dist/blocked.js` | Không có | **`1.32 kB`** (`0.60 kB` gzip) | Mới (Chặng E) |
| `dist/assets/popup-*.js` | `698.36 kB` | **`696.68 kB`** (`185.50 kB` gzip) | `-1.68 kB` (tách `translator-*.js`) |
| `dist/assets/popup-*.css` | `73.50 kB` | **`76.27 kB`** (`11.97 kB` gzip) | `+2.77 kB` |
| `dist/_locales/{en,vi}` | Không có | **Có** (`382 B` / `440 B`) | Mới (Chặng E) |

### 2. Danh sách Đầy đủ Assertion Cũ Đã Sửa Trong Lô (Chặng A → E)
1. `__tests__/ui/terrainDecor.test.ts` *(Chặng B)*: Cho phép bụi xanh `5` thưa (`<= 5%`) trên cỏ trơn `0` ở vùng mở; chuyển kiểm định rừng khóa sang quét `10,000` chunk `4×4` theo `FOREST_UNIT_TEMPLATES` do sửa vai trò ô `3/15, 4/16` thành `1×2` và bỏ `pair_1x2`.
2. `__tests__/ui/spriteRegistry.test.ts` & `__tests__/ui/civilizationView.test.ts` *(Chặng B)*: Đổi kỳ vọng stage từ `12×12` / `16×16` (`opacity:0.5`) sang `24×24` (`opacity:0.4`) theo `FOREST_MARGIN_CHUNKS = 2` và cập nhật danh sách mẫu `SpriteGallery` (`cross_b_*`, `tall_1x2_*`, `rect_border_sample`, `l_border_sample`; gỡ `diamond_3x3_green`, `pair_1x2_green`).
3. `__tests__/ui/navigationRedesign.test.ts` & `__tests__/ui/extensionPopupShell.test.ts` *(Chặng D)*: Chuyển kỳ vọng thanh 3 tab (`Quest | Start Focus | Stats`) và nút `← Map` sang thanh 5 tab (`Quests | Focus | Map | Awards | Stats`), tab `Map` mặc định ở giữa.
*(Chặng A chỉ thêm assertion vào test i18n có sẵn; Chặng C và Chặng E không sửa assertion cũ nào).*

### 3. Đồng bộ Tài liệu & Kết quả Kiểm toán Chỉ Đọc (Read-Only Audit)
- **Tài liệu đã đồng bộ (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md`):**
  - Cập nhật đồng nhất sang lưới khởi đầu `8×8` (4 chunks `4×4`), công thức chi phí mở rộng đất `cost(k)` và điều kiện `Player Level >= k + 2`, cảnh quan rừng UI thuần, animation rìu chém, thanh 5 tab đáy, song ngữ EN/VI + `blocked.js` + `_locales`, và số test thật `483/483`; gỡ bỏ toàn bộ cú pháp LaTeX (`$...$`) khỏi các file `.md`.
- **Phát hiện Kiểm toán Chỉ đọc (giữ nguyên ngoài phạm vi sửa, ghi nhận minh bạch):**
  1. **`manifest.json` `web_accessible_resources`:** Hiện đặt `"matches": ["<all_urls>"]` cho `["blocked.html", "blocked.js", "assets/*"]`. Đây là cấu hình chuẩn để `declarativeNetRequest` redirect mọi domain ngoài allowlist tới `blocked.html` kèm CSS/JS, nhưng cần chuẩn bị thuyết minh rõ cùng `host_permissions` khi gửi xét duyệt Chrome Web Store.
  2. **Cảnh báo kích thước bundle Vite (`> 500 kB`):** `dist/assets/popup-*.js` ở mức **`696.68 kB`** (`185.50 kB` gzip) vẫn gây cảnh báo Rollup/Rolldown khi `vite build`. Phần từ điển chia sẻ đã tự động tách sang `translator-*.js` (`43.98 kB`); có thể dùng lazy `React.lazy()` cho các màn phụ (`SpriteGallery`, `RewardHelpModal`, `BuildingCatalogPanel`) ở đợt tối ưu sau.
  3. **Lockfile & tàn dư template còn lại:** Thư mục gốc vẫn còn đồng thời **2 lockfile** (`bun.lock` `38,730 B` và `package-lock.json` `85,877 B`), gói nén nguồn `public/assets/aistudio/focus-quest-sprites-cc0_f51ac367.zip` (`59,867 B`) bị Vite copy vào `dist/assets/aistudio/`, cùng `postcss.config.cjs` (`22 B`) / devDependencies `autoprefixer` + `esbuild` trong `package.json`. Chưa xóa trong lô này để tránh đụng ngoài phạm vi.

### 4. Hạn chế Trung thực & Đề xuất Bước Kế tiếp
- **Hạn chế quan trọng nhất:** Toàn bộ UI và hiệu ứng (rừng `4×4`, lớp phủ 40%, animation rìu chém `680ms`/`1150ms`, thanh 5 tab popup `400px`, `blocked.html` EN/VI, Web Audio chime) **mới chỉ kiểm định qua React SSR (`renderToString`) và unit/integration test trên Node.js — CHƯA kiểm chứng bằng mắt hoặc tương tác thật trên Chrome (`chrome://extensions` Load unpacked).**
- **Lộ trình đề xuất tiếp theo:**
  1. **Kiểm tra thủ công trên Chrome thật (`Load unpacked dist/`):** Xác nhận trực quan toàn bộ Lô A → E trước khi code tính năng mới.
  2. **Nâng cấp `StatsView` & nối `Elder's Hut` (Giai đoạn 3):** `statsAggregator.ts` + biểu đồ SVG Day/Month/Year + mở khóa streak.
  3. **Hệ thống `Quests` hoàn chỉnh (Giai đoạn 2a → 2b → 5c):** Schema v3, migration v3, `QuestCoordinator`, nối atomic vào `commitSessionOutcomeInternal` & thay thế placeholder tab `Quests`.
  4. **Hệ thống `Awards` thật & Hoạt ảnh nhóm người 4b (ĐC-11):** Thay placeholder tab `Awards` và thêm nhân vật Tiny Dungeon sống động vào `FocusSceneArea`.
  5. **CWS Hardening & Milestone 5C:** Dọn file zip/lockfile thừa, code-splitting giảm bundle `< 500 kB`, rồi mở khóa `UPGRADE_BUILDING` + Bronze Age ở Milestone 5C.
