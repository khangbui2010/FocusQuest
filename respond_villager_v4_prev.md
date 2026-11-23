# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER V3
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-22  
**Trạng thái:** **HOÀN TẤT — 658/658 TESTS PASS (3/3 LƯỢT) | BUILD PASS | LINT PASS (Chờ nghiệm thu trên Chrome thật & duyệt)**  

> **Sao lưu báo cáo cũ:** Bản báo cáo V2 trước đó đã được sao lưu nguyên vẹn tại `respond_villager_v3_prev.md` (giữ nguyên toàn bộ các tệp `respond_*_prev.md` khác).

---

## 1. Chặng 0 — Kết quả Kiểm toán (Audit trước khi sửa mã)

1. **Cách lấy danh sách ô đi được (`walkable`) & an toàn tọa độ âm / hình dạng chunk bất kỳ:**
   - Trong `GridMap` (`src/core/civilization/gridMap.ts`), bản đồ lưu các chunk `4×4` đã mở qua `getUnlockedChunks()` và tra cứu nhanh `isCellUnlocked(x, y)` / `getOccupyingBuilding(x, y)` dựa trên khóa `"x,y"`. Tọa độ âm (`x < 0` hoặc `y < 0`) và các vùng đất mở rộng bất đối xứng (hình chữ L, chữ T) được hỗ trợ đầy đủ.
   - Kết hợp quét từng ô `(chunk.origin.x + dx, chunk.origin.y + dy)` của `getUnlockedChunks()` và kiểm tra đồng thời `gridMap.isCellUnlocked(cx, cy)`, `gridMap.getOccupyingBuilding(cx, cy) === undefined` cùng footprint thực tế từ `buildings` (`getBuildingDefinition` + `getFootprintCoordinates`) để đảm bảo dân làng **tuyệt đối không** bước lên footprint công trình hay rừng/đất chưa mở, và sắp xếp ổn định theo `(y, x)`.
2. **Ánh xạ hướng bước sang hoạt ảnh của `VillagerSprite`:**
   - Spritesheet gốc V1 (`spriteRegistry.ts` & `VillagerSprite.tsx`) chỉ có 4 hàng hoạt ảnh: `'idle'`, `'walk_down'`, `'walk_right'`, `'walk_left'` (**không có `'walk_up'`**).
   - Hàm thuần `getWalkAnimation(from, to, lastFacing)` ánh xạ chuẩn: `dx > 0 → 'walk_right'`, `dx < 0 → 'walk_left'`, `dx === 0 && dy > 0 → 'walk_down'`, `dx === 0 && dy < 0 → (lastFacing === 'left' ? 'walk_left' : 'walk_right')`, `dx === 0 && dy === 0 → 'idle'`.
3. **Thứ tự `z-index` trong `MapGridView.tsx`:**
   - Sân khấu bản đồ (`map-grid-stage` → `map-shake-layer`) có thứ tự: địa hình canvas `z-[0]` → lưới ô tương tác `z-[1]` → viền chunk `z-[2]` → công trình `z-10` → preview đặt công trình & ô mở rộng `z-20` → overlay rìu chém / `BuildingCatalogPanel` `z-30` → `BuildingDetailsModal` / `LandExpansionModal` `z-40`.
   - Bọc toàn bộ dân làng trong `<div data-testid="map-villagers-layer" className="absolute inset-0 z-[11] pointer-events-none">`: container này tạo một **stacking context cô lập ở mức `11`** (trên công trình `z-10`, luôn dưới preview/candidates `z-20` và các modal/header), cho phép mỗi dân làng bên trong đặt `zIndex: Math.max(1, v.cell.y - renderBox.minY + 1)` để hàng `y` phía dưới luôn che hàng phía trên mà **không bao giờ thoát khỏi tầng `11`**, kể cả khi tọa độ `y` âm.
4. **Dịch chuyển `renderBox` khi mở rộng Tây/Bắc hoặc Expansion Mode:**
   - Khi mở rộng Tây `(-4,0)` hay Bắc `(0,-4)`, `renderBox.minX` / `renderBox.minY` thay đổi. Mỗi dân làng đặt tại `left: 0; top: 0` với `transform: translate((cell.x - renderBox.minX) * CELL_SIZE, (cell.y - renderBox.minY) * CELL_SIZE)` và trong Expansion Mode / khóa camera hook tự động tạm dừng (`isPaused`), đảm bảo đồng nhất với `ExpansionRevealOverlay` và `expansionCamera`.
5. **Kiểm toán tác động tới test hiện có:**
   - Kiểm tra toàn bộ `__tests__/` cho thấy không có file test nào ngoài mục tiêu bị gãy. Bằng cách giữ thuộc tính `data-villager-id` và `data-villager-role` cùng `<VillagerSprite />`, toàn bộ assertion V2 trong `__tests__/ui/villagerMapUi.test.ts` vượt qua nguyên vẹn 100%, chỉ bổ sung thêm các test case V3 mới và tệp test mới `__tests__/core/villagerWander.test.ts`.
   - `fullBilingual.test.ts` (audit tĩnh EN/VI và thuộc tính trong `src/ui/**/*.tsx`): giữ nguyên `t('civ.map.villagerTooltip', { role })`, không thêm bất kỳ chuỗi hardcode nào.

---

## 2. Tóm tắt Triển khai Milestone Villager — V3

### 2.1. Pure Domain Engine (`src/core/civilization/villagerWander.ts`, re-export qua `index.ts`)
- **Thuần khiết & xác định 100%:** `0` lời gọi `Date.now()`, `0` lời gọi `Math.random()`, `0` I/O. Dùng băm FNV-1a 32-bit (`hashSeed`) + PRNG Mulberry32 (`createSeededRng`) theo `(villagerId, tick)`.
- **Điểm thu hút có trọng số (`getWanderAttractors`):**
  - Lửa trại (`stone_age_campfire`): trọng số cao nhất (**`10`**).
  - Nhà cửa & Kinh tế (`stone_age_elder_hut`, `stone_age_foraging_post`, `stone_age_food_cache`): trọng số trung bình (**`5`**).
  - Cửa Hang Thiền định (`stone_age_study_cave`) & Vật tổ (`stone_age_totem`): trọng số thấp (**`2`**).
  - Mọi điểm dừng chỉ lấy trên các ô đã mở liền kề bên ngoài footprint công trình (không bao giờ đè lên công trình); khi bản đồ chỉ có Hang (hoặc chưa có các công trình khác), mặc định tụ quanh cửa Hang.
- **Tìm đường & Tránh va chạm tuyệt đối (`stepWander`):**
  - BFS giới hạn độ sâu **`<= 12`** bước với thứ tự 4 hướng Bắc/Đông/Nam/Tây được trộn theo seed (tránh đi theo đường thẳng L cứng nhắc), tự động xen kẽ pha đi và pha đứng nghỉ (`waitTicks`, dừng lâu hơn một chút khi đứng cạnh Lửa trại).
  - Cơ chế đặt chỗ hai tập `reservedNextKeys` + `pendingCurrentKeys` bảo đảm tại **mọi tick**, không có hai dân làng nào cùng đứng chung 1 ô, không đi xuyên chéo đổi chỗ trực tiếp, không giẫm footprint công trình và không vào rừng chưa mở.
- **Sinh dân mới & Tái đồng bộ (`getSpawnCell`, `syncWanderStates`, `revalidateWanderStates`):**
  - Dân làng mới tuyển khi đang mở bản đồ xuất hiện ngay tại ô cửa Hang (`(cave.x + 1, cave.y + 3)` hoặc ô lân cận trống gần nhất qua `getSpawnCell`) với `waitTicks = 0` để tự bước ra ngoài mượt mà.
  - Nếu người chơi đặt công trình đè lên ô dân làng đang đứng hoặc mở rộng bản đồ, `revalidateWanderStates` tự động dời dân đó sang ô trống gần nhất mà không làm dịch chuyển/reset các dân làng khác.

### 2.2. Hook UI thuần bộ nhớ (`src/ui/components/civilization/useVillagerWander.ts`) & `MapGridView.tsx`
- **Không lưu storage / không đổi schema:** Vị trí chỉ nằm trong React state của popup; `CURRENT_SCHEMA_VERSION` giữ nguyên **`4`**; không thêm message mới; không thay đổi `GridMap` hay logic chặn xây công trình (công trình vẫn đặt được lên ô có dân, dân tự tránh ra ngay).
- **Nhịp cập nhật chung & Tiết kiệm tài nguyên:**
  - Dùng **1 `setInterval` duy nhất (~`700ms`)** cho toàn bộ dân làng đang hiển thị.
  - Tự dừng interval khi component unmount, khi tab/popup ẩn (`visibilitychange` & `document.hidden`), hoặc khi đang ở Expansion Mode / khóa camera (`isExpansionActive || cameraLocked`).
  - Khi `prefersReducedMotion()` bật: không tạo `setInterval`, bỏ CSS `transition`, giữ nguyên vị trí tĩnh `idle` như V2.
- **Hiển thị mượt trên `MapGridView.tsx`:**
  - Lớp `map-villagers-layer` đặt `absolute inset-0 z-[11] pointer-events-none`.
  - Mỗi dân làng có `data-testid="map-villager-<id>"`, `data-villager-id`, `data-villager-role`, `data-animation`, `data-cell="x,y"`, `transform: translate(${xPx}px, ${yPx}px)`, `transition: transform 700ms linear` (tắt khi reduced motion), `zIndex` theo hàng `y`, và dùng lại `<VillagerSprite scale={2} />`.

---

## 3. Kết quả Kiểm định Thực tế

> *Ghi chú phạm vi môi trường: Toàn bộ kiểm thử tự động chạy trong CLI headless (Node.js `tsx --test`, React SSR `renderToString`, Vite `vite build`, TypeScript `tsc --noEmit`). Chưa mở Chrome GUI để quan sát trực quan hiệu ứng chuyển động thực tế.*

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) | **PASS (Exit 0)** | **0** errors, **0** warnings |
| **Test Suite (Lượt 1/3)** | `npm test` (`tsx --test`) | **PASS (Exit 0)** | **658 / 658 PASS (0 fail)** — `30,688.14 ms` |
| **Test Suite (Lượt 2/3)** | `npm test` (`tsx --test`) | **PASS (Exit 0)** | **658 / 658 PASS (0 fail)** — `29,548.78 ms` |
| **Test Suite (Lượt 3/3)** | `npm test` (`tsx --test`) | **PASS (Exit 0)** | **658 / 658 PASS (0 fail)** — `29,890.16 ms` |
| **Production Build** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,761 modules transformed`, **`818ms`** |
| **Kiểm tra `dist/`** | Quét cây `dist/` & kích thước tệp | **SẠCH** | Tổng **`29`** tệp (`1,283,536 B`). Đủ `background.js` (`106,583 B`), `offscreen.js` (`3,878 B`), `popup-CqzM0lel.js` (`846,716 B`), `manifest.json` (`984 B`), spritesheet CC0 + villagers; `0` file audio |

---

## 4. Danh sách Tệp Tạo mới & Đã sửa

### Tạo mới (4 tệp)
- `respond_villager_v3_prev.md` *(sao lưu `respond.md` của V2 trước khi thực hiện V3)*
- `src/core/civilization/villagerWander.ts`
- `src/ui/components/civilization/useVillagerWander.ts`
- `__tests__/core/villagerWander.test.ts` *(7 tests: ánh xạ hướng + fallback `walk_up`, xác định 250 tick, 0 va chạm công trình/ô khóa/trùng dân qua 300 tick kể cả tọa độ âm, kiểm định thống kê trọng số Lửa trại qua 500 tick, fallback khi thiếu công trình, sinh tại cửa Hang & dời dân khi đặt công trình đè lên, kiểm tra tĩnh 0 `Date.now`/`Math.random`/storage & Schema v4)*

### Đã sửa (7 tệp)
- `src/core/civilization/index.ts` *(re-export `villagerWander.ts`)*
- `src/ui/components/civilization/MapGridView.tsx` *(nối `useVillagerWander`, `transform: translate`, `transition: transform 700ms linear`, `z-[11]` + `zIndex` theo hàng `y`, `pointer-events-none`, thuộc tính V3 + giữ `data-villager-id`)*
- `__tests__/ui/villagerMapUi.test.ts` *(giữ nguyên 100% assertion V2 + bổ sung kiểm định V3 SSR & reduced motion)*
- `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `README.md`, `PROJECT_STATUS.md` *(đồng bộ tài liệu & số liệu V3)*

---

## 5. Checklist Kiểm thử Thủ công trên Chrome Thật (`Load unpacked`)

> *Hướng dẫn dành cho người dùng khi kiểm thử trên Chrome thật (`>= 116`) với thư mục `dist/` vừa build:*

1. **Tải bản build mới:** Mở `chrome://extensions/`, bật **Developer mode**, bấm **Load unpacked** (hoặc nút Reload ↻ trên Focus Quest) trỏ tới thư mục `dist/`.
2. **Dân làng đi lại tự nhiên & tránh vật cản:**
   - Mở tab **Map** đã có *Meditation Cave* + từ `2` đến `4+` dân làng: quan sát dân làng xen kẽ đi lại mượt (`~700ms`/bước, hoạt ảnh bước chân `walk_left` / `walk_right` / `walk_down`) và dừng `idle`, không đi vào khu rừng tối chưa mở và không giẫm vào footprint công trình hay đứng đè lên nhau.
   - Rê chuột & bấm trực tiếp vào các công trình hoặc ô đặt công trình khi có dân đi ngang qua: xác nhận `pointer-events: none` không cản click vào công trình/bản đồ.
3. **Ưu tiên Lửa trại & công trình:**
   - Đặt thêm *Campfire* (`stone_age_campfire`) và/hoặc *Elder's Hut* / *Foraging Post*: quan sát sau vài chục giây dân làng có xu hướng tụ về các ô trống liền kề Lửa trại nhiều hơn các khu đất trống xa; khi gỡ bớt công trình, dân làng vẫn đi quanh cửa Hang bình thường.
4. **Tuyển dân mới tại cửa Hang & đặt công trình đè chỗ dân:**
   - Mở chi tiết Hang và bấm tuyển thêm 1 dân làng mới, đóng hoặc nhìn ngay nền bản đồ phía sau: xác nhận dân mới xuất hiện ngay tại cửa Hang rồi bước ra ngoài mà không làm dân đang đi bị nhảy vị trí.
   - Đặt 1 công trình lên đúng ô có dân làng đứng: xác nhận vẫn đặt được bình thường và dân làng đó tự dời sang ô trống lân cận.
5. **Tạm dừng & Reduced Motion & Không lưu tọa độ:**
   - Bấm **Expand** mở Expansion Mode: dân làng tạm dừng tại chỗ để không làm rối camera, thoát Expansion Mode thì tiếp tục đi vào cả ô đất mới mở.
   - Đóng popup rồi mở lại: dân làng khởi tạo sạch từ vị trí quanh cửa Hang (không có tọa độ nào ghi vào `chrome.storage.local`).
   - Bật tùy chọn **Reduce motion** trong OS/Chrome DevTools (`Emulate CSS media feature prefers-reduced-motion: reduce`): dân làng đứng tĩnh `idle` không trượt, 0 interval chạy ngầm.
6. **Bất biến Focus Session & Kinh tế:**
   - Bắt đầu và hoàn thành 1 phiên Focus ngắn: xác nhận Coins/XP và `CoinBonus` trên `Header` / `TimerView` hoàn toàn không bị tác động bởi việc dân làng đi lại.

---

DỪNG — CHỜ DUYỆT VILLAGER V3.
