# FOCUS QUEST — BÁO CÁO HOÀN TẤT MILESTONE 5B.4.3C (CIVILIZATION-FIRST UI & PACKAGING HARDENING)

**Ngày hoàn tất:** 14/11/2026  
**Trạng thái:** **FULL PASS — Milestone 5B.4.3C Hoàn thành (382/382 Tests PASS | Build PASS | Lint 0 lỗi)**

---

## 1. TỔNG QUAN THỰC HIỆN (GIAI ĐOẠN 3–8)

Đã hoàn tất toàn bộ phần **Civilization-First UI** (Giai đoạn 3–7) và nghiệm thu tổng thể (Giai đoạn 8) nối tiếp phần Packaging Hardening đã hoàn thành ở Giai đoạn 1–2:
- **Giai đoạn 3–5:** Xây dựng đầy đủ 6 UI components trong `src/ui/components/civilization/`, tích hợp vào tab `Civ` của `src/App.tsx`, và đồng bộ logic simulator trong `src/ui/services/extensionClient.ts`.
- **Giai đoạn 6 (Đóng F-10):** Khôi phục `__tests__/ui/civilizationView.test.ts` vào `tsconfig.json` và `package.json`, giữ nguyên 100% assertions gốc của test suite.
- **Giai đoạn 7–8:** Kiểm chứng tính nhất quán Preview / Live Extension trong khung popup 400×600px, chạy clean production build (`dist/background.js` 76.96 kB), cập nhật `PROJECT_STATUS.md` và lập báo cáo nghiệm thu.
- **Bảo lưu lịch sử:** Giữ nguyên vẹn `respond_plan_5B.4.3C.md`, `respond_5B.4.3C_report.md`, và `respond_docs_sync_report.md`.

---

## 2. KIẾN TRÚC 6 COMPONENTS CIVILIZATION UI ĐÃ TRIỂN KHAI

1. **`src/ui/components/civilization/CivilizationHeader.tsx`**
   - Hiển thị Era (`Stone Age`), số dư Focus Coins, `lifetimeFocusMinutes` (`Xm`), badge `CoinBonus` (`+X%`), nút `Expand` và `Build`.
   - Khi ở chế độ đặt công trình (`isPlacementMode`), hiển thị banner `Placing ...` và nút `Cancel (Esc)`.
2. **`src/ui/components/civilization/BuildingCatalogPanel.tsx`**
   - Bottom-sheet catalog hỗ trợ bộ lọc `All`, `Decor`, `Focus Support`, `Economy`.
   - Thực thi cổng mở khóa theo Player Level (`Lv. 2`), Lifetime Focus (`100m Focus`), Era và số dư Coins.
3. **`src/ui/components/civilization/BuildingDetailsModal.tsx`**
   - Hiển thị thông tin chi tiết công trình, tọa độ neo `(x, y)`, footprint, active effect (ghi rõ zero passive income; `CoinBonus` chỉ áp dụng cho Coins).
   - Nút nâng cấp giữ ở trạng thái disabled với nhãn **`Milestone 5C`** (không làm upgrade giả).
   - Thao tác `Demolish Building` có bước xác nhận `Confirm Demolish`.
4. **`src/ui/components/civilization/LandExpansionModal.tsx`**
   - Hiển thị thống kê lãnh thổ (`X Chunks · Y cells`) và la bàn mở rộng trực giao 4 hướng: `North`, `East`, `West`, `South`.
5. **`src/ui/components/civilization/MapGridView.tsx`**
   - Tính bounding box động từ các chunks (hỗ trợ tọa độ âm khi mở rộng hướng North/West).
   - Pan bằng kéo chuột với ngưỡng 4px (`DRAG_THRESHOLD_PX`), zoom `0.6×–2.0×` bằng wheel và thanh điều khiển nổi (`-`, `100%`, `+`, `Recenter`) có `e.stopPropagation()`.
   - Hover preview thời gian thực theo `GridMap.canPlaceBuilding()` với trạng thái xanh hợp lệ (`✓ Place`) hoặc đỏ (`✕ Cell occupied` / `✕ Outside territory`).
6. **`src/ui/components/civilization/CivilizationScreen.tsx`**
   - Nạp đồng thời `CivilizationState` và `GET_SESSION_STATE` từ background/bridge, đồng bộ qua `onStorageChange`, thông báo `onStateMutated` để cập nhật header Coins ngay trong Preview.
   - Lắng nghe phím `Escape` để đóng modal/catalog hoặc thoát placement mode; khóa double-submit với `isSubmitting`; hiển thị banner lỗi khi giao dịch bị từ chối.

---

## 3. TÍCH HỢP POPUP & ĐỒNG BỘ PREVIEW / EXTENSION PARITY

- **`src/App.tsx`:** Thay thế placeholder tab `Civ` bằng `<CivilizationScreen lifetimeFocusMinutes={lifetimeFocusMinutes} onStateMutated={refreshState} />`. Lưu `lifetimeFocusMinutes` từ `GET_SESSION_STATE` và thiết lập `min-h-0 overflow-hidden` cho `<main>` khi ở tab `civilization` để canvas bản đồ khớp hoàn toàn trong popup `400px × 580–600px` không gây tràn cuộn ngoài.
- **`src/ui/services/extensionClient.ts`:** Bổ sung kiểm tra `minTotalFocusMinutes` và `isEraUnlocked` trong `PLACE_BUILDING`, đồng bộ tăng `mockState.lifetimeFocusMinutes` trong `FINISH_STOPWATCH`, và bổ sung handler `GET_ECONOMY` để Preview parity 1:1 với `CivilizationCoordinator`.
- **Parity Live Extension:** `isChromeExtension()` trả về UI popup 400px thuần túy không rò rỉ khung demo; phiên Focus đang chạy được giữ nguyên ổn định khi chuyển tab giữa `Quest` và `Civ`.

---

## 4. KHẮC PHỤC FINDINGS & LỖI PHÁT SINH TRONG QUÁ TRÌNH TRIỂN KHAI

- **Tất cả 4 Findings (F-08 → F-11) đã đóng hoàn toàn:**
  - `F-08`: `dist/background.js` build thành công (76.96 kB).
  - `F-09`: Package name thống nhất là `"focus-quest"`.
  - `F-10`: Đã gỡ exclude trong `tsconfig.json` và thêm `__tests__/ui/civilizationView.test.ts` vào script `test` của `package.json`.
  - `F-11`: Đã thay `__dirname` bằng `import.meta.dirname` trong `vite.config.ts`.
- **Lỗi phát hiện & đã sửa trong quá trình kiểm thử UI:**
  1. *Drag-state leak trên building card (`MapGridView.tsx`):* Reset `hasMovedRef.current = false` trong `onMouseDown` của thẻ công trình trước `stopPropagation()` để click chọn công trình sau khi kéo bản đồ hoạt động ổn định.
  2. *React 19 SSR comment separators (`<!-- -->`):* Các chuỗi JSX ghép như `{lifetimeFocusMinutes}m` hay `{zoomPercent}%` bị `renderToString` chèn `<!-- -->` làm lệch kiểm tra chuỗi trong 4 assertions của `civilizationView.test.ts`. Đã chuẩn hóa thành template string đơn (`{`${...}`}`) trong `CivilizationHeader.tsx`, `BuildingDetailsModal.tsx`, `LandExpansionModal.tsx` và `MapGridView.tsx` mà không sửa bất kỳ assertion nào của test.

---

## 5. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED RESULTS)

1. **`npm run lint` (`tsc --noEmit` / `lint_applet`):**
   - **PASS** — **0 errors, 0 warnings**.
2. **`npm test`:**
   - **PASS** — **382 / 382 tests PASS (100%)**, 0 fail, 0 skipped, 0 todo (~16.22s).
   - Bao gồm đầy đủ 371 tests nền tảng + **11 / 11 tests UI Civilization** trong `__tests__/ui/civilizationView.test.ts`.
3. **`npm run clean && npm run build` & `compile_applet`:**
   - **PASS** (Vite build trong 931ms, không có cảnh báo `__dirname`).
   - Artifacts trong `dist/`:
     - `dist/background.js` (`76.96 kB`, gzip `16.69 kB`)
     - `dist/index.html` (`0.94 kB`, gzip `0.43 kB`)
     - `dist/manifest.json` (`1,007 bytes`)
     - `dist/blocked.html` (`1,537 bytes`)
     - `dist/icons/` (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, `icon.svg`)
     - `dist/assets/` (`popup-DHFcy1Wj.css`, `popup-DsSjaWr9.js`, `domainNormalizer-zgpTEtXf.js`)

---

## 6. XÁC NHẬN TUÂN THỦ PHẠM VI & NGUYÊN TẮC SẢN PHẨM

- **Zero Passive Income:** Tuyệt đối không sinh Coins/XP thụ động theo thời gian.
- **CoinBonus độc lập XP:** `CoinBonus` chỉ hiển thị và cộng dồn cho Coins của phiên Focus hoàn thành; XP giữ nguyên độc lập.
- **Ranh giới Milestone 5C:** Chưa triển khai `UPGRADE_BUILDING`, chuyển Era sang Bronze Age hay Bronze Age Catalog; nút Upgrade khóa rõ ràng ở `"Milestone 5C"`.
- **Ranh giới UI/Background:** UI là view/controller mỏng; mọi mutation thực hiện qua `extensionClient` / Background Coordinator và `StorageMutex`.

---

## 7. CẬP NHẬT TRẠNG THÁI & BƯỚC TIẾP THEO

- Đã cập nhật `/PROJECT_STATUS.md` phản ánh đúng trạng thái hoàn tất Milestone 5B.4.3C (382/382 tests PASS, build/lint PASS, F-08 → F-11 đã đóng).
- **Sẵn sàng cho Phase 5C:** Triển khai `UPGRADE_BUILDING`, logic chuyển kỷ nguyên từ `STONE_AGE` sang `BRONZE_AGE` (Automatic Building Evolution 0 Coins), và mở rộng danh mục công trình Thời kỳ Đồ Đồng.
