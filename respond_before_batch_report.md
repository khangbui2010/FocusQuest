# BÁO CÁO TRIỂN KHAI MILESTONE 5B.6a — KINH TẾ MỞ RỘNG ĐẤT, CHỌN CHUNK LIỀN KỀ & XÁC NHẬN

**Ngày hoàn thành:** 15/11/2026 (UTC) / 14/11/2026 (-08:00)  
**Phạm vi thực hiện:** Hoàn tất **ĐÚNG MỘT giai đoạn: Milestone 5B.6a** (kinh tế mở rộng đất theo cấp số nhân nhẹ, khóa trần Player Level, chọn chunk liền kề trên bản đồ, gỡ bỏ mở đất theo 4 hướng và thay bằng bảng xác nhận). **CHƯA triển khai Milestone 5B.6b** (animation rìu chém rừng, rung nhẹ màn hình, audio); đang **DỪNG chờ duyệt** trước khi sang 5B.6b.

---

## 1. Tóm tắt Thiết kế & Triển khai (5B.6a)

1. **Core Pure Domain (`src/core/civilization/`):**
   - `constants.ts`: Thêm `INITIAL_CHUNK_COUNT = 4` (`(8/4) * (8/4)`), `LAND_EXPANSION_BASE_COST = 60`, `LAND_EXPANSION_RATIO_BASE = 1.25`, `LAND_EXPANSION_RATIO_STEP = 0.01`, `LAND_EXPANSION_RATIO_CAP = 1.5`, `LAND_EXPANSION_LEVEL_OFFSET = 2`.
   - `landExpansion.ts` (re-export qua `index.ts`):
     - `getExpansionPurchaseIndex(chunkCount)` -> `k = chunkCount - INITIAL_CHUNK_COUNT + 1`.
     - `getExpansionStepRatio(i)` -> `min(1.5, 1.25 + 0.01 * (i - 1))`.
     - `getExpansionCost(k)` -> `Math.round(60 * Π_{i=1}^{k-1} r_i)` (nhân thực đầy đủ giữa các bước rồi làm tròn `Math.round` duy nhất một lần ở cuối; tăng đơn điệu nghiêm ngặt, độc lập hoàn toàn với Session Multiplier, CoinBonus và vị trí chunk).
     - `getExpansionRequiredLevel(k)` -> `k + 2` (`k = 1` yêu cầu `Lv. 3`, `k = 2` yêu cầu `Lv. 4`, ...).
     - `getExpansionFocusMinuteEstimate(cost)` -> quy đổi phút focus Countdown ở mức `×1.0` (`1.5 Coins/phút`) và `×2.5` (`3.75 Coins/phút`, chưa tính CoinBonus).
     - `evaluateExpansion({ chunkCount, playerLevel, coins })` -> kiểm tra Level trước (`LEVEL_TOO_LOW`), sau đó Coins (`INSUFFICIENT_COINS`).
   - **Gỡ mở theo hướng:** Xóa `ExpansionDirection` khỏi `types.ts` và xóa `GridMap.expandInDirection` khỏi `gridMap.ts` (giữ `getAvailableExpansionSlots()` & `expandChunk(origin)`).
2. **Protocol, Backend Coordinator & Simulator Parity:**
   - `src/types/messages.ts`: `ExpandLandPayload` chỉ còn `{ origin: GridCoordinate }` (gỡ `direction`, `slotIndex`); `ExpandLandResponseData` bổ sung `economy: PlayerEconomy` và `cost: number`.
   - `src/background/messageHandler.ts`: Bắt buộc `origin` hợp lệ chia hết `4×4`; **từ chối rõ ràng** mọi payload còn chứa `direction` hoặc `slotIndex`.
   - `src/background/civilizationCoordinator.ts`: Toàn bộ `expandLand(payload)` chạy trong một `executeCivilizationTransaction` duy nhất dưới `StorageMutex`:
     1. Tính `playerLevel = Math.min(economy.level, calculatePlayerLevel(economy.totalXP))` & chạy `evaluateExpansion`.
     2. Chạy `gridMap.expandChunk(origin)` **trước** khi cam kết trừ Coins. Nếu kề/trùng/sai tọa độ → ném lỗi, **0 Coins bị trừ**.
     3. Trả `deductCoins: evalResult.cost` để `StorageManager` trừ thực IEEE-754 (không `Math.floor`), kèm rollback compensation tự động nếu lỗi ghi storage.
   - `src/ui/services/extensionClient.ts`: Simulator trình duyệt cho `EXPAND_LAND` đồng bộ 100% logic chặn `direction`/`slotIndex`, căn chỉnh `4×4`, Level gate, tính giá & trừ Coins thực IEEE-754.
3. **Giao diện Chọn Chunk Trên Bản đồ & Bảng Xác Nhận (`src/ui/components/civilization/` & `i18n`):**
   - `CivilizationHeader.tsx`: Nút `Expand` bật/tắt **Expansion Mode** (loại trừ lẫn nhau với Building Catalog & Placement Mode); hiển thị banner hướng dẫn + nút `Cancel (Esc)`.
   - `MapGridView.tsx`: Khi `isExpansionMode = true`, mở rộng viền rừng thành **`EXPANSION_FOREST_MARGIN_CELLS = 4`** (`16×16` trên lưới đầu `8×8`) và **tự động thu phóng (`computeExpansionFitZoom`)** để mọi chunk ứng viên đều nằm gọn trong khung, rồi khôi phục camera khi thoát. Render toàn bộ ô `gridMap.getAvailableExpansionSlots()` với viền nhấp nháy nhẹ (`animate-pulse`), dấu `+`, tọa độ `(x,y)`, và gợi ý lỗi khi bấm vào vùng khóa không liền kề.
   - `LandExpansionModal.tsx`: Gỡ bỏ hoàn toàn la bàn `NORTH/EAST/WEST/SOUTH`; chuyển thành **Bảng xác nhận mở chunk `(x, y)`** hiển thị: `"Chunk mới thứ k"`, `+16 ô đất (4×4)`, chi phí Coins + quy đổi `"≈ N phút focus ở ×1.0 / M phút ở ×2.5"`, Level yêu cầu vs Level hiện tại, số dư Coins, khóa nút `Expand` kèm lý do rõ ràng nếu thiếu Level/Coins, khóa chống double-submit (`isSubmitting`). Thành công → đóng modal, thoát Expansion Mode, cập nhật Economy & GridMap; thất bại → báo lỗi và **giữ nguyên Expansion Mode**.

---

## 2. Danh sách File Tạo mới & Chỉnh sửa

- **Tạo mới:**
  1. `src/core/civilization/landExpansion.ts`
  2. `__tests__/core/landExpansion.test.ts`
  3. `respond_phase4a2_v2_report.md` *(sao lưu `respond.md` của Giai đoạn 4a-2 V2 trước khi ghi đè)*
- **Chỉnh sửa:**
  - Core & Messages: `src/core/civilization/{constants,types,gridMap,index}.ts`, `src/types/messages.ts`
  - Background & Simulator: `src/background/{civilizationCoordinator,messageHandler}.ts`, `src/ui/services/extensionClient.ts`
  - UI & i18n: `src/ui/components/civilization/{CivilizationHeader,MapGridView,LandExpansionModal,CivilizationScreen}.tsx`, `src/i18n/locales/{en,vi}.ts`
  - Tests: `__tests__/core/gridMap.test.ts`, `__tests__/background/{messageValidation,civilizationMessages,civilizationConcurrency}.test.ts`, `__tests__/ui/{terrainDecor,civilizationView,extensionClient}.test.ts`
  - Tài liệu: `PROJECT_STATUS.md`, `respond.md`

---

## 3. Bảng 15 Lần Mua Đầu Tiên & Đối Chiếu Cân Bằng Stone Age

Bộ hằng số sử dụng (`src/core/civilization/constants.ts`):
- `LAND_EXPANSION_BASE_COST = 60`, `RATIO_BASE = 1.25`, `RATIO_STEP = 0.01`, `RATIO_CAP = 1.5`, `LEVEL_OFFSET = 2`.
- Quy đổi phút focus ở chế độ **Countdown** (`1.5 Coins/phút` ở `×1.0`; `3.75 Coins/phút` ở `×2.5`; chưa tính CoinBonus từ công trình).

| Lần mua (`k`) | Tổng Chunk sau mở | Hệ số tăng bước `r_{k-1}` | Giá (`Coins`) | Level tối thiểu (`k+2`) | Phút focus quy đổi (`×1.0`) | Phút focus quy đổi (`×2.5`) |
|---|---|---|---|---|---|---|
| `1` | `5` (`80` ô) | — | **`60`** | `Lv. 3` | `≈ 40m` | `≈ 16m` |
| `2` | `6` (`96` ô) | `1.25` | **`75`** | `Lv. 4` | `≈ 50m` | `≈ 20m` |
| `3` | `7` (`112` ô) | `1.26` | **`95`** | `Lv. 5` | `≈ 63m` | `≈ 25m` |
| `4` | `8` (`128` ô) | `1.27` | **`120`** | `Lv. 6` | `≈ 80m` | `≈ 32m` |
| `5` | `9` (`144` ô) | `1.28` | **`154`** | `Lv. 7` | `≈ 103m` | `≈ 41m` |
| `6` | `10` (`160` ô) | `1.29` | **`198`** | `Lv. 8` | `≈ 132m` | `≈ 53m` |
| `7` | `11` (`176` ô) | `1.30` | **`258`** | `Lv. 9` | `≈ 172m` | `≈ 69m` |
| `8` | `12` (`192` ô) | `1.31` | **`337`** | `Lv. 10` | `≈ 225m` | `≈ 90m` |
| `9` | `13` (`208` ô) | `1.32` | **`445`** | `Lv. 11` | `≈ 297m` | `≈ 119m` |
| `10` | `14` (`224` ô) | `1.33` | **`592`** | `Lv. 12` | `≈ 395m` | `≈ 158m` |
| `11` | `15` (`240` ô) | `1.34` | **`794`** | `Lv. 13` | `≈ 529m` | `≈ 212m` |
| `12` | `16` (`256` ô) | `1.35` | **`1,072`** | `Lv. 14` | `≈ 715m` | `≈ 286m` |
| `13` | `17` (`272` ô) | `1.36` | **`1,458`** | `Lv. 15` | `≈ 972m` | `≈ 389m` |
| `14` | `18` (`288` ô) | `1.37` | **`1,997`** | `Lv. 16` | `≈ 1,331m` | `≈ 533m` |
| `15` | `19` (`304` ô) | `1.38` | **`2,756`** | `Lv. 17` | `≈ 1,837m` | `≈ 735m` |

**Đối chiếu với `buildingCatalog.ts` (Stone Age):**
- Công trình Stone Age rẻ nhất: **`stone_age_campfire`** (Campfire, `1×1`) = **`15 Coins`** (`Lv. 1`, `0m`).
- Công trình hỗ trợ/kinh tế tầm trung: **`stone_age_study_cave`** (`50 Coins`), **`stone_age_foraging_post`** (`60 Coins`, `+2%/lv`), **`stone_age_elder_hut`** (`80 Coins`, `Lv. 2`).
- Công trình Stone Age đắt nhất: **`stone_age_food_cache`** (Primitive Granary, `2×3`) = **`120 Coins`** (`Lv. 2`, `+3%/lv`).
- **Nhận xét cân bằng:** Đất khởi tạo `8×8 = 64` ô đủ chỗ cho cả 6 công trình Stone Age đầu tiên (tổng diện tích chiếm chỉ `1+1+4+4+4+6 = 20` ô). Ở lần mở đầu tiên (`k=1`: **`60 Coins`**, `Lv. 3`, tương đương `40m` focus ở `×1.0`), chi phí bằng đúng 1 nhà `Foraging Post` (`60 Coins`) và bằng nửa `Primitive Granary` (`120 Coins`) — tạo nhịp lựa chọn rõ ràng giữa **xây thêm công trình** hay **mở thêm `16` ô đất** khi người chơi đạt `Lv. 3` (`300 XP`), sau đó tăng dốc hợp lý lên ~`1,072–2,756 Coins` ở `k=12..15` tương xứng với giai đoạn mid/late-game (khi đã có nhiều tầng CoinBonus và phiên dài `×2.5`).

---

## 4. Kết quả Kiểm định Thực tế (So sánh Baseline 4a-2 V2 vs 5B.6a)

| Hạng mục | Baseline (Sau 4a-2 V2) | Sau Milestone 5B.6a | Ghi chú |
|---|---|---|---|
| `npm test` | **455 / 455 PASS** (`23.37s`) | **467 / 467 PASS** (`0` fail, `0` skipped, `0` cancelled, `0` todo, **`26.84s`**) | **+12 tests mới** (`7` trong `landExpansion.test.ts`, `2` concurrency `J/K`, `1` message edge cases, `1` header expansion mode, `1` simulator parity) |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0 errors`) | **PASS** (**`0 errors, 0 warnings`**) | Sạch lỗi TypeScript toàn dự án |
| `npm run clean && npm run build` | **PASS** (`1.04s`, `1,725` modules) | **PASS** (**`1.08s`**, Vite `v8.3.5`, **`1,726` modules**) | Build MV3 sạch lỗi |
| `dist/` tổng dung lượng | `947,461 B` | **`960,227 B`** *(gồm `aistudio/` `59,867 B`, `sprites/` `15,350 B`)* | Đủ `manifest.json`, `icons/`, `blocked.html`, sprites CC0 |
| `dist/background.js` | `77.67 kB` (`77,672 B`, gzip `16.84 kB`) | **`78.14 kB`** (`78,148 B`, gzip **`17.01 kB`**) | Service Worker giữ nguyên nhẹ gọn |
| `dist/assets/domainNormalizer-*.js` | `22.75 kB` (`22,755 B`, gzip `7.10 kB`) | **`23.22 kB`** (`23,222 B`, gzip **`7.27 kB`**) | Chứa phần dùng chung `landExpansion.ts` |
| `dist/assets/popup-*.js` | `689.39 kB` (`689,397 B`, gzip `183.96 kB`) | **`698.08 kB`** (`698,080 B`, gzip **`186.12 kB`**) | Bổ sung UI chọn chunk & bảng xác nhận 5B.6a |
| `dist/assets/popup-*.css` | `69.56 kB` (`69,565 B`, gzip `10.90 kB`) | **`73.50 kB`** (`73,505 B`, gzip **`11.33 kB`**) | Style Tailwind thuần (kèm `animate-pulse` & cursor states) |
| `dist/index.html` / `manifest.json` | `637 B` / `1,007 B` | **`637 B` / `1,007 B`** | Không đổi |

### Danh sách Test cũ đã cập nhật & Lý do:
1. `__tests__/core/gridMap.test.ts`: Thay test `expandInDirection` bằng assertion xác minh `expandInDirection` đã bị gỡ khỏi `GridMap` và kiểm tra mở rộng liên tiếp qua `getAvailableExpansionSlots()` + `expandChunk(origin)`.
2. `__tests__/ui/terrainDecor.test.ts`: Đổi `map.expandInDirection('EAST')` sang `map.expandChunk({ x: 8, y: 0 })` do đã xóa mở đất theo hướng.
3. `__tests__/background/messageValidation.test.ts`: Cập nhật case kiểm tra `EXPAND_LAND` sang xác minh từ chối `{ direction: 'EAST' }`, `{ origin, slotIndex }`, tọa độ không chia hết `4×4` (`{ x: 5, y: 0 }`), và tọa độ `NaN`.
4. `__tests__/background/civilizationMessages.test.ts`: Đồng bộ `totalXP` với `level` trong `seedEconomy`; seed sẵn `Coins`/`Level` hợp lệ cho các test `EXPAND_LAND` bằng `origin`, đổi test mở hướng `WEST` thành test từ chối `direction` + mở tọa độ âm `(-4, 0)` có trừ `60 Coins`, và seed đủ điều kiện cho test cô lập `(100, 100)` để kiểm tra đúng lỗi `CHUNK_NOT_ADJACENT` & **0 Coins bị trừ**.
5. `__tests__/background/civilizationConcurrency.test.ts`: Đổi `Tests D, E, I` từ `{ direction }` sang `{ origin }` kèm kiểm chứng số dư Coins & rollback `focusCoins` trên `Test I`; nâng `Test E` lên `Lv. 4` để mua nối tiếp 2 chunk (`60 + 75 = 135 Coins`).
6. `__tests__/ui/civilizationView.test.ts`: Cập nhật `expandLandClient` từ `direction` sang `origin` kèm trừ `60 Coins` & chặn `Lv. 4`; cập nhật `LandExpansionModal` từ la bàn 4 hướng sang props/assertions bảng xác nhận (hiển thị chi phí, phút focus, Level, số dư, trạng thái khóa nút khi thiếu Level/Coins); bổ sung test `MapGridView` Expansion Mode (`16×16` viền `4` ô, auto-zoom `<100%`, đúng `8` chunk ứng viên).

---

## 5. Giới hạn Kiểm chứng & Bước Tiếp theo

- **Giới hạn kiểm chứng:** Toàn bộ **467 unit tests** (bao gồm `LandExpansionModal`, `CivilizationHeader`, `MapGridView` ở Expansion Mode) chạy qua **React SSR (`renderToString`) trên Node.js**. Tương tác trực tiếp trên **Chrome Extension thật (`Load unpacked`)** — click chuột chọn từng chunk ứng viên nhấp nháy, hiệu ứng tự zoom trên màn hình `400×600px`, phím `Esc` nhiều tầng (bảng xác nhận → Expansion Mode), và thông báo gợi ý khi click vùng khóa ngoài biên — **chưa được kiểm chứng bằng mắt trong trình duyệt thật**.
- **Bước tiếp theo (ĐANG DỪNG CHỜ DUYỆT):** Chờ xác nhận hoàn tất **Milestone 5B.6a** trước khi triển khai **Milestone 5B.6b (Animation mở rộng đất: rìu chém rừng + rung nhẹ)**.
