# FOCUS QUEST — KẾ HOẠCH TRIỂN KHAI CHI TIẾT MILESTONE 5B.4.3C
## CIVILIZATION-FIRST UI & PACKAGING HARDENING

**Ngày lập kế hoạch:** 12/11/2026  
**Dự án:** Focus Quest (Chrome MV3 Extension & React 19 Frontend)  
**Tác giả:** Senior Frontend & Extension Architect  
**Trạng thái tài liệu:** **PROPOSAL READY FOR USER APPROVAL (CHỜ PHÊ DUYỆT TRƯỚC KHI THI CÔNG)**  
**Cam kết:** Tuyệt đối không thay đổi source code trong giai đoạn lập kế hoạch này.

---

## A. ĐÁNH GIÁ REPOSITORY HIỆN TẠI

### 1. Cấu trúc thư mục mã nguồn thực tế
```
/
├── __tests__/                  # 43 test files (371 tests đang chạy trong runner)
│   ├── background/             # 9 test files (Session, Messages, Lifecycle, Integrity, Alarms)
│   ├── core/                   # 19 test files (Grid, Catalog, Timer, Multiplier, Reward, Level)
│   ├── integration/            # 1 test file (Phase 3 Integration)
│   ├── mocks/                  # 1 test file (Chrome API mocks)
│   ├── storage/                # 6 test files (Migrations v1/v2, Mutex, Precision, Audit)
│   └── ui/                     # 4 test files (ExtensionClient, PopupShell, RewardHelpModal, civilizationView)
├── public/
│   ├── icons/                  # icon16, icon32, icon48, icon128, icon.svg
│   ├── blocked.html            # Giao diện Focus Shield khi truy cập web ngoài Allowlist
│   └── manifest.json           # Chrome MV3 manifest (min Chrome 102, service_worker: background.js)
├── src/
│   ├── background/             # Service Worker: sessionCoordinator, civilizationCoordinator, messageHandler
│   ├── chrome/                 # MV3 Adapters (alarms, badge, notifications, tabs, dnr)
│   ├── core/                   # Pure business domain: civilization, timer, reward, economy, profiles
│   ├── storage/                # StorageManager, StorageMutex, Migrations v1/v2, StorageAdapters
│   ├── types/                  # Typed contracts (session, messages, economy, profiles, storageSchema)
│   ├── ui/
│   │   ├── components/         # Header.tsx, Navbar.tsx, ProfileAllowlistView.tsx, StatsView.tsx, TimerView.tsx, RewardHelpModal.tsx
│   │   │   └── (chưa có thư mục civilization/)
│   │   ├── services/           # extensionClient.ts (Bridge + Preview Simulation), soundEffects.ts
│   │   └── utils/              # formatters.ts
│   ├── App.tsx                 # Root container (Popup 400px + Interactive Preview shell)
│   ├── index.css               # Tailwind CSS 4 global import
│   └── main.tsx                # React 19 entry point
├── ARCHITECTURE.md             # Kiến trúc MV3, DNR, Alarms, StorageMutex
├── PRODUCT_SPEC.md             # Nguồn sự thật tối cao về Game Loop, Kinh tế, Timer, Allowlist
├── PROJECT_STATUS.md           # Lịch sử hoàn thành các Phase 1-5B.4.2
├── package.json                # Định danh gói ("react-example"), dependencies, scripts
└── vite.config.ts              # Cấu hình Vite build
```

### 2. Trạng thái hoạt động thực tế
- **Kiểm thử tự động:** `npm test` chạy thành công **371 / 371 tests PASS (100%)** qua 24 test suites (~15.4s).
- **Kiểm tra kiểu dữ liệu:** `npm run lint` (`tsc --noEmit`) đạt **0 errors, 0 warnings**.
- **Production Build:** `npm run build` (`vite build`) đạt exit code 0 trong ~767ms.
- **Khoảng cách so với mục tiêu Milestone 5B.4.3C:**
  - Tab `Civ` trong `src/App.tsx` (dòng 221–238) hiện tại đang là một placeholder tĩnh thông báo `"Milestone 5B.4.3C UI"`.
  - Thư mục `src/ui/components/civilization/` chưa tồn tại trong source code.
  - Tệp `__tests__/ui/civilizationView.test.ts` (11 tests) đang bị exclude khỏi test runner và tsconfig.
  - Thư mục `dist/` sau khi build chưa có `dist/background.js` cho Service Worker.

---

## B. KẾT QUẢ RÀ SOÁT TÀI LIỆU NGUỒN

Đối chiếu trực tiếp với `PRODUCT_SPEC.md` (v1.3.0-accepted), các nguyên tắc bắt buộc phải được tuân thủ nghiêm ngặt trong 5B.4.3C:

1. **Zero Passive Income (Quy tắc Vàng của Civilization):**
   - Tuyệt đối không sinh coin thụ động theo thời gian (zero idle/passive income).
   - Coins và XP chỉ kiếm được thông qua việc người dùng hoàn thành phiên Focus thực tế.
2. **Hiệu ứng công trình (Building Effects) phân loại theo 3 nhóm:**
   - `DECORATIVE`: Thẩm mỹ thế giới, không sinh coin/xp, không có bonus.
   - `FOCUS_SUPPORT`: Mở khóa tính năng/thống kê hỗ trợ Focus.
   - `ECONOMY_EFFECT`: Thưởng tỷ lệ `CoinBonus` cộng dồn ($+2\%, +3\%$ mỗi level). Bonus này **chỉ nhân vào Focus Coins**, hoàn toàn độc lập và **không tác động lên XP**.
3. **Cơ chế Automatic Building Evolution khi chuyển Era:**
   - Khi người chơi xác nhận chuyển Era (Era Transition), các công trình có mapping hợp lệ sẽ tự động tiến hóa.
   - Chi phí tiến hóa: **0 Coins**.
   - Giữ nguyên `BuildingInstance.id`, giữ nguyên `Level` (nếu target tương thích), giữ nguyên tọa độ `position` (nếu footprint tương thích).
   - Công trình không có mapping hoặc không an toàn thì giữ nguyên trạng thái cũ, không xóa hay di dời.
4. **Bảo tồn tài sản người chơi:**
   - Player Level, XP và số dư Focus Coins được bảo toàn nguyên vẹn $100\%$ khi chuyển Era.
5. **Kích thước và không gian hiển thị:**
   - Giao diện Popup extension có độ rộng chuẩn cố định $400\text{px}$, chiều cao tối đa $600\text{px}$.
   - Mọi tương tác bản đồ, bảng công trình, modal xem chi tiết phải được thiết kế vừa vặn, không bị tràn khung hay vỡ layout.

---

## C. PHƯƠNG ÁN XỬ LÝ 4 FINDINGS (F-08 ĐẾN F-11)

### 1. Finding F-08 — Production Build thiếu Service Worker (`dist/background.js`)
- **Mức độ:** **P1 (High)**
- **Root cause:** `vite.config.ts` hiện tại chỉ cấu hình SPA cho `index.html`. Rollup trong Vite chỉ quét cây dependency bắt đầu từ `index.html`, do đó bỏ qua hoàn toàn `src/background/index.ts`. Trong khi đó, `public/manifest.json` khai báo `"service_worker": "background.js"`.
- **File liên quan:** `vite.config.ts`, `package.json`, `public/manifest.json`.
- **Phương án xử lý kỹ thuật đề xuất:**
  - Cấu hình Rollup multi-input trong `vite.config.ts`:
    ```typescript
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(import.meta.dirname, 'index.html'),
          background: path.resolve(import.meta.dirname, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background.js';
            }
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    }
    ```
- **Rủi ro:** Vite có thể tách các shared chunk chung giữa popup và background vào thư mục `assets/`. Trong Manifest V3, Service Worker là ES Module (`"type": "module"`), do đó hỗ trợ nạp shared chunk qua `import`. Tuy nhiên, để đảm bảo Service Worker khởi động độc lập và không phụ thuộc network, cần kiểm tra kích thước bundle và cấu hình inline hoặc chunking phù hợp.
- **Acceptance criteria:**
  - Chạy `npm run build` tạo ra chính xác file `dist/background.js`.
  - File `dist/index.html` và các assets của popup vẫn hoạt động nguyên vẹn.
  - Manifest V3 hợp lệ, extension tải thành công dưới dạng Unpacked Extension trong Chrome mà không có cảnh báo thiếu file.

### 2. Finding F-09 — Sai tên Package trong `package.json`
- **Mức độ:** **P2 (Medium)**
- **Root cause:** `package.json` dòng 2 hiện vẫn là `"name": "react-example"` do chưa được đồng bộ từ template gốc.
- **File liên quan:** `package.json`, `package-lock.json`.
- **Phương án xử lý:**
  - Cập nhật dòng 2 của `package.json` thành: `"name": "focus-quest"`.
  - Chạy `npm install --package-lock-only` để đồng bộ thuộc tính `name` trong `package-lock.json` mà không làm thay đổi hay nâng cấp bất kỳ dependency nào.
- **Rủi ro:** Không có rủi ro kỹ thuật.
- **Acceptance criteria:** Cả `package.json` và `package-lock.json` đều thể hiện tên package là `"focus-quest"`.

### 3. Finding F-10 — 11 Test cases trong `civilizationView.test.ts` bị loại khỏi pipeline
- **Mức độ:** **P2 (Medium)**
- **Root cause:** Tệp test `__tests__/ui/civilizationView.test.ts` import 6 components từ `src/ui/components/civilization/`. Vì các components này chưa được tạo, tệp test tạm thời bị exclude trong `tsconfig.json` và `package.json` để tránh lỗi compile.
- **File liên quan:** `package.json:12`, `tsconfig.json:27`, `__tests__/ui/civilizationView.test.ts`.
- **Phương án xử lý:**
  - Triển khai đầy đủ 6 components Civilization tuân thủ đúng contract và interfaces mà bài test đang kiểm tra.
  - Xóa dòng exclude trong `tsconfig.json`.
  - Cập nhật script `test` trong `package.json` để bổ sung `__tests__/ui/civilizationView.test.ts`.
  - Chạy `npm test` xác nhận 382/382 tests PASS (371 tests cũ + 11 tests mới).
- **Rủi ro:** Tuyệt đối không được sửa đổi các assertion của bài test nhằm ép test PASS giả tạo.
- **Acceptance criteria:** 11/11 tests trong `civilizationView.test.ts` đều PASS $100\%$ khi chạy trong pipeline chính thức.

### 4. Finding F-11 — Vite Deprecation Warning đối với `__dirname`
- **Mức độ:** **P3 (Low)**
- **Root cause:** `vite.config.ts` dòng 11 sử dụng `__dirname` trong module ESM (`"type": "module"`). Vite 8 phát cảnh báo khuyên dùng `import.meta.dirname`.
- **File liên quan:** `vite.config.ts:11`.
- **Phương án xử lý:** Thay thế `__dirname` bằng `import.meta.dirname` hoặc `path.resolve('.')`.
- **Rủi ro:** Không có rủi ro logic.
- **Acceptance criteria:** `npm run build` không còn xuất hiện dòng cảnh báo `configLoader: 'native'`.

---

## D. KIẾN TRÚC 6 CIVILIZATION COMPONENTS (`src/ui/components/civilization/`)

Kiến trúc tuân thủ nguyên tắc **Shared UI Architecture: Real Extension First, Preview-Ready**. Mọi components sử dụng chung cho cả Extension thật và Standalone Preview.

```
src/ui/components/civilization/
├── CivilizationHeader.tsx      # Top status bar: Era, Coins, Lifetime Focus, Bonus Badge, Placement Banner
├── MapGridView.tsx             # Interactive Map Grid: Coordinates, Pan/Zoom, Buildings, Placement Hover Preview
├── BuildingCatalogPanel.tsx    # Slide-up Catalog drawer: Category filter, Costs, Lock gates (Level & Focus)
├── BuildingDetailsModal.tsx    # Building inspect dialog: Footprint, Position, Demolish confirmation
├── LandExpansionModal.tsx      # Orthogonal expansion modal: Cardinal directions, Territory stats
└── CivilizationScreen.tsx      # Root coordinator container: State loading, Modal toggles, Escape handler
```

### 4.1. `CivilizationHeader.tsx`
- **Trách nhiệm:** Thanh trạng thái và điều hướng nhanh của màn hình văn minh.
- **Props Interface:**
  ```typescript
  interface CivilizationHeaderProps {
    era: string;                               // e.g. 'STONE_AGE' -> render 'Stone Age'
    focusCoins: number;                        // Số dư Coins hiển thị
    lifetimeFocusMinutes: number;              // Tổng số phút Focus trọn đời (hiển thị '75m')
    activeBonusRate: number;                   // Tỷ lệ CoinBonus đang kích hoạt (e.g. 0.05 -> '+5%')
    isPlacementMode: boolean;                  // Đang ở chế độ đặt công trình hay không
    selectedBuildingDef: BuildingDefinition | null; // Định nghĩa công trình đang chuẩn bị đặt
    onCancelPlacement: () => void;             // Hủy bỏ placement mode (Esc hoặc bấm Cancel)
    onOpenCatalog: () => void;                 // Mở Building Catalog Panel
    onOpenExpansion: () => void;               // Mở Land Expansion Modal
  }
  ```
- **Hành vi hiển thị:**
  - Bình thường: Hiển thị Era (`Stone Age`), Coins, Lifetime Focus (`Xm`), Badge CoinBonus (`+X% Bonus`), nút `Build` (mở catalog) và nút `Expand` (mở la bàn mở rộng đất).
  - Khi `isPlacementMode === true`: Hiển thị dải banner nổi bật với thông báo `Placing [Tên công trình] ([w]x[h])`, hướng dẫn "Click ô để đặt" và nút `Cancel (Esc)`.

### 4.2. `MapGridView.tsx`
- **Trách nhiệm:** Canvas/SVG lưới bản đồ tương tác trung tâm với độ mượt mà cao trong không gian $400\text{px}$.
- **Props Interface:**
  ```typescript
  interface MapGridViewProps {
    civilizationState: CivilizationState;       // Chứa grid snapshot và danh sách buildings
    placementDef: BuildingDefinition | null;    // Công trình đang chọn đặt (hoặc null)
    onPlaceBuilding: (pos: GridCoordinate) => void; // Callback khi click ô hợp lệ
    onInspectBuilding: (inst: BuildingInstance) => void; // Callback khi click công trình đã xây
    isSubmitting?: boolean;                     // Cờ khóa tương tác khi đang gửi request
  }
  ```
- **Hành vi & Thuật toán tương tác:**
  - **Dynamic Bounding Box:** Tự động tính toán vùng bao quanh toàn bộ các chunks (hỗ trợ cả chunk có tọa độ âm $x < 0, y < 0$ khi mở rộng về phía Bắc hoặc Tây).
  - **Pan & Zoom:** Kéo rê chuột để di chuyển bản đồ (`drag-to-pan`). Ngưỡng di chuyển $4\text{px}$ để phân biệt rõ click chọn công trình với kéo bản đồ. Phóng to / thu nhỏ bằng bánh xe chuột (`wheel`) và thanh điều khiển nổi: `[-]`, `[100%]`, `[+]`, `[Recenter]` trong khoảng $[0.6\times, 2.0\times]$.
  - **Hiển thị công trình:** Render các thẻ công trình chiếm đúng diện tích footprint $w \times h$ cells, màu sắc phân biệt theo Category (Decorative: hổ phách, Focus Support: chàm, Economy: xanh ngọc), hiển thị nhãn Level `Lv.X` và icon.
  - **Placement Hover Preview:** Khi di chuột trên lưới ở chế độ xây dựng, hiển thị footprint thời gian thực. Kiểm tra trực tiếp tại client qua `GridMap`:
    - Nếu vị trí hợp lệ (nằm trong đất đã mở khóa, không va chạm): viền xanh ngọc `border-emerald-400 bg-emerald-500/30` với chữ `✓ Place`.
    - Nếu không hợp lệ: viền đỏ `border-rose-500 bg-rose-500/35` với nhãn `✕ Outside territory` hoặc `✕ Cell occupied`.

### 4.3. `BuildingCatalogPanel.tsx`
- **Trách nhiệm:** Ngăn kéo (bottom sheet/drawer) danh mục công trình thời kỳ đồ đá.
- **Props Interface:**
  ```typescript
  interface BuildingCatalogPanelProps {
    isOpen: boolean;                           // Trạng thái mở/đóng (isOpen=false trả về null)
    onClose: () => void;                       // Đóng panel
    playerLevel: number;                       // Level người chơi (dùng cho unlock gate)
    playerCoins: number;                       // Số dư Coins người chơi
    lifetimeFocusMinutes: number;              // Thời gian Focus tích lũy trọn đời
    onSelectBuilding: (def: BuildingDefinition) => void; // Chọn công trình để vào placement mode
  }
  ```
- **Hành vi hiển thị:**
  - Bộ lọc danh mục: `All`, `Decor`, `Focus Support`, `Economy`.
  - Hiển thị danh sách công trình Stone Age: Campfire, Ancient Totem, Meditation Cave, Foraging Post, Primitive Granary.
  - Cổng mở khóa nghiêm ngặt: Nếu chưa đủ Level (`Locked Lv. 2`) hoặc chưa đủ Focus (`Locked 100m Focus`), nút Build bị disabled và ghi rõ lý do. Nếu thiếu Coins, hiển thị `Need X Coins`.

### 4.4. `BuildingDetailsModal.tsx`
- **Trách nhiệm:** Modal xem thông số và quản trị công trình đã đặt trên bản đồ.
- **Props Interface:**
  ```typescript
  interface BuildingDetailsModalProps {
    building: BuildingInstance | null;          // Công trình được chọn xem (hoặc null nếu đóng)
    onClose: () => void;                        // Đóng modal
    onRemove: (instanceId: string) => Promise<void>; // Tháo dỡ công trình
    isSubmitting?: boolean;                     // Đang gửi request hay không
  }
  ```
- **Hành vi hiển thị:**
  - Hiển thị tên công trình, tọa độ neo `(x, y)`, kích thước footprint, ngày xây dựng, level hiện tại.
  - Khu vực Nâng cấp: Hiển thị chi phí nâng cấp và ghi chú rõ ràng `Milestone 5C` (tính năng nâng cấp sẽ mở khóa ở Phase 5C, không fake upgrade).
  - Khu vực Tháo dỡ: Nút `Demolish Building` có bước xác nhận `Confirm Demolish` để tránh người dùng click nhầm.

### 4.5. `LandExpansionModal.tsx`
- **Trách nhiệm:** Modal mở rộng lãnh thổ trực giao 4 hướng.
- **Props Interface:**
  ```typescript
  interface LandExpansionModalProps {
    isOpen: boolean;                           // Trạng thái mở/đóng
    onClose: () => void;                       // Đóng modal
    chunksCount: number;                       // Số lượng chunk hiện tại (e.g. 4 Chunks)
    totalUnlockedCells: number;                // Tổng số cells đã mở khóa (e.g. 400 cells)
    onExpand: (direction: ExpansionDirection) => Promise<void>; // Callback gửi lệnh mở rộng
    isSubmitting?: boolean;                    // Khóa nút khi đang xử lý
  }
  ```
- **Hành vi hiển thị:**
  - Hiển thị tiêu đề `Territory Expansion`, thống kê lãnh thổ hiện tại (`X Chunks · Y cells`).
  - Bộ nút la bàn 4 hướng trực giao: `North`, `East`, `West`, `South`. Bấm hướng tương ứng sẽ gọi `onExpand(direction)`.

### 4.6. `CivilizationScreen.tsx`
- **Trách nhiệm:** Container điều phối toàn diện màn hình Civilization.
- **Props Interface:**
  ```typescript
  interface CivilizationScreenProps {
    lifetimeFocusMinutes?: number;              // Nhận từ App.tsx (authoritative lifetime minutes)
  }
  ```
- **Nhiệm vụ quản lý State & Kết nối:**
  - Tải `CivilizationState` ban đầu và lắng nghe đồng bộ khi có thay đổi.
  - Quản lý trạng thái: `isPlacementMode`, `selectedBuildingDef`, `catalogOpen`, `expansionOpen`, `inspectedBuilding`.
  - Lắng nghe phím `Escape` trên toàn màn hình để hủy placement mode hoặc đóng các modal đang mở.
  - Ngăn chặn double-click submit khi giao dịch đang được thực thi.
  - Hiển thị banner thông báo lỗi nếu background trả về lỗi transaction (như không đủ coin hoặc va chạm).

---

## E. SƠ ĐỒ LUỒNG DỮ LIỆU & GIAO THỨC TIN NHẮN (DATA FLOW)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REACT UI (POPUP 400PX)                          │
│                                                                        │
│   CivilizationScreen ──> MapGridView / Catalog / Details / Expansion   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1. sendExtensionMessage(Action, Payload)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             UI BRIDGE & CLIENT (src/ui/services/extensionClient.ts)     │
│   - Live Extension: chrome.runtime.sendMessage(msg)                    │
│   - Standalone Preview: simulateMessageResponse() (In-Memory Simulator)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 2. Chrome MV3 Runtime Message IPC
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              BACKGROUND WORKER (src/background/messageHandler.ts)      │
│   - Runtime Payload Validation (kiểm tra kiểu, tọa độ, definitionId)   │
│   - Routing tới CivilizationCoordinator                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 3. Coordinator Method Call
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         COORDINATOR (src/background/civilizationCoordinator.ts)        │
│   - Thực thi Giao dịch Nguyên tử executeCivilizationTransaction()      │
│   - Độc quyền chạy dưới StorageMutex                                   │
│   - Kiểm tra điều kiện mở khóa (Level, Lifetime Focus, Era)            │
│   - Kiểm tra va chạm & Footprint qua GridMap Core Engine               │
│   - Trừ Coins chính xác, cập nhật cachedBonuses đồng bộ                │
│   - Atomic Rollback Compensation nếu ghi storage lỗi                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 4. Storage Read/Write under Mutex
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             STORAGE LAYER (src/storage/storageManager.ts)              │
│   - STORAGE_KEYS.CIVILIZATION ('fq_civilization')                      │
│   - STORAGE_KEYS.ECONOMY ('fq_economy')                                │
└────────────────────────────────────────────────────────────────────────┘
```

### Bảng chi tiết từng bước luồng dữ liệu:

| Bước | Thao tác | File & Hàm liên quan | Dữ liệu đầu vào | Dữ liệu đầu ra | Xử lý lỗi / Cơ chế an toàn |
|:---:|---|---|---|---|---|
| **1** | Người chơi click đặt công trình trên lưới | `MapGridView.tsx` $\to$ `CivilizationScreen.tsx` | `GridCoordinate { x, y }`, `BuildingDefinition` | Gọi `placeBuildingClient()` | Kiểm tra sơ bộ hợp lệ tại client (hover preview xanh/đỏ) |
| **2** | Gửi tin nhắn qua Bridge | `extensionClient.ts: placeBuildingClient` | `PlaceBuildingPayload { buildingDefinitionId, position }` | `MessageResponse<PlaceBuildingResponseData>` | Bọc `try/catch`, timeout an toàn, fallback simulator nếu không có runtime |
| **3** | Tiếp nhận & Validate runtime | `messageHandler.ts: handleMessage` | `ExtensionMessage: 'PLACE_BUILDING'` | Chuyển tới Coordinator hoặc trả `{ success: false }` | Validate `isValidCoordinate(position)`, check `buildingDefinitionId` không rỗng |
| **4** | Điều phối giao dịch nguyên tử | `civilizationCoordinator.ts: commitBuildingPlacement` | `definitionId`, `position` | Snapshot `CivilizationState` và `PlayerEconomy` mới | Toàn bộ nằm trong `executeCivilizationTransaction` dưới `StorageMutex`. Tự động rollback nếu fail |
| **5** | Kiểm tra hình học & va chạm | `gridMap.ts: canPlaceBuilding`, `placementValidator.ts` | `GridMap`, `footprint`, `position` | `boolean` (true nếu trống và trong đất) | Từ chối đặt đè lên công trình khác hoặc ra ngoài vùng đất đã mở khóa |
| **6** | Ghi lưu trữ nguyên tử | `storageManager.ts: setMultiple` | New State & New Economy Balance | `Promise<void>` | Ghi 2 keys đồng thời. Nếu storage lỗi ném exception kích hoạt rollback |
| **7** | Trả kết quả về UI | `messageHandler.ts` $\to$ `extensionClient.ts` | Response object chuẩn | `PlaceBuildingResponseData` | UI nhận dữ liệu và cập nhật ngay lập tức `civilizationState` |

---

## F. KẾ HOẠCH UI/UX TRONG KHÔNG GIAN POPUP 400PX

### 1. Thách thức không gian hiển thị
- Kích thước popup Chrome cố định: **$400\text{px}$ chiều rộng** và khoảng **$580\text{px} - 600\text{px}$ chiều cao**.
- Bản đồ lưới $20 \times 20$ cells (và mở rộng thêm) nếu hiển thị toàn bộ sẽ vượt quá kích thước màn hình.

### 2. Giải pháp thiết kế tối ưu
1. **Phân bổ bố cục dọc (Vertical Layout Budget):**
   - Header cố định: $\sim 52\text{px}$ (hiển thị Era, Coins, Lifetime Focus, Bonus Badge, các nút thao tác).
   - Navbar cố định bên dưới Header: $\sim 44\text{px}$ (4 tabs: Quest, Civ, Allowlist, Stats).
   - Khung bản đồ `MapGridView`: chiếm trọn vẹn toàn bộ chiều cao còn lại ($\sim 480\text{px} - 500\text{px}$).
   - Các modal và catalog hiển thị dạng overlay/bottom-sheet đè lên trên bản đồ khi mở ra, không chiếm diện tích vĩnh viễn.
2. **Khắc phục xung đột Pan/Zoom với Scroll Popup:**
   - Trong `MapGridView.tsx`, container của bản đồ được thiết lập `overflow: hidden`, `touch-action: none`.
   - Toàn bộ thao tác kéo rê bản đồ được xử lý nội bộ bằng translate matrix `transform: translate(panX, panY) scale(zoom)`, cô lập hoàn toàn không làm cuộn cửa sổ popup extension.
   - Thao tác cuộn chuột (`wheel`) trên bản đồ được chặn `e.preventDefault()` để zoom camera thay vì cuộn trang.
3. **Thanh công cụ Camera Controls tinh gọn:**
   - Đặt ở góc dưới bên phải bản đồ: gồm 4 nút nhỏ gọn `[-]`, `[100%]`, `[+]`, `[Recenter]` với `z-index: 10`, nền bán trong suốt `backdrop-blur-md bg-white/80 dark:bg-slate-900/80`.
   - Cô lập sự kiện click chuột trên toolbar (`e.stopPropagation()`) để tránh việc bấm nút zoom bị nhận nhầm thành click đặt công trình lên ô đất bên dưới.
4. **Hiệu năng render (Performance & Re-render Prevention):**
   - Tách biệt state vị trí chuột hover (`hoverCoord`) khỏi state cấu trúc bản đồ `CivilizationState`.
   - Sử dụng `React.memo` cho các ô lưới và thẻ công trình tĩnh để khi di chuột di chuyển preview không phải render lại toàn bộ 400 cells.

---

## G. KẾ HOẠCH KIỂM THỬ & NGHIỆM THU

### 1. Khôi phục và Thực thi 11 Tests trong `civilizationView.test.ts`
1. `Civilization Client: getCivilizationState returns initial Stone Age state`: Xác minh nạp trạng thái khởi tạo $20 \times 20$ (4 chunks) và Era `STONE_AGE`.
2. `Civilization Client: placeBuildingClient validates placement, deducts coins and updates grid`: Xác minh đặt Campfire trừ 15 coins, từ chối va chạm, từ chối ngoài ranh giới, tháo dỡ giải phóng ô và đặt lại thành công.
3. `Civilization Client: expandLandClient expands territory in cardinal directions`: Xác minh mở rộng phía Đông (tăng lên 5 chunks) và phía Bắc (tọa độ âm, tăng lên 6 chunks).
4. `Civilization UI: CivilizationHeader renders Stone Age era, coins, focus, and bonus`: Kiểm tra render đúng chữ 'Stone Age', '75m', '+5%' và nút 'Build'.
5. `Civilization UI: CivilizationHeader in placement mode displays active banner and cancel button`: Kiểm tra hiển thị banner 'Placing Campfire' và nút 'Cancel (Esc)'.
6. `Civilization UI: BuildingCatalogPanel renders definitions, costs, and unlock gates`: Kiểm tra render đầy đủ catalog, chi phí và cổng mở khóa 'Lv. 2'.
7. `Civilization UI: BuildingCatalogPanel returns null when isOpen is false`: Đảm bảo unmount sạch sẽ khi panel đóng.
8. `Civilization UI: BuildingDetailsModal renders building information and demolish action`: Kiểm tra hiển thị tọa độ '(3, 4)', nút 'Demolish Building', và ghi chú 'Milestone 5C'.
9. `Civilization UI: LandExpansionModal renders directional options and territory stats`: Kiểm tra tiêu đề 'Territory Expansion', '4 Chunks', '400 cells', và 4 hướng North, East, West, South.
10. `Civilization UI: MapGridView renders chunks and zoom camera controls`: Kiểm tra render chỉ số zoom '100%', nút zoom in và zoom out.
11. `Civilization UI: Navbar includes Civ tab and App switches to Civilization view`: Kiểm tra chuyển view tab Civ trong `App.tsx`.

### 2. Kiểm tra hồi quy toàn diện (Regression Test Suite)
- **Timer & Pomodoro Lifecycle:** 20 tests trong `lifecycleRecovery.test.ts` (All-or-Nothing, Zero Downtime, Heartbeat Mutex).
- **Session Integrity & Rewards:** 16 tests trong `sessionIntegrity.test.ts`, 6 tests trong `milestone5b43a_reward_and_stopwatch.test.ts`.
- **Core Civilization Engine:** 8 tests trong `buildingCatalog.test.ts`, 9 tests trong `civilizationState.test.ts`, 13 tests trong `civilizationMessages.test.ts`, 5 tests trong `civilizationBonusIntegration.test.ts`.
- **Storage & Migrations:** 15 tests trong `storageAudit.test.ts`, 5 tests trong `v2Migration.test.ts`.
- **Tổng số test sau khi khôi phục:** **382 / 382 tests PASS (100%)**.

### 3. Packaging & Build Acceptance Gates
- `npm run lint` (`tsc --noEmit`): **0 errors, 0 warnings**.
- `npm run build`: Tạo ra đầy đủ `dist/background.js`, `dist/index.html`, `dist/manifest.json`, `dist/blocked.html`, `dist/assets/`.
- Nạp thử nghiệm `dist/` vào trình duyệt Chrome MV3 dưới dạng Unpacked Extension xác nhận Service Worker hoạt động không bị lỗi.

---

## H. LỘ TRÌNH TRIỂN KHAI 8 GIAI ĐOẠN (RECOMMENDED ROADMAP)

Lộ trình được thiết kế theo nguyên tắc **Dependency-First: giải quyết nền tảng build/package trước, sau đó xây dựng UI components từ dưới lên, tích hợp container, khôi phục test và nghiệm thu toàn diện**.

```
[Giai đoạn 1: Sửa F-08 & F-09] ──> [Giai đoạn 2: Sửa F-11 & Cấu hình Build]
                │
                ▼
[Giai đoạn 3: Triển khai 4 Sub-Components (Header, Catalog, Details, Expansion)]
                │
                ▼
[Giai đoạn 4: Triển khai MapGridView (Lưới, Pan/Zoom, Hover Preview)]
                │
                ▼
[Giai đoạn 5: Triển khai CivilizationScreen & Tích hợp App.tsx]
                │
                ▼
[Giai đoạn 6: Khôi phục 11 Tests trong civilizationView.test.ts (F-10)]
                │
                ▼
[Giai đoạn 7: Kiểm chứng Preview/Extension Parity & UI Smoke Test]
                │
                ▼
[Giai đoạn 8: Build đóng gói & Nghiệm thu tổng thể Milestone 5B.4.3C]
```

---

### GIAI ĐOẠN 1: ĐỒNG BỘ ĐỊNH DANH PACKAGE & SỬA F-09
- **Mục tiêu:** Đồng bộ tên package chính thức `"focus-quest"` theo đúng yêu cầu Product Spec.
- **Tệp tin thay đổi:** `package.json`, `package-lock.json`.
- **Công việc cụ thể:**
  1. Cập nhật `package.json` dòng 2: `"name": "focus-quest"`.
  2. Đồng bộ `package-lock.json`.
- **Dependencies:** Không có.
- **Rủi ro:** Không có.
- **Acceptance criteria:** `package.json` có `"name": "focus-quest"`, chạy `npm test` vẫn bình thường.
- **Điều kiện chuyển giai đoạn:** Typecheck và test giữ nguyên 371 tests PASS.

---

### GIAI ĐOẠN 2: CẤU HÌNH PRODUCTION BUILD VITE CHO SERVICE WORKER (F-08 & F-11)
- **Mục tiêu:** Đóng gói thành công `dist/background.js` từ `src/background/index.ts` và loại bỏ cảnh báo `__dirname`.
- **Tệp tin thay đổi:** `vite.config.ts`.
- **Công việc cụ thể:**
  1. Thay `__dirname` bằng `import.meta.dirname` để sửa triệt để Finding F-11.
  2. Bổ sung cấu hình `build.rollupOptions` đa đầu vào:
     - Entry 1: `popup` trỏ tới `index.html`.
     - Entry 2: `background` trỏ tới `src/background/index.ts`.
  3. Cấu hình `output.entryFileNames` để xuất chính xác `dist/background.js`.
  4. Chạy `npm run build` và kiểm tra sự hiện diện của `dist/background.js`.
- **Dependencies:** Giai đoạn 1 hoàn thành.
- **Rủi ro:** Cần đảm bảo `background.js` không import các thư viện DOM của React, giữ dung lượng tối ưu.
- **Acceptance criteria:**
  - `dist/background.js` được tạo thành công với kích thước hợp lệ ($\sim 70\text{kB}$).
  - Không còn cảnh báo deprecation Vite.
- **Điều kiện chuyển giai đoạn:** Build thành công, `dist/` chứa đủ cả `index.html` và `background.js`.

---

### GIAI ĐOẠN 3: XÂY DỰNG 4 SUB-COMPONENTS GIAO DIỆN VĂN MINH
- **Mục tiêu:** Tạo thư mục `src/ui/components/civilization/` và xây dựng 4 components phụ trợ.
- **Tệp tin thay đổi:**
  - `src/ui/components/civilization/CivilizationHeader.tsx`
  - `src/ui/components/civilization/BuildingCatalogPanel.tsx`
  - `src/ui/components/civilization/BuildingDetailsModal.tsx`
  - `src/ui/components/civilization/LandExpansionModal.tsx`
- **Công việc cụ thể:**
  1. Triển khai `CivilizationHeader.tsx` đáp ứng chuẩn các props và test case 4, 5.
  2. Triển khai `BuildingCatalogPanel.tsx` đáp ứng chuẩn các props và test case 6, 7 (render null khi `isOpen=false`, hiển thị unlock gate).
  3. Triển khai `BuildingDetailsModal.tsx` đáp ứng chuẩn các props và test case 8 (hiển thị tọa độ, footprint, demolish confirm, thông tin Milestone 5C).
  4. Triển khai `LandExpansionModal.tsx` đáp ứng chuẩn các props và test case 9 (hiển thị 4 hướng la bàn, số chunks/cells).
- **Dependencies:** Giai đoạn 2 hoàn thành.
- **Rủi ro:** Cần tuân thủ chính xác tên các chuỗi text mà bài test kiểm tra ('Stone Age', '75m', '+5%', 'Build', 'Placing', 'Cancel (Esc)', 'Lv. 2', 'Demolish Building', 'Milestone 5C', 'Territory Expansion', 'North', 'East', 'West', 'South').
- **Acceptance criteria:** Các components compile không lỗi TypeScript (`tsc --noEmit`).
- **Điều kiện chuyển giai đoạn:** 4 components sẵn sàng để `MapGridView` và `CivilizationScreen` ghép nối.

---

### GIAI ĐOẠN 4: XÂY DỰNG MAP GRID VIEW & ENGINE PAN/ZOOM
- **Mục tiêu:** Triển khai `src/ui/components/civilization/MapGridView.tsx` với đầy đủ khả năng pan, zoom, render công trình và hover placement preview.
- **Tệp tin thay đổi:** `src/ui/components/civilization/MapGridView.tsx`.
- **Công việc cụ thể:**
  1. Xây dựng hệ thống tọa độ tự động tính bounding box từ các chunks.
  2. Triển khai cơ chế Pan chuột (threshold $4\text{px}$) và Zoom camera ($0.6\times - 2.0\times$).
  3. Render các nút điều khiển camera nổi: `[-]`, `[100%]`, `[+]`, `[Recenter]` với tooltip và `title="Zoom In"`, `title="Zoom Out"`.
  4. Render các thẻ công trình chiếm đúng footprint, hiển thị Level, Icon, nhãn CoinBonus.
  5. Triển khai Hover Preview: kiểm tra validation `GridMap` trực tiếp để đổi màu xanh ngọc (`✓ Place`) hoặc đỏ (`✕ Outside territory` / `✕ Cell occupied`).
- **Dependencies:** Giai đoạn 3 hoàn thành.
- **Rủi ro:** Đảm bảo không bị click xuyên thấu từ toolbar camera hoặc building xuống ô đất bên dưới.
- **Acceptance criteria:** Đáp ứng trọn vẹn test case 10 (`MapGridView renders chunks and zoom camera controls`), compile sạch.
- **Điều kiện chuyển giai đoạn:** `MapGridView` hoạt động độc lập và sẵn sàng đưa vào container.

---

### GIAI ĐOẠN 5: XÂY DỰNG CONTAINER CIVILIZATION SCREEN & TÍCH HỢP APP.TSX
- **Mục tiêu:** Xây dựng container `CivilizationScreen.tsx` và gắn vào tab `Civ` của `src/App.tsx`.
- **Tệp tin thay đổi:**
  - `src/ui/components/civilization/CivilizationScreen.tsx`
  - `src/App.tsx`
- **Công việc cụ thể:**
  1. Triển khai `CivilizationScreen.tsx`:
     - Nạp `CivilizationState` từ `extensionClient`.
     - Quản lý state cho placement mode, catalog drawer, expansion modal, details modal.
     - Lắng nghe phím `Escape` để hủy placement hoặc đóng modal.
     - Xử lý các giao dịch đặt công trình, tháo dỡ, mở rộng đất với cờ `isSubmitting` chống double-click.
  2. Trong `src/App.tsx`:
     - Import `CivilizationScreen`.
     - Thay thế đoạn placeholder tĩnh tại `activeTab === 'civilization'` bằng `<CivilizationScreen lifetimeFocusMinutes={lifetimeFocusMinutes} />`.
- **Dependencies:** Giai đoạn 3 và 4 hoàn thành.
- **Rủi ro:** Đảm bảo trạng thái Focus session đang chạy vẫn duy trì ổn định khi chuyển qua lại giữa tab `Quest` và tab `Civ`.
- **Acceptance criteria:** Đáp ứng trọn vẹn test case 11 (`Navbar includes Civ tab and App switches to Civilization view`).
- **Điều kiện chuyển giai đoạn:** Giao diện popup render hoàn chỉnh màn hình văn minh khi chuyển tab.

---

### GIAI ĐOẠN 6: KHÔI PHỤC VÀ KÍCH HOẠT 11 TESTS TRONG PIPELINE (SỬA F-10)
- **Mục tiêu:** Đưa toàn bộ test suite `civilizationView.test.ts` trở lại pipeline kiểm thử chính thức.
- **Tệp tin thay đổi:** `tsconfig.json`, `package.json`.
- **Công việc cụ thể:**
  1. Trong `tsconfig.json`: xóa exclude `"__tests__/ui/civilizationView.test.ts"`.
  2. Trong `package.json`: bổ sung `__tests__/ui/civilizationView.test.ts` vào script `test`.
  3. Thực thi `npm test` và `npm run lint`.
- **Dependencies:** Giai đoạn 5 hoàn thành.
- **Rủi ro:** Nếu có sai khác về text assertion giữa components và bài test, cần rà soát lại source code component để đồng bộ đúng đặc tả.
- **Acceptance criteria:**
  - `npm test` chạy thành công **382 / 382 tests PASS (100%)**.
  - `npm run lint` đạt **0 errors, 0 warnings**.
- **Điều kiện chuyển giai đoạn:** 11/11 tests UI Civilization PASS trọn vẹn cùng 371 tests cũ.

---

### GIAI ĐOẠN 7: KIỂM CHỨNG TÍNH NHẤT QUÁN PREVIEW VÀ EXTENSION (PARITY AUDIT)
- **Mục tiêu:** Xác minh tính đồng nhất giữa môi trường Standalone Web Preview và Chrome Extension thực tế.
- **Tệp tin kiểm tra:** `src/App.tsx`, `src/ui/services/extensionClient.ts`.
- **Công việc cụ thể:**
  1. Kiểm tra chế độ Extension thật (`isChromeExtension() === true`): render thuần túy khung popup $400\text{px}$.
  2. Kiểm tra chế độ Web Preview (`isChromeExtension() === false`): render khung demo Chrome mockup với đầy đủ nhãn tương tác.
  3. Kiểm tra các thao tác đặt công trình, tháo dỡ, mở rộng đất hoạt động mượt mà trên simulation fallback của `extensionClient.ts`.
  4. Xác nhận không có mock fixtures lọt vào extension thật.
- **Dependencies:** Giai đoạn 6 hoàn thành.
- **Acceptance criteria:** Giao diện hiển thị sắc nét, responsive, không có lỗi console hay crash component.
- **Điều kiện chuyển giai đoạn:** Sẵn sàng cho build nghiệm thu cuối cùng.

---

### GIAI ĐOẠN 8: BUILD ĐÓNG GÓI & NGHIỆM THU TỔNG THỂ MILESTONE 5B.4.3C
- **Mục tiêu:** Build sản phẩm production hoàn chỉnh, kiểm tra artifacts và đóng gói bàn giao.
- **Công việc cụ thể:**
  1. Chạy `npm run clean` và `npm run build`.
  2. Kiểm tra cấu trúc thư mục `dist/`:
     - `dist/manifest.json`
     - `dist/background.js`
     - `dist/index.html`
     - `dist/blocked.html`
     - `dist/icons/`
     - `dist/assets/*.js`, `dist/assets/*.css`
  3. Chạy `npm test` lần cuối kiểm chứng 382/382 tests PASS.
  4. Soạn thảo Báo cáo Nghiệm thu Tổng kết Milestone 5B.4.3C vào `respond.md`.
- **Dependencies:** Toàn bộ các giai đoạn 1–7 hoàn tất.
- **Acceptance criteria:** Mọi tiêu chí của Milestone 5B.4.3C đạt trạng thái **FULL PASS**.

---

## I. CÁC VẤN ĐỀ CẦN LÀM RÕ & XÁC NHẬN TỪ NGƯỜI DÙNG

### 1. Về định danh chính thức của ISS-06 và ISS-07
- **Kết quả rà soát tài liệu:**
  - Trong toàn bộ các tài liệu nguồn chính thức (`PRODUCT_SPEC.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`), **hoàn toàn không có văn bản hoặc ticket mô tả riêng cho mã `ISS-06` và `ISS-07`**.
  - Các mã issue khác như `ISS-01, 03, 04, 05, 09` đã được định nghĩa và kiểm thử tại `milestone5b43a_reward_and_stopwatch.test.ts`.
  - Cụm từ `(Civilization-first UI, ISS-06, ISS-07)` xuất hiện từ ghi chú bàn giao và báo cáo kiểm toán trước đó.
- **Diễn giải kỹ thuật hiện tại:**
  - `ISS-06`: Được hiểu là việc hoàn thiện và tích hợp bộ 6 components Civilization vào giao diện trung tâm (`Civilization-first UI`), thay thế placeholder tĩnh tại tab `Civ`.
  - `ISS-07`: Được hiểu là việc hoàn thiện tương tác bản đồ lưới (`MapGridView`), khả năng pan/zoom và hiển thị modal trong giới hạn khung popup $400\text{px}$.
- **Yêu cầu xác nhận từ Người dùng:**
  - Đề nghị Người dùng xác nhận: Diễn giải trên đã bao hàm đầy đủ kỳ vọng của Người dùng cho `ISS-06` và `ISS-07` hay Người dùng có tài liệu/yêu cầu cụ thể nào khác cho hai mã này không?

### 2. Về Tab hiển thị mặc định khi mở Popup
- **Hiện trạng:** Khi mở popup, `App.tsx` khởi tạo `activeTab = 'timer'` (tab Quest Timer).
- **Câu hỏi xác nhận:** Thuật ngữ "Civilization-first UI" có yêu cầu đổi tab mặc định ban đầu thành `'civilization'` (mở ra thấy bản đồ văn minh trước) hay giữ nguyên mặc định là `'timer'` (mở ra thấy đồng hồ trước, có tab Civ cân đối trên Navbar)?
  - *Khuyến nghị của Kỹ sư:* Giữ nguyên tab mặc định là `'timer'` để phục vụ nhu cầu bấm giờ nhanh khi học tập, đồng thời hiển thị tab `Civ` nổi bật với icon Landmark và chấm báo hiệu phiên đang chạy; hoặc cho phép người chơi chuyển đổi mượt mà.

---

## J. KẾT LUẬN & ĐỀ XUẤT HÀNH ĐỘNG

1. **Mức độ sẵn sàng:** Repository Focus Quest hiện đang ở trạng thái **HOÀN TOÀN ĐỦ ĐIỀU KIỆN KỸ THUẬT** để triển khai Milestone 5B.4.3C. Nền tảng Core Engine, Storage Transactions và Message Handlers đã vững chắc $100\%$.
2. **Kế hoạch hành động:** Kế hoạch 8 giai đoạn nêu trên đã phân lập rõ ràng các dependencies, rủi ro và tiêu chí nghiệm thu từng bước.
3. **Trạng thái dừng:** Đúng theo quy định, **chưa có bất kỳ thay đổi nào được thực hiện trên mã nguồn**.

**Chúng tôi đã sẵn sàng bắt tay vào Giai đoạn 1 ngay khi nhận được sự phê duyệt chính thức từ Quý người dùng!**
