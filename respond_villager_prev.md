# BÁO CÁO NGHIỆM THU — MILESTONE 5C / GIAI ĐOẠN 5C-1

**Giai đoạn:** Milestone 5C — Giai đoạn 5C-1 *(Nâng cấp công trình `UPGRADE_BUILDING`, Hoàn tiền 50% khi phá hủy & Giới hạn xây dựng (Build Limit) 4 cho mỗi loại công trình Kinh tế)*  
**Ngày hoàn thành:** 2026-11-20  
**File sao lưu báo cáo cũ:** `/respond_5c1_prev.md` *(sao lưu nguyên vẹn báo cáo UX-5.1 trước khi ghi đè; giữ nguyên toàn bộ các bản `respond_*_prev.md` trước đó)*  
**Trạng thái xác nhận trước đó:** Đã cập nhật `PROJECT_STATUS.md` và `README.md` theo xác nhận nghiệm thu trên Chrome thật và duyệt các giai đoạn `UX-1..UX-6`, `UX-5`, `UX-5.1`, `LOFI-1/1b/2`, `2b`, `5c`, `6+7`.  
**Trạng thái hiện tại:** **`625 / 625` tests PASS** | **`npm run lint` (`tsc --noEmit`) PASS (`0` errors)** | **`npm run clean && npm run build` PASS (`1,237,298 B` / `26` tệp, `806ms`)** — **DỪNG CHỜ DUYỆT GIAI ĐOẠN 5C-1**

---

## 1. HIỆN TRẠNG HỆ THỐNG (TRƯỚC & SAU GIAI ĐOẠN 5C-1)

- **Trước 5C-1:**
  - `BuildingDetailsModal.tsx` khóa nút nâng cấp với thông điệp `"Milestone 5C"` cho toàn bộ công trình; không có message `UPGRADE_BUILDING`, coordinator handler hay engine kiểm tra điều kiện nâng cấp tổng thể.
  - Phá hủy công trình (`REMOVE_BUILDING`) chỉ gỡ công trình khỏi `GridMap` và `CivilizationState.buildings` với `0` Coins hoàn lại.
  - Chưa có trần giới hạn số lượng công trình `ECONOMY_EFFECT` trên bản đồ, và `buildingCatalog.ts` chỉ mới định nghĩa `calculateUpgradeCost` cùng `upgradeCostMultiplier` / `maxLevel`.
- **Sau 5C-1 (`UPGRADE_BUILDING` + Hoàn tiền 50% + Build Limit 4 mỗi loại công trình Kinh tế):**
  - **Chỉ nâng cấp nhóm `ECONOMY_EFFECT` (`Foraging Post` `+2%/lv`, `Primitive Granary` `+3%/lv`, `maxLevel = 5`):**
    - Chi phí nâng cấp `L → L+1`: `Math.round(baseCost × Math.pow(upgradeCostMultiplier, L))`.
    - Cổng Player Level cho `L → L+1`: `definition.unlockRequirements.minPlayerLevel + L × BUILDING_UPGRADE_PLAYER_LEVEL_STEP` (`BUILDING_UPGRADE_PLAYER_LEVEL_STEP = 1`).
    - Nhóm `DECORATIVE` (`Campfire`, `Ancient Totem`) và `FOCUS_SUPPORT` (`Meditation Cave`, `Elder's Hut`) giữ nguyên hiệu ứng cố định (`Can't Upgrade` / `Không thể nâng cấp`) và từ chối nâng cấp bằng `CIV_UPGRADE_NOT_SUPPORTED`.
  - **Giao dịch nguyên tử dưới `StorageMutex` + Concurrency Token `expectedLevel`:**
    - `UPGRADE_BUILDING` yêu cầu `{ buildingId, expectedLevel }` (`Number.isInteger(expectedLevel) && expectedLevel >= 1`), từ chối payload sai bằng `CIV_INVALID_UPGRADE_PAYLOAD`, bắt xung đột đồng thời qua `BUILDING_LEVEL_MISMATCH`, kiểm tra tuần tự `BUILDING_NOT_FOUND` → `LEVEL_MISMATCH` → `NON_UPGRADEABLE_CATEGORY` → `BUILDING_MAX_LEVEL` → `ERA_LOCKED` → `PLAYER_LEVEL_REQUIRED` → `INSUFFICIENT_COINS`, trừ Coins và cập nhật level `+1` trong cùng một transaction.
    - Cập nhật `this.cachedBonuses = extractBuildingCoinBonuses(nextBuildings)` đồng bộ trong `onCommitted` trước khi nhả lock, giúp phiên Focus tiếp theo hoặc đang chạy nhận ngay mức `+CoinBonus%` mới mà không động tới XP hay `RewardEngine`.
  - **Giới hạn xây dựng — Build Limit (`MAX_ECONOMY_EFFECT_BUILDINGS = 4` tính riêng từng loại công trình):**
    - `PLACE_BUILDING` tính giới hạn riêng theo từng loại công trình (`Foraging Post` tối đa 4, `Primitive Granary` tối đa 4; trần `+100% CoinBonus` tại Stone Age khi đủ 4× Foraging Post Lv.5 + 4× Primitive Granary Lv.5), chặn công trình thứ 5 cùng loại bằng mã lỗi `CIV_ECONOMY_BUILDING_LIMIT_REACHED`; phá hủy giải phóng slot của đúng loại công trình đó.
    - `BuildingCatalogPanel.tsx` hiển thị badge `data-testid="catalog-economy-cap"` (`Build Limit: X/4` / `Giới hạn xây dựng: X/4`) riêng cho từng loại công trình Kinh tế, thay `Max Lv.x` bằng `Can't Upgrade` / `Không thể nâng cấp` đối với các công trình không nâng cấp được, và tự vô hiệu hóa nút Build khi loại đó đạt trần.
  - **Hoàn tiền phá hủy 50% (`BUILDING_DEMOLISH_REFUND_RATE = 0.5`):**
    - `REMOVE_BUILDING` hoàn lại đúng `50% × (baseCost + ∑ chi phí nâng cấp 1..level-1)` qua `refundCoins` trong `executeCivilizationTransaction`, bảo toàn nguyên vẹn độ chính xác IEEE-754 trong `fq_economy` (chỉ định dạng half-up tối đa 2 chữ số thập phân ở tầng hiển thị UI qua `formatRewardAmount`) và có rollback compensation nếu `setMultiple` thất bại.

---

## 2. DANH SÁCH FILE ĐÃ TẠO / THAY ĐỔI

### Core & Types
1. **`src/core/civilization/constants.ts`** *(Cập nhật)*: Thêm `BUILDING_UPGRADE_PLAYER_LEVEL_STEP = 1`, `BUILDING_DEMOLISH_REFUND_RATE = 0.5`, `MAX_ECONOMY_EFFECT_BUILDINGS = 4`.
2. **`src/core/civilization/buildingUpgrade.ts`** *(Tạo mới)*: Pure engine gồm `isBuildingCategoryUpgradeable`, `getBuildingPlacementLimit`, `getPlacedBuildingCountByDefinition`, `getPlacedEconomyBuildingsCount`, `canPlaceAnotherBuildingOfCategory`, `getBuildingUpgradeRequiredPlayerLevel`, `getBuildingCoinBonusRateAtLevel`, `calculateTotalBuildingCoinsSpent`, `calculateBuildingDemolishRefund`, `evaluateBuildingUpgrade`, `applyBuildingUpgrade` (zero `Date.now()`, zero `Math.random()`).
3. **`src/core/civilization/index.ts`** *(Cập nhật)*: Re-export toàn bộ `buildingUpgrade.ts`.
4. **`src/types/messages.ts`** *(Cập nhật)*: Thêm `UpgradeBuildingPayload`, `UpgradeBuildingResponseData`, `refundedCoins?: number` trên `RemoveBuildingResponseData`, và action `'UPGRADE_BUILDING'`.
5. **`src/types/errors.ts`** *(Cập nhật)*: Bổ sung các `ErrorCode` của Stage 5C-1 (`CIV_ECONOMY_BUILDING_LIMIT_REACHED`, `CIV_INVALID_UPGRADE_PAYLOAD`, `BUILDING_NOT_FOUND`, `BUILDING_LEVEL_MISMATCH`, `CIV_UPGRADE_NOT_SUPPORTED`, `BUILDING_MAX_LEVEL`, `CIV_UPGRADE_ERA_LOCKED`, `UPGRADE_PLAYER_LEVEL_REQUIRED`, `CIV_UPGRADE_REQUEST_FAILED`).

### Background & Storage
6. **`src/storage/storageManager.ts`** *(Cập nhật)*: Mở rộng `CivilizationTransactionOutcome` & `executeCivilizationTransaction` hỗ trợ `refundCoins?: number` nguyên tử dưới `StorageMutex` kèm rollback compensation đầy đủ cho `REMOVE_BUILDING`.
7. **`src/background/civilizationCoordinator.ts`** *(Cập nhật)*: Thêm `upgradeBuilding()`, thêm bước kiểm tra `canPlaceAnotherBuildingOfCategory` trong `placeBuilding()`, tính và trả `refundedCoins` trong `removeBuilding()`, cập nhật đồng bộ `cachedBonuses` trong `onCommitted`.
8. **`src/background/messageHandler.ts`** *(Cập nhật)*: Định tuyến `case 'UPGRADE_BUILDING'` tới `civilizationCoordinator.upgradeBuilding(message.payload)`.

### UI, Simulator & i18n
9. **`src/ui/components/civilization/BuildingDetailsModal.tsx`** *(Cập nhật)*: Mở khóa phần Nâng cấp, hiển thị chi phí, preview `+X% → +Y% CoinBonus`, thiếu Coins, cổng Player Level, max Lv.5, badge `Can't Upgrade` / `Không thể nâng cấp` cho `DECORATIVE`/`FOCUS_SUPPORT`, banner thành công `data-testid="building-upgrade-success"`, hộp lỗi nội tuyến `data-testid="building-upgrade-error"`, chống bấm đúp theo `building.id` qua `inFlightLockRef`, và hiển thị số Coins hoàn lại 50% trong cảnh báo xác nhận phá hủy.
10. **`src/ui/components/civilization/BuildingCatalogPanel.tsx`** *(Cập nhật)*: Hiển thị badge `Build Limit: X/4` / `Giới hạn xây dựng: X/4` (`data-testid="catalog-economy-cap"`) tính riêng cho từng loại công trình Kinh tế, thay `Max Lv.x` bằng `Can't Upgrade` / `Không thể nâng cấp` với công trình không nâng cấp được, và vô hiệu hóa nút Build khi loại đó đạt 4/4.
11. **`src/ui/components/civilization/CivilizationScreen.tsx`** *(Cập nhật)*: Nối `handleUpgradeBuilding` → `upgradeBuildingClient`, đồng bộ lại `civState`/`economy`/`inspectedBuilding`, quản lý `upgradeModalError`/`upgradeSuccessLevel` và gọi `onStateMutated?.()` để `App.tsx` cập nhật `+CoinBonus%` trực tiếp.
12. **`src/ui/components/civilization/MapGridView.tsx`** *(Cập nhật)*: Hiển thị badge `data-building-level-badge` (`Lv.{level}` và `+{bonusPercent}%`) cho các công trình đang đặt trên bản đồ.
13. **`src/ui/services/extensionClient.ts`** *(Cập nhật)*: Thêm `upgradeBuildingClient` và đầy đủ nhánh simulator cho `UPGRADE_BUILDING`, Build Limit 4 mỗi loại công trình Kinh tế trong `PLACE_BUILDING`, và hoàn tiền 50% trong `REMOVE_BUILDING`.
14. **`src/i18n/locales/en.ts`**, **`src/i18n/locales/vi.ts`**, **`src/i18n/errorTranslator.ts`** *(Cập nhật)*: Đạt **`543` khóa EN/VI** parity 100% và **`107` mã lỗi** trong `ALL_KNOWN_ERROR_CODES` kèm tham số hóa song ngữ EN/VI cho toàn bộ thông báo/lỗi nâng cấp & Build Limit.

### Kiểm thử & Tài liệu
15. **`__tests__/core/buildingUpgrade.test.ts`** *(Tạo mới)*: Kiểm thử thuần toán học chi phí nâng cấp, hoàn tiền 50%, thứ tự ưu tiên cổng kiểm tra, bất biến immutable, và Build Limit 4 riêng từng loại (`+100%` max Stone Age).
16. **`__tests__/background/upgradeBuilding.test.ts`** *(Tạo mới)*: Kiểm thử `MessageHandler` + `CivilizationCoordinator` + `SessionCoordinator` + `StorageManager` (L1→L5, live `CoinBonus` `+10%` trên phiên Focus, giữ nguyên XP/dailyStats/quests, concurrency `Promise.all` → `BUILDING_LEVEL_MISMATCH`, rollback `setMultiple` trên cả Upgrade & Demolish, Build Limit 4 riêng cho `Foraging Post` & `Primitive Granary` + mở slot sau khi phá hủy, hoàn tiền 50% trên Lv.3).
17. **`__tests__/ui/upgradeBuildingUi.test.ts`** *(Tạo mới)*: Kiểm thử parity simulator `extensionClient.ts`, SSR `BuildingDetailsModal` đủ mọi trạng thái EN/VI, `BuildingCatalogPanel` (`catalog-economy-cap`), `MapGridView` (`data-building-level-badge`), và `errorTranslator.ts`.
18. **`__tests__/background/civilizationTransactionAudit.test.ts`**, **`__tests__/ui/civilizationView.test.ts`**, **`__tests__/ui/fullBilingual.test.ts`**, **`__tests__/ui/spriteRegistry.test.ts`** *(Cập nhật assertion)*: Đồng bộ hoàn tiền 50% khi phá hủy, bỏ assertion khóa `"Milestone 5C"` cũ, và bổ sung mẫu kiểm tra các mã lỗi Stage 5C-1.
19. **`PRODUCT_SPEC.md`**, **`ARCHITECTURE.md`**, **`README.md`**, **`PROJECT_STATUS.md`**, **`respond.md`** *(Cập nhật)*: Đồng bộ tài liệu v1.6.0-synced / v1.9.0 và báo cáo Stage 5C-1.

---

## 3. KẾT QUẢ TEST TỰ ĐỘNG, LINT & BUILD

- **`npm run lint` (`tsc --noEmit`):** **PASS** (Exit code `0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (Exit code `0`, Vite `v8.3.8`, `1,756 modules transformed`, **`806ms`**, `dist/`: **`26` tệp**, **`1,237,298 B`**, `0` file audio).
- **`npm test` (`tsx --test`) — sau khi hoàn tất mã nguồn & bộ test cập nhật:**
  - **`625 / 625` PASS** (`0` fail, `0` skipped, `0` cancelled, **`20,454.79 ms`**)
  - Toàn bộ suite chạy trên Node.js (`renderToString` SSR, hàm thuần và mock Chrome/Storage adapters).

---

## 4. KẾT QUẢ CHROME VERIFICATION (TRUNG THỰC TUYỆT ĐỐI)

- **Chưa kiểm chứng trực quan trên trình duyệt Chrome thật đối với Giai đoạn 5C-1** do môi trường thực thi hiện tại chỉ có Node.js headless CLI (không có Chrome GUI / DevTools runtime).
- Không có bất kỳ kết quả giả lập PASS nào cho thao tác click nút nâng cấp, animation pulse, badge trên bản đồ ở DPR `400×600`, hay đồng bộ thông điệp giữa popup thật và Service Worker Chrome cho `UPGRADE_BUILDING`.
- Toàn bộ hành vi DOM và Service Worker thực tế của **5C-1** cần được nghiệm thu trực tiếp bằng bản build mới tại `dist/` theo checklist ở Mục 6.

---

## 5. XÁC NHẬN BẢO TOÀN BẤT BIẾN SẢN PHẨM

- **Kinh tế & Phần thưởng:** Giữ nguyên 100% `RewardEngine`, `MultiplierRules`, XP độc lập với `CoinBonus`, Zero Passive Income, Quest thưởng phẳng & Claim thủ công, và không ghi thưởng Quest vào `fq_daily_stats`.
- **Schema & Engine Map/Focus:** `CURRENT_SCHEMA_VERSION = 3` giữ nguyên (0 thay đổi schema, 0 migration mới), giữ nguyên 100% `SessionCoordinator`, `QuestCoordinator`, LOFI audio, `UX-5` (`TerrainBitmapCanvas`, `terrainDecor.ts`), `UX-5.1` (`expansionCamera.ts`), `UX-6` (đóng băng terminal focus minutes).
- **Phạm vi Stage 5C:** Chưa làm **Bronze Age / chuyển Era** (Giai đoạn 5C-2) và chưa làm hệ thống **Awards** thật (`awards-placeholder-view` vẫn giữ nguyên).

---

## 6. CHECKLIST NGHIỆM THU THỦ CÔNG TRÊN CHROME THẬT (`dist/`)

1. Mở `chrome://extensions` → **Reload** extension trỏ tới `dist/` → mở popup (`400×600`).
2. Vào tab **Map** → mở **Build** catalog: xác nhận các công trình không nâng cấp được (`Campfire`, `Ancient Totem`, `Meditation Cave`, `Elder's Hut`) hiển thị **`Can't Upgrade` / `Không thể nâng cấp`** thay vì `Max Lv.x`; hai công trình Kinh tế (`Foraging Post`, `Primitive Granary`) hiển thị `Max Lv. 5` (`Tối đa Lv. 5`) cùng badge **`Build Limit: 0/4` / `Giới hạn xây dựng: 0/4`** tính riêng cho mỗi loại. Đặt 4 `Foraging Post` → xác nhận `Foraging Post` đạt `4/4` và khóa nút Build trong khi `Primitive Granary` vẫn ở `0/4` và xây dựng bình thường.
3. Chọn một **Foraging Post** (`Lv.1`) trên bản đồ → mở **BuildingDetailsModal**: xác nhận hiển thị `Next Lv. 2 · Cost: 96 Coins` và preview `+2% → +4% CoinBonus`.
   - Nếu thiếu Coins hoặc chưa đủ Player Level: xác nhận nút nâng cấp khóa và hiển thị đúng phần thiếu / cấp độ yêu cầu.
   - Khi đủ điều kiện → bấm **Upgrade**: xác nhận trừ Coins chính xác, level tăng lên `Lv.2`, hiện banner thành công màu xanh, badge trên bản đồ cập nhật `Lv.2 +4%`, và nếu đang chạy hoặc chuẩn bị phiên Focus thì chip `CoinBonus` ở tab **Focus** cập nhật tương ứng mà không thay đổi XP.
4. Chọn một công trình **Campfire** (`DECORATIVE`) hoặc **Meditation Cave / Elder's Hut** (`FOCUS_SUPPORT`): xác nhận phần nâng cấp hiển thị thông báo giữ hiệu ứng cố định và nút bị vô hiệu hóa (**`Can't Upgrade` / `Không thể nâng cấp`**).
5. Bấm **Demolish** trên một công trình Kinh tế đã nâng cấp (ví dụ `Foraging Post Lv.2`, tổng chi `60 + 96 = 156 Coins`): xác nhận cảnh báo hiển thị hoàn lại **78 Coins** (`50%`), bấm xác nhận → ví cộng đúng `78 Coins` và **Build Limit** của riêng `Foraging Post` trong **Build** giảm xuống tương ứng (`4/4 → 3/4`).

---

**DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU TRÊN CHROME THẬT VÀ DUYỆT MILESTONE 5C / GIAI ĐOẠN 5C-1.**
