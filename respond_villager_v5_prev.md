# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER V4
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-22  
**Trạng thái:** **HOÀN TẤT — 664/664 TESTS PASS (3/3 LƯỢT) | BUILD PASS | LINT PASS (Chờ nghiệm thu trên Chrome thật & duyệt)**  

> **Sao lưu báo cáo cũ:** Bản báo cáo V3 trước đó đã được sao lưu nguyên vẹn tại `respond_villager_v4_prev.md` (giữ nguyên toàn bộ các tệp `respond_*_prev.md` khác).

---

## 1. Chặng 0 — Kết quả Kiểm toán (Audit trước khi sửa mã)

1. **Kích thước sân khấu `FocusSceneArea.tsx` & Bố cục Slot:**
   - Outer box dùng `min-h-[160px]` kèm `<svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full block pointer-events-none">`.
   - Vùng `focus-scene-stage` (`h-[120px]`) chứa sân khấu cố định **`w-[336px] h-[120px]`** ở đáy màn cảnh. Hai cụm cây biên khi có trại nằm tại `6..52px` (trái) và `298..326px` (phải); dải công trình & đường đi ngang nằm gọn trong `46..268px`, đảm bảo 6 slot công trình Đồ Đá không chồng lấn theo trục ngang và giữ đúng độ sâu `zIndex`.
2. **Dữ liệu & kích thước `STONE_AGE_SPRITE_DATA` (`spriteData.ts`):**
   - `stone_age_study_cave` (`48×48` — giữ nguyên `48×48`), `stone_age_elder_hut` (`32×32` -> render `36×36`), `stone_age_totem` (`16×16` -> `20×20`), `stone_age_campfire` (`16×16` -> `32×32`), `stone_age_foraging_post` (`32×32` -> `36×36`), `stone_age_food_cache` (`32×48` -> giữ tỉ lệ `2:3` `32×48`).
3. **Luồng truyền `civilizationState` không thêm Message mới:**
   - `App.tsx` đã gọi `getCivilizationStateClient()` (`GET_CIVILIZATION_STATE`) sẵn trong `refreshState()`. Lưu thêm `civState` ở `App.tsx` và truyền xuống `PopupShell -> TimerView -> FocusSceneArea` (**0 extension message mới**).
   - Trong `TimerView.tsx`, khi chạy standalone với `propBonusRate === undefined`, effect sẵn có đã gọi `getCivilizationStateClient()`, nên cập nhật luôn `internalCivState` tại đúng nhánh đó mà không gọi trùng IPC.
4. **Danh sách Assertion cũ bị ảnh hưởng (đã liệt kê & cập nhật tối thiểu):**
   - `__tests__/ui/focusSceneArea.test.ts`: test 4b cũ giả định luôn render `STONE_AGE_VILLAGER_SPRITES`, `scene-villager-elder/crafter/woodworker` dùng Tiny Dungeon tile `#100/#88/#86`, `scene-shelter` và `scene-campfire` ngay cả khi không truyền `civilizationState`. Đã viết lại cho V4 (kiểm cả trại trống có `scene-empty-hint` EN/VI lẫn trại có công trình/dân làng dùng `<VillagerSprite />`).
   - `__tests__/ui/focusRunningView.test.ts:227–250`: gọi `<FocusSceneArea />` không có `civilizationState` và assert `tilemap_packed.png` + `fq-scene-villager-work`. Đã truyền `civilizationState` mẫu (`campfire + crafter`) và kiểm tra `villagers/crafter.png`, `tilemap_packed.png` (tool) & `fq-villager-anim-`.
   - `__tests__/ui/focusRunningFixes5b3.test.ts:275–298`: vòng lặp 3 trạng thái `working/paused/resting` kiểm tra Tiny Dungeon trên cả `paused`/`resting` khi `civilizationState` rỗng. Đã truyền `civilizationState` mẫu (`campfire + crafter`) và kiểm tra `villagers/crafter.png` giữ nguyên toàn bộ kiểm tra SVG `L360 220 L0 220 Z`.
   - `__tests__/ui/villagerMapUi.test.ts:208–226`: test V2 kiểm tra Cave `48×48` qua `scene-shelter` không truyền `civilizationState`. Đã truyền `[cave]` vào `civilizationState` và kiểm tra `data-testid="scene-building-stone_age_study_cave"` kích thước `48×48`.
   - **Kiểm tra i18n tĩnh (`fullBilingual.test.ts`):** giữ `563` khóa EN/VI khớp 100% parity (`timer.scene.ariaEmpty` và `timer.scene.emptyHint`), `0` chuỗi JSX/thuộc tính hardcode trong `src/ui/`.

---

## 2. Tóm tắt Triển khai Milestone Villager — V4

### 2.1. Pure Scene Model (`src/ui/utils/focusSceneModel.ts`)
- **Thuần khiết & xác định 100%:** `0` wall-clock (`Date.now`), `0` `Math.random`, `0` I/O; phòng thủ an toàn với `null` / `undefined` / mảng lỗi.
- **Khử trùng lặp công trình & Slot cố định (`SCENE_BUILDING_SLOTS`):**
  - Mỗi `definitionId` đã xây chỉ xuất hiện tối đa **`1` sprite** kể cả khi đặt nhiều cái trên Map (công trình chưa xây hoàn toàn không xuất hiện).
  - Các band X trên sân khấu `336×120` tách rời nhau (`cave` `46..94`, `elder_hut` `96..132`, `totem` `133..153`, `campfire` `154..186`, `foraging_post` `190..226`, `food_cache` `232..264`), sắp theo `zIndex`.
- **Dân làng (`MAX_SCENE_VILLAGERS = 6`):**
  - Sắp xếp ổn định theo `(recruitedAt, id)` không mutate mảng gốc, cắt tối đa **6 dân làng** trên cảnh Focus.
  - **`getSceneVillagerRoute(villager, model, sceneState, tick)`:**
    - `working`: dân ở gần công trình phù hợp vai trò (`elder -> Elder's Hut/Totem/Cave`, `crafter -> Campfire/Foraging Post/Cave`, `woodworker -> Foraging Post/Granary/Campfire`) và tuần tra đi bộ xen kẽ dừng làm việc; **chỉ `crafter` cầm búa `#117` và `woodworker` cầm rìu `#119` khi `working` và đang đứng yên** (`!isMoving`).
    - `paused`: đứng yên tĩnh `idle`, mờ nhẹ (`opacity-80`), ẩn toàn bộ công cụ/tia lửa/`zZ`.
    - `resting`: kéo nhau tụ về quanh *Campfire* (hoặc trước cửa *Meditation Cave* nếu chưa có Lửa trại), và **chỉ `elder` mới hiện `zZ`**.

### 2.2. UI Integration (`FocusSceneArea.tsx`, `TimerView.tsx`, `App.tsx`, `index.css`)
- **Trại trống (`isEmpty`):** Chỉ giữ bầu trời sáng/hoàng hôn, mặt trời, mây, đồi và bãi đất trống (ẩn cây biên, đạo cụ, công trình, Lửa trại, dân làng, tia lửa) kèm gợi ý nhỏ song ngữ `data-testid="scene-empty-hint"`.
- **Hiệu năng & Reduced Motion:** Chỉ dùng **1 `setInterval(..., 1200ms)` duy nhất** cho cả sân khấu, tự dừng khi `document.hidden`, `isPaused`, `reducedMotion`, không có dân làng hoặc unmount; đồng bộ CSS `.fq-scene-villager-mover` trong `@media (prefers-reduced-motion: reduce)` (`src/index.css`) để tắt mọi animation & transition.
- **Không đổi bất biến lõi:** Không ghi storage (`CURRENT_SCHEMA_VERSION = 4`), không thêm message mới, không đổi công thức kinh tế/CoinBonus/XP/Quests/MapGridView/Awards.

---

## 3. Kết quả Kiểm định Thực tế

> *Ghi chú phạm vi môi trường: Toàn bộ kiểm thử tự động chạy trong CLI headless (Node.js `tsx --test`, React SSR `renderToString`, Vite `vite build`, TypeScript `tsc --noEmit`). Chưa mở Chrome GUI để quan sát trực quan hiệu ứng chuyển động thực tế trong popup.*

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) | **PASS (Exit 0)** | **0** errors, **0** warnings |
| **Test Suite (3 lượt liên tiếp)** | `npm test` (`tsx --test`) | **PASS 3/3 (Exit 0)** | **664 / 664 PASS (0 fail)** cả 3 lượt (`---RUN_1_OK---`, `---RUN_2_OK---`, `---RUN_3_OK---`; Lượt 3: `32,173.71 ms`) |
| **Production Build** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,762 modules transformed`, **`1.02s`** |
| **Kiểm tra `dist/` & Audio** | Quét cây `dist/` & `.mp3/.ogg/.wav` | **SẠCH** | Tổng **`29`** tệp (**`1,290,227 B`**): `background.js` (`106,583 B`), `offscreen.js` (`3,878 B`), `popup-BpBf0sIr.js` (`852,364 B`), `popup-CBvv-PFs.css` (`95,646 B`), `manifest.json` (`984 B`), đủ sprite CC0 + villagers; **`0`** file audio |
| **i18n EN/VI Parity** | Kiểm tra từ điển + `fullBilingual.test.ts` | **PASS** | **`563` / `563` khóa khớp 100%**, `0` chuỗi/thuộc tính hardcode trong `src/ui/` |

---

## 4. Danh sách Tệp Tạo mới & Đã sửa

### Tạo mới (3 tệp)
- `respond_villager_v4_prev.md` *(sao lưu `respond.md` của V3 trước khi thực hiện V4)*
- `src/ui/utils/focusSceneModel.ts` *(pure model: `buildFocusSceneModel`, `SCENE_BUILDING_SLOTS`, `getSceneVillagerRoute`)*
- `__tests__/ui/focusSceneModel.test.ts` *(5 tests thuần kiểm chứng null/malformed guard, khử trùng lặp + không chồng lấp 6 công trình, trần 6 dân làng & bất biến không mutate input, `working`/`paused`/`resting` + tool/zZ/fallback, và 0 `Math.random`/`Date.now`)*

### Đã sửa (12 tệp)
- `src/ui/components/FocusSceneArea.tsx` *(render động công trình + `<VillagerSprite />` + `scene-empty-hint`, 1 interval 1200ms dùng chung)*
- `src/ui/components/TimerView.tsx` *(nhận & truyền `civilizationState` xuống `FocusSceneArea`, fallback tái sử dụng lần gọi `getCivilizationStateClient()` sẵn có)*
- `src/App.tsx` *(lưu `civState` từ `refreshState()` -> `PopupShell` -> `TimerView`, 0 message mới)*
- `src/index.css` *(bổ sung `.fq-scene-villager-mover` vào `@media (prefers-reduced-motion: reduce)`)*
- `src/i18n/locales/en.ts` & `src/i18n/locales/vi.ts` *(thêm `timer.scene.ariaEmpty` và `timer.scene.emptyHint`)*
- `__tests__/ui/focusSceneArea.test.ts` *(viết lại test V4 cho empty camp, populated camp, 1 sprite/loại, tối đa 6 dân, campfire-only sparks, elder-only zZ, EN/VI, reducedMotion)*
- `__tests__/ui/focusRunningView.test.ts`, `__tests__/ui/focusRunningFixes5b3.test.ts`, `__tests__/ui/villagerMapUi.test.ts` *(cập nhật tối thiểu các assertion cũ liệt kê ở Chặng 0)*
- `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md` *(đồng bộ đặc tả & số liệu V4)*

---

## 5. Checklist Kiểm thử Thủ công trên Chrome Thật (`Load unpacked`)

> *Hướng dẫn dành cho người dùng khi kiểm thử trên Chrome thật (`>= 116`) với thư mục `dist/` vừa build:*

1. **Tải bản build mới:** Mở `chrome://extensions/`, bật **Developer mode**, bấm **Load unpacked** (hoặc nút Reload ↻ trên Focus Quest) trỏ tới thư mục `dist/`.
2. **Trại hoàn toàn trống (`0` công trình, `0` dân làng):**
   - Trên profile mới / bản đồ chưa xây công trình nào, mở tab **Focus** và bắt đầu một phiên tập trung ngắn: xác nhận khung `FocusSceneArea` chỉ hiện bầu trời, mặt trời, mây, đồi, bãi đất trống và dòng gợi ý nhỏ `"Build structures on the Map tab..."` / `"Xây công trình ở tab Bản đồ..."` — **không có Lửa trại, Hang hay dân làng**.
3. **Chỉ xây từng phần công trình (ví dụ 2 *Foraging Post*, chưa xây *Campfire* hoặc *Cave*):**
   - Quay về Map xây 2 *Foraging Post*, chạy lại Focus: xác nhận cảnh Focus chỉ hiện **đúng 1 sprite *Foraging Post***, không có Lửa trại hay tia lửa và không có Hang.
4. **Xây *Campfire*, *Cave* & tuyển dân làng (`working` / `paused` / `resting`):**
   - Xây thêm *Campfire* + *Meditation Cave*, tuyển đủ `elder`, `crafter`, `woodworker` (thử tuyển > 6 dân nếu nâng Cave Lv. 4–5):
   - **`working`:** tối đa 6 dân làng hiện diện & đi qua đi lại tự nhiên (`walk_left`/`walk_right`/`idle`), khi đứng yên `crafter` cầm búa và `woodworker` cầm rìu, *Campfire* có ngọn lửa và tia lửa bay lên.
   - **Bấm `Pause`:** dân làng đứng yên (`idle`), hơi mờ đi, ngừng chuyển động, không tia lửa và không cầm công cụ.
   - **Vào Break (`resting` trong Pomodoro):** bầu trời chuyển hoàng hôn ấm, dân làng tụ quanh *Campfire* (hoặc quanh Hang nếu chưa có *Campfire*), và chỉ **`elder`** hiện `zZ`.
5. **Reduced Motion, Tiết kiệm tài nguyên & Không chạm Storage:**
   - Thu nhỏ/ẩn tab popup rồi quay lại: chuyển động đồng bộ sạch, không lag. Bật **Reduce motion** trong Chrome DevTools: dân làng đứng yên tại vị trí `idle`, không trượt `transition`.

---

DỪNG — CHỜ DUYỆT VILLAGER V4.
