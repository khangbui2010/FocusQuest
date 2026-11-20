# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-5.1

**Giai đoạn:** Milestone UX — Giai đoạn UX-5.1 *(Persistent Camera Expansion & Cinematic Recenter — KHÔNG thuộc Phase 5, 5B.5 hay Milestone LOFI)*  
**Ngày hoàn thành:** 2026-11-20  
**File sao lưu báo cáo cũ:** `/respond_ux51_prev.md` *(sao lưu nguyên vẹn báo cáo UX-6 trước khi ghi đè; giữ nguyên toàn bộ các bản `respond_*_prev.md` trước đó)*  
**Trạng thái:** **`614 / 614` tests PASS 3/3 lần** | **`npm run lint` (`tsc --noEmit`) PASS (`0` errors)** | **`npm run clean && npm run build` PASS (`1,217,229 B` / `26` tệp, `772ms`)** — **DỪNG CHỜ DUYỆT GIAI ĐOẠN UX-5.1**

---

## 1. HIỆN TRẠNG HỆ THỐNG CAMERA (TRƯỚC & SAU UX-5.1)

- **Trước UX-5.1 (`MapGridView.tsx` & `CivilizationHeader.tsx`):**
  - Khi bật **Expansion Mode**, `MapGridView` lưu snapshot `{ pan, zoom }` nhưng gọi ngay `computeExpansionFitZoom(mapWidthPx, mapHeightPx)` và ép `setPan({ x: 0, y: 0 })`, làm bản đồ tự động zoom out và dịch tâm về toàn bộ lãnh thổ.
  - Banner `expansion-mode-banner` trong `CivilizationHeader` nằm trong flow bình thường (`normal flow`), đẩy phần khung `<MapGridView>` co chiều cao theo chiều dọc khi vào/thoát Expansion Mode.
  - Chọn một chunk ứng viên mở ngay `LandExpansionModal` tại góc nhìn zoom-out thay vì trượt camera tới chunk đã chọn.
- **Sau UX-5.1 (Persistent Camera + Valid Expansion Preview + Cinematic Recenter):**
  - Vào Expansion Mode (`EXPANSION_SELECTING`) **giữ nguyên hoàn toàn** `pan`, `zoom` hiện tại và kích thước viewport (`expansion-mode-banner` đổi sang `absolute top-full inset-x-0 z-20`, không làm nhảy `0px` chiều cao `<MapGridView>`). Không còn lời gọi runtime nào tới `computeExpansionFitZoom` (chỉ giữ export để không gãy unit test số học UX-3/UX-5).
  - Các chunk ứng viên hợp lệ từ `gridMap.getAvailableExpansionSlots()` vẫn hiển thị highlight trên bản đồ hiện tại; chọn 1 chunk hợp lệ khóa mọi tương tác chọn khác và điều khiển camera thủ công, trượt camera mượt (`600ms`, `easeInOutCubic` qua `requestAnimationFrame`, giữ nguyên `zoom`) tới tâm chunk rồi mới mở `LandExpansionModal` xác nhận nghiệp vụ.
  - Xác nhận thành công chạy trọn vẹn rìu chém (`680ms`) & reveal/shake (`1150ms`) trong khi giữ camera bám chặt tâm chunk (kể cả khi mở về Tây/Bắc qua `useIsomorphicLayoutEffect`), rồi trượt mượt về `CameraSnapshot` ban đầu trước khi mở khóa về `NORMAL`. Hủy modal hoặc giao dịch lỗi cũng trả camera mượt về `EXPANSION_SELECTING` mà không kẹt lock và không sửa game state.

---

## 2. DANH SÁCH FILE ĐÃ THAY ĐỔI

1. **`src/ui/components/civilization/expansionCamera.ts`** *(Tạo mới — 198 dòng)*:
   - Định nghĩa state machine 6 trạng thái (`ExpansionFlowState`), bảng chuyển trạng thái hợp lệ `VALID_EXPANSION_TRANSITIONS`, `canTransitionExpansionFlow`, `transitionExpansionFlow`, và các guard (`isExpansionFlowActive`, `canSelectExpansionSlot`, `canCancelExpansionMode`, `isManualCameraLocked`, `isExpansionCandidatesVisible`).
   - Định nghĩa `CameraSnapshot`, `createCameraSnapshot`, `computeRestoredPanFromSnapshot` (bù dịch tâm world khi `renderBox` mở rộng 4 hướng), `computeChunkCenterPan`, `easeInOutCubic`, `interpolatePan`, `EXPANSION_CINEMATIC_MS = 600`.
2. **`src/ui/components/civilization/CivilizationHeader.tsx`** *(Cập nhật)*:
   - Bổ sung props tùy chọn tương thích ngược `isExpansionLocked?: boolean` và `canCancelExpansion?: boolean`; khóa các nút `Expand`, `Build`, `Cancel (Esc)` khi bị khóa.
   - Đổi `expansion-mode-banner` sang overlay `absolute top-full inset-x-0 z-20` dưới header `relative z-20` để kích thước `<MapGridView>` không đổi khi bật/tắt Expansion Mode.
3. **`src/ui/components/civilization/MapGridView.tsx`** *(Cập nhật)*:
   - Re-export `EXPANSION_CINEMATIC_MS`, `computeChunkCenterPan`, `easeInOutCubic`, `interpolatePan`; nhận `expansionFlowState`, `onCinematicArrived`, `onCameraReturnArrived`.
   - Lưu `CameraSnapshot` khi vào Expansion Mode mà không đổi `pan`/`zoom`; gỡ bỏ auto-fit zoom out runtime; gắn `ResizeObserver` theo dõi viewport; khóa drag, wheel, 4 nút toolbar camera (`Zoom Out`, `Reset`, `Zoom In`, `Recenter`) khi `isManualCameraLocked`; trượt `CINEMATIC_MOVING` và `CAMERA_RETURNING` qua `requestAnimationFrame` + `easeInOutCubic` (tôn trọng `prefersReducedMotion()`), đồng bộ bù `renderBox` trong `CHOPPING`/`TERRAIN_UPDATING` qua `useIsomorphicLayoutEffect`, dọn sạch RAF/timers/`ResizeObserver` khi unmount.
   - Đẩy nhãn Territory Summary sang `top-12` trong Expansion Mode để không bị banner overlay che khuất.
4. **`src/ui/components/civilization/CivilizationScreen.tsx`** *(Cập nhật)*:
   - Tích hợp state machine 6 trạng thái qua `updateFlowState` + các ref chống stale closure & race (`flowStateRef`, `isCinematicAnimatingRef`, `returnTargetRef`, `isConfirmInFlightRef`, `isMountedRef`).
   - Re-validate slot hợp lệ lúc click và trước khi gọi `expandLandClient`; bảo vệ `Esc` theo đúng state; xử lý hủy modal / lỗi API quay về `CAMERA_RETURNING -> EXPANSION_SELECTING` an toàn; dọn timers & `keydown` listener khi unmount.
5. **`__tests__/ui/civilizationView.test.ts`** *(Cập nhật dòng 334)*:
   - Cập nhật assertion cũ `!htmlExpand.includes('>100%<')` (vốn test hành vi auto zoom-out trước UX-5.1) sang `htmlExpand.includes('>100%<')`.
6. **`__tests__/ui/ux51ExpansionCamera.test.ts`** *(Tạo mới — 423 dòng, 5 tests)*:
   - Bộ kiểm thử toàn diện snapshot/bù tâm 4 hướng, toán học camera/easing, state machine 6 trạng thái, render SSR 6 trạng thái + giữ nguyên UX-5, lifecycle trước/sau commit & kiểm toán tĩnh nguồn.
7. **`PROJECT_STATUS.md`** & **`respond.md`** *(Cập nhật)*:
   - Ghi nhận trạng thái UX-5.1 và kết quả kiểm định sau chỉnh sửa.

---

## 3. STATE MACHINE MỚI (6 TRẠNG THÁI)

Định nghĩa tại `src/ui/components/civilization/expansionCamera.ts`:

```text
NORMAL
  └─[Bật Expansion Mode]──────────────────────────────► EXPANSION_SELECTING
EXPANSION_SELECTING
  ├─[Bấm Cancel / Esc]────────────────────────────────► CAMERA_RETURNING ──► NORMAL
  └─[Chọn 1 chunk hợp lệ (re-validated)]──────────────► CINEMATIC_MOVING
CINEMATIC_MOVING
  ├─[Trượt tới tâm chunk + Mở LandExpansionModal]
  │   ├─[Hủy modal / Esc / API error / hết slot]──────► CAMERA_RETURNING ──► EXPANSION_SELECTING
  │   └─[Xác nhận mở đất thành công (expandLandClient)]► CHOPPING (680ms)
CHOPPING
  └─[EXPANSION_IMPACT_MS = 680ms, lộ đất chunk mới]───► TERRAIN_UPDATING (tới 1150ms)
TERRAIN_UPDATING
  └─[Kết thúc reveal + shake]─────────────────────────► CAMERA_RETURNING ──► NORMAL
```

- **Quy tắc khóa từng trạng thái:**
  - `NORMAL`: Camera tự do, không hiển thị candidate.
  - `EXPANSION_SELECTING`: Camera pan/zoom tự do; hiển thị các candidate; được phép chọn 1 chunk hoặc Cancel/Esc.
  - `CINEMATIC_MOVING`: Khóa `pan`, `wheel`, 4 nút toolbar zoom/recenter, nút `Expand`, `Build`, `Cancel (Esc)`, và khóa chọn chunk khác (`slotDisabled = true`). Nếu animation chưa xong (`isCinematicAnimating`), `LandExpansionModal` chưa mở và `Esc` bị chặn; sau khi camera tới nơi, modal mở cho phép xác nhận hoặc hủy (`CAMERA_RETURNING -> EXPANSION_SELECTING`).
  - `CHOPPING` & `TERRAIN_UPDATING`: Ẩn overlay candidate, giữ khóa toàn bộ camera & Cancel, giữ nguyên tâm chunk giữa màn hình trong lúc rìu chém (`0–680ms`) → mở lộ đất & rung nhẹ (`680–1150ms`).
  - `CAMERA_RETURNING`: Khóa toàn bộ camera & Cancel trong suốt `600ms` trượt mượt về snapshot ban đầu rồi mới mở khóa sang `NORMAL` (sau mở đất/hủy chế độ) hoặc `EXPANSION_SELECTING` (sau hủy modal/lỗi API).

---

## 4. CƠ CHẾ SNAPSHOT CAMERA & BÙ ĐỘ DỊCH TÂM WORLD

1. **Chụp snapshot lúc vào `EXPANSION_SELECTING` (`createCameraSnapshot`):**
   - Lưu nguyên trạng `pan: { x: Math.round(pan.x), y: Math.round(pan.y) }`, `zoom`, `viewport: { width, height }` (cập nhật qua `ResizeObserver`), và tọa độ tâm world của stage lúc chụp:
     $$\text{stageCenterWorldX} = \text{renderBox.minX} + \frac{\text{renderBox.width}}{2}, \quad \text{stageCenterWorldY} = \text{renderBox.minY} + \frac{\text{renderBox.height}}{2}$$
   - Lúc vào `EXPANSION_SELECTING`, hoàn toàn không ghi đè `pan`, `zoom`, hay kích thước khung map.
2. **Định tâm chunk đang chọn (`computeChunkCenterPan`):**
   - Tính tâm chunk $4 \times 4$ theo pixel tại `zoom = 1` rồi dịch `pan` để đưa tâm chunk vào chính giữa viewport trong khi **giữ nguyên `zoom`**:
     $$\text{pan}_x = \text{round}\!\left(-\left((\text{origin}_x + 2 - \text{renderMinX}) \cdot 32 - \frac{\text{mapWidthPx}}{2}\right) \cdot \text{zoom}\right)$$
   - Trong lúc `CHOPPING` / `TERRAIN_UPDATING`, `useIsomorphicLayoutEffect` tính lại `computeChunkCenterPan` ngay trước paint nếu `renderBox` vừa nở ra (đặc biệt khi mở chunk Tây `(-4, 0)` hay Bắc `(0, -4)`), tránh mọi nháy khung 1 frame.
3. **Khôi phục snapshot sau mở đất (`computeRestoredPanFromSnapshot`):**
   - Vì stage luôn căn giữa qua CSS Flex (`flex items-center justify-center` + `transformOrigin: center center`), khi thêm chunk về Tây hoặc Bắc làm tâm `renderBox` dịch đi $(\Delta \text{center}_x, \Delta \text{center}_y)$, hàm khôi phục tự động bù đúng lượng dịch của stage:
     $$\text{restoredPan}_x = \text{round}(\text{snapshot.pan}_x + \Delta \text{center}_x \cdot 32 \cdot \text{snapshot.zoom})$$
   - Công thức được `ux51ExpansionCamera.test.ts` chứng minh giữ điểm world dưới tâm màn hình khớp trước và sau mở rộng ở cả 4 hướng Đông/Tây/Nam/Bắc trên các mức zoom `0.75, 1.0, 1.25, 1.5` (sai số `< 0.05` cell, chỉ do làm tròn pixel nguyên).

---

## 5. KẾT QUẢ TEST TỰ ĐỘNG, LINT & BUILD

- **`npm run lint` (`tsc --noEmit`):** **PASS** (Exit code `0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (Exit code `0`, Vite `v8.3.8`, `1,755 modules transformed`, **`772ms`**, `dist/`: **`26` tệp**, **`1,217,229 B`**, `0` file audio).
- **`npm test` (`tsx --test`) — 3 lần chạy liên tiếp sau mọi chỉnh sửa:**
  - **Lần 1:** **`614 / 614` PASS** (`0` fail, `0` skipped, `0` cancelled, **`18,190.25 ms`**)
  - **Lần 2:** **`614 / 614` PASS** (`0` fail, `0` skipped, `0` cancelled, **`18,323.81 ms`**)
  - **Lần 3:** **`614 / 614` PASS** (`0` fail, `0` skipped, `0` cancelled, **`18,748.25 ms`**)
  - Gồm `+5` tests mới tại `__tests__/ui/ux51ExpansionCamera.test.ts` và cập nhật assertion UX-5.1 tại `__tests__/ui/civilizationView.test.ts:334`. Toàn bộ chạy trên Node.js (`renderToString` SSR, tính toán thuần, mock 2D context & mock storage adapters).

---

## 6. KẾT QUẢ CHROME VERIFICATION (TRUNG THỰC TUYỆT ĐỐI)

- **Chưa kiểm chứng trực quan trên trình duyệt Chrome thật đối với UX-5.1** vì môi trường thực thi hiện tại chỉ có Node.js headless CLI (không có Chrome GUI / DevTools runtime).
- Không có bất kỳ kết quả giả lập PASS nào cho animation RAF thực tế trên popup Chrome `400×600`, thao tác kéo chuột/scroll wheel thật, hoặc kiểm tra thị giác 60fps.
- Toàn bộ hành vi DOM/RAF/ResizeObserver thực tế trên Chrome thật cần được nghiệm thu trực tiếp bằng bộ build mới tại `dist/` theo checklist ở Mục 9.

---

## 7. CÁC KỊCH BẢN LIFECYCLE ĐÃ TEST (TỰ ĐỘNG TRÊN NODE / COORDINATOR / SSR)

Đã xác minh qua `__tests__/ui/ux51ExpansionCamera.test.ts`:
1. **Snapshot & Bù tâm 4 hướng:** Chụp snapshot tại nhiều mức zoom (`0.75..1.5`) và pan lệch tâm (`{48, -32}`), hủy không mở đất (khôi phục đúng `initialPan`), và mở đất cả 4 hướng Đông `(8,0)`, Tây `(-4,0)`, Bắc `(0,-4)`, Nam `(0,8)` đều bù đúng độ lệch stage (world drift `< 0.05` cell).
2. **Toán học Cinematic Pan & Easing:** `computeChunkCenterPan` đưa tâm chunk `4×4` về đúng tâm màn hình (lệch `<= 1px` do làm tròn nguyên) tại mọi mức zoom `0.75/1.0/1.5` & 4 hướng; `easeInOutCubic` & `interpolatePan` biên `0..1` chính xác.
3. **State Machine 6 trạng thái & Khóa giao diện:** Cho phép đúng luồng chuẩn và luồng hủy modal/chế độ; từ chối nhảy cóc bất hợp lệ (`NORMAL -> CHOPPING`, `EXPANSION_SELECTING -> TERRAIN_UPDATING`, v.v.); SSR chứng minh `CivilizationHeader` disable cả 3 nút `Expand`, `Build`, `Cancel (Esc)` và `MapGridView` disable cả 4 nút toolbar camera (`Zoom Out`, `Reset`, `Zoom In`, `Recenter`) trong các pha khóa.
4. **Hủy trước commit & Restart giữa reveal:**
   - Hủy modal hoặc đóng popup trước commit (`CINEMATIC_MOVING`) giữ nguyên `4` chunks và `200` Coins.
   - Sau commit thực tế qua `CivilizationCoordinator.expandLand({ origin: { x: 8, y: 0 } })` (`5` chunks, `140` Coins), thao tác đóng/mở lại dữ liệu không mất hay rollback chunk đã mua; gọi trùng transaction trên cùng origin bị từ chối sạch và giữ nguyên `140` Coins.
5. **Kiểm toán tĩnh tài nguyên & cấm auto-fit:** Xác nhận runtime `MapGridView` gọi `computeExpansionFitZoom(` **`0` lần**; có đủ `observer.disconnect()`, `cancelAnimationFrame(`, `clearRevealTimers()`, `window.removeEventListener('keydown'`, `isConfirmInFlightRef` và `isMountedRef`.

---

## 8. XÁC NHẬN KHÔNG LÀM HỎNG UX-5 & LÕI NGHIỆP VỤ

- **Giữ nguyên 100% lớp render UX-5:** Không chỉnh sửa `TerrainBitmapCanvas.tsx`, `terrainBitmapRenderer.ts`, `terrainDecor.ts`, `TileImage.tsx`, `spriteRegistry.ts`, `SpriteGallery.tsx`. SSR tại `__tests__/ui/ux51ExpansionCamera.test.ts` xác nhận `data-testid="map-terrain-bitmap"` giữ nguyên và vùng lưới `map-interaction-grid` vẫn dùng `0` thẻ `<img>` cho địa hình trong suốt tất cả các trạng thái UX-5.1.
- **Giữ nguyên 100% lõi nghiệp vụ & schema:** Không sửa `GridMap`, `PlacementValidator`, `landExpansion.ts`, `economy`, `SessionCoordinator`, `QuestCoordinator` hay `StorageSchema`; toàn bộ 614 tests cũ + mới (gồm `ux3MapAndForestUi.test.ts`, `ux5TerrainBitmap.test.ts`, `expansionReveal.test.ts`, `terrainDecor.test.ts`) đều PASS 3/3 lần.

---

## 9. CÁC ĐIỂM CÒN TỒN TẠI / CHECKLIST NGHIỆM THU TRÊN CHROME THẬT

- **Tồn tại kỹ thuật đã biết (không mới từ UX-5.1):**
  - Chưa test tự động được vòng đời RAF frame-by-frame / mouse drag / wheel thực trong DOM trình duyệt (do bộ test repo chạy Node SSR `renderToString`, không cài `jsdom`/Playwright).
  - Các mục hậu UX-5 khác đã code xong nhưng vẫn chờ duyệt thực tế cùng đợt: giao diện canvas UX-5 trên các màn hình DPR thật (`100%`/`125%`/`150%`), Stage 5c, Stage 2b SW, Stage 6+7, UX-6 Sleep/Wake.
- **Checklist nghiệm thu thủ công UX-5.1 trên Chrome thật (`chrome://extensions` → Reload `dist/`):**
  1. Trên tab **Map**, kéo pan lệch khỏi tâm và zoom tới một mức khác `100%` (ví dụ `125%` hoặc `75%`).
  2. Bấm **Expand**: xác nhận **không** tự zoom out, **không** giật/dịch vị trí camera, khung map **không** bị đẩy co chiều cao bởi banner overlay, các chunk hợp lệ sáng lên đúng vị trí.
  3. Bấm chọn một chunk hợp lệ ở mép (thử cả chunk **Tây `(-4,0)`** hoặc **Bắc `(0,-4)`** lẫn **Đông `(8,0)`**): xác nhận không thể pan/zoom/bấm nút toolbar/bấm Cancel (Esc)/chọn chunk khác; camera trượt mượt trong ~`600ms` về tâm chunk đó (giữ nguyên mức zoom), rồi mới mở **LandExpansionModal**.
  4. Thử bấm **Cancel** trên modal (hoặc phím `Esc`): xác nhận modal đóng, không trừ Coins/không mở đất, camera trượt mượt trở lại vị trí & mức zoom ban đầu ở chế độ **EXPANSION_SELECTING**.
  5. Chọn lại chunk hợp lệ → bấm **Confirm Expansion**: xác nhận camera giữ yên tại tâm chunk suốt cảnh rìu chém (`680ms`), cảnh đất lộ + rung nhẹ (`680–1150ms`) mà **không bị nhảy khung 1 frame**, sau đó trượt mượt về đúng góc nhìn & mức zoom lúc trước khi bật Expand rồi mở khóa về chế độ bình thường.
  6. Bật `chrome://flags` hoặc OS **Reduced Motion** (tùy chọn): xác nhận không animation kéo dài mà chuyển vị trí dứt khoát và vẫn trả camera bình thường.

---

**DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU TRÊN CHROME THẬT VÀ DUYỆT GIAI ĐOẠN UX-5.1.**
