# KẾ HOẠCH TRIỂN KHAI MILESTONE 5B.5 — UI REDESIGN & NAVIGATION RESTRUCTURE

**Vai trò:** Senior Product-Minded Frontend Architect  
**Phạm vi tài liệu:** Thiết kế kiến trúc, IA, UX/UI, hợp đồng dữ liệu, kế hoạch i18n, phân tích tác động kiểm thử và lộ trình thi công **Milestone 5B.5** (thực hiện **TRƯỚC Milestone 5C** — Era Progression & Building Upgrades).  
**Trạng thái hiện tại:** **KẾ HOẠCH CHÍNH THỨC (ĐÃ BAO GỒM 8 ĐIỀU CHỈNH + ĐC-1..ĐC-12 — 15 GIAI ĐOẠN)**. Bản sao báo cáo trước nằm tại `respond_template_cleanup_report.md`.

### ĐIỀU CHỈNH BỔ SUNG (ĐC-5, ĐC-6, ĐC-7, ĐC-8, ĐC-9, ĐC-10, ĐC-11 & ĐC-12)
- **ĐC-5:** Đổi thứ tự lộ trình thực thi thành **`1a → 5a → 5b → 4 → 1b → 3 → 2a → 2b → 5c → 6 → 7`**. Việc thêm `RENAME_PROFILE`, `DELETE_PROFILE`, `GET_ACTIVE_PROFILE` vào simulator (`extensionClient.ts`) chuyển sang **Giai đoạn 5b**; việc thêm `GET_DAILY_STATS` vào simulator chuyển sang **Giai đoạn 3**.
- **ĐC-6:** Ở **Giai đoạn 5a**, tab `Quest` chỉ là khung tạm (`Coming soon`, chưa có huy hiệu chưa nhận hay danh sách quest thật); `Profile/Allowlist` giữ lối vào tạm (qua nút chỉnh Profile trong `TimerView` / huy hiệu khiên trên Header khi chạy phiên) đến khi **Giai đoạn 5b** thay bằng `ProfileBottomSheet`.
- **ĐC-7:** Việc i18n cho `RewardHelpModal` chuyển sang **Giai đoạn 6** (quét i18n tổng). Script `"test"` trong `package.json` phải dùng glob `__tests__/ui/*.test.ts` thay vì liệt kê từng file.
- **ĐC-8:** Bố cục màn hình ĐANG TẬP TRUNG trong `TimerView`: (a) khu vực trên cùng là component mới `FocusSceneArea` (5b-2 chỉ dùng hình giữ chỗ tĩnh CSS/SVG, KHÔNG sprite; 4b sẽ thay bằng cảnh nhóm người hoạt ảnh), chiếm phần chiều cao còn lại (`flex-1`, tối thiểu ~160px), có hai chip nhỏ đè ở góc: góc trái là trạng thái (`FOCUSING` / `PAUSED` / `BREAK`), góc phải là nút bật/tắt chuông; (b) bên dưới là một khung gọn gồm 3 hàng: dòng chế độ cỡ nhỏ; hàng điều khiển 3 cột `[nút trái | thời gian | nút phải]`; dòng thưởng. Hàng điều khiển: nút trái = `Pause (n left)` hoặc `Resume` khi đang tạm dừng (giữ nguyên logic `canPause`, tooltip và hành vi hiện có); giữa = thời gian; nút phải = `Give Up` (Countdown và Pomodoro Countdown, mở hộp xác nhận hiện có) hoặc `End Session` (Stopwatch và Pomodoro Stopwatch, mở hộp xác nhận hiện có). Dòng thưởng giữ đúng nhãn hiện có (`Reward:`, `Accumulated Reward:`, `Total Reward:`) kèm chip hệ số nhỏ (ví dụ `×1.0`). Pha nghỉ Pomodoro có thêm nút phụ nhỏ `"Skip Break & Start Next Focus"` dưới khung. Bỏ khỏi màn đang chạy: dòng `Target: … (x% completed)` và dòng `"pauses available"` (giữ thông tin trong tooltip nút Pause); bỏ dải khóa Edit Profiles trên màn đang chạy (Header đã có huy hiệu khiên kèm tên Profile).
- **ĐC-9:** Lộ trình mới: **`5b-2 → 4a (sprite bản đồ/công trình) → 4b (cảnh nhóm người hoạt ảnh) → 1b → 3 → 2a → 2b → 5c → 6 → 7`**.
- **ĐC-10:** Chèn **Giai đoạn 5b-3** (sửa lỗi sau 5b-2: nút Skip Break, Total Reward Pomodoro Countdown, khung cảnh `FocusSceneArea` phủ đầy khung) trước **4a**. Lộ trình: **`5b-3 → 4a → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`**.
- **ĐC-11:** Chỉ dùng tài nguyên CC0 (Kenney Tiny Town, Kenney Tiny Dungeon) đã được đặt vào repo, cộng sprite do dự án tự vẽ. Không dùng tài nguyên khác nếu chưa có file giấy phép CC0/MIT trong repo. Giai đoạn 4a làm sprite bản đồ/công trình/catalog; Giai đoạn 4b làm cảnh nhóm người trong `FocusSceneArea` (dùng nhân vật Tiny Dungeon).
- **ĐC-12 (Bản V2 + Bổ sung tán lá):** Chèn **Giai đoạn 4a-2** sau **4a** và trước **4b**: thu nhỏ đất đầu game từ `20×20` (`4` chunk `10×10` = `400` ô) xuống **`8×8`** (`2×2` chunk **`4×4`** = `64` ô), mỗi lần mở rộng mở đúng 1 chunk `4×4` (`+16` ô, giữ nguyên miễn phí tới Milestone 5B.6); **bỏ cây dạng dữ liệu game (`TerrainFeature`)**, giữ `GridMap`/`GridMapSnapshot` sạch chỉ có `{ chunks, buildings }` và giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2` (state `10×10` cũ bị `sanitizeCivilizationState` từ chối → seed lại bản đồ `8×8`). Cây và cảnh quan là **lớp hiển thị thuần UI (`terrainDecor.ts`)**: vùng đã mở chỉ có cỏ (`0, 1`), hoa (`2`), mảng đất thưa (`12–14, 24–26, 36–38, 39–42`), đá rêu (`43`) và mầm/nấm thưa (`17, 29`) — **tuyệt đối không có cây hay mảnh tán lá và không chặn đặt công trình**; vùng chưa mở bao quanh (viền rừng tối tối thiểu 2 ô quanh bounding box) hiển thị rừng rậm làm tối ghép từ **khối tán lá liền mạch (`[6,8]/[30,32]`, `[9,11]/[33,35]`, `[7]/[31]`, `[10]/[34]`, mảnh tán lá không bao giờ đứng lẻ)** xen cây đứng riêng CC0 Tiny Town (`3, 4, 5, 15, 16, 27, 28`). Lộ trình cập nhật: **`4a → 4a-2 → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`**.

---

## A. ĐÁNH GIÁ HIỆN TRẠNG & BASELINE THỰC TẾ (CURRENT STATE INVENTORY)

### A.1. Baseline Kỹ thuật Đã Xác minh Thực tế
Các lệnh kiểm tra chạy trực tiếp trên repository hiện tại trước khi lập kế hoạch:

1. **Automated Tests (`npm test`):** **382 / 382 PASS** (`0` fail, `0` cancelled, `0` skipped, `0` todo; tổng thời gian ~15.76s). Bộ test gồm 45 file test thực thi (+ 1 helper `chromeMock.ts`) chia trong `__tests__/core/`, `__tests__/background/`, `__tests__/storage/`, `__tests__/integration/`, `__tests__/ui/`.
2. **Typecheck (`npm run lint` — `tsc --noEmit`):** **PASS (0 errors, 0 warnings)**.
3. **Production Build (`npm run build` — `vite build`):** **PASS (840ms)**, tạo các artifacts:
   - `dist/background.js`: `76.96 kB` (gzip `16.69 kB`)
   - `dist/assets/popup-DsSjaWr9.js`: `596.04 kB` (gzip `160.77 kB`) *(đang có cảnh báo Vite chunk > 500 kB)*
   - `dist/assets/popup-DHFcy1Wj.css`: `56.54 kB` (gzip `9.28 kB`)
   - `dist/assets/domainNormalizer-zgpTEtXf.js`: `21.93 kB` (gzip `6.86 kB`)
   - `dist/index.html`: `0.63 kB` (`gzip: 0.37 kB`), `dist/blocked.html`: `1,537 bytes`, `dist/manifest.json`: `1,007 bytes`.
4. **Ghi chú môi trường build (ngoài phạm vi dọn template 5B.4.3C):** `package.json` vẫn giữ `esbuild@^0.25.0` và `autoprefixer@^10.4.21` (khi cài mới `npm ci` cần `--legacy-peer-deps` do peer range với `vite@^8.3.0`); `public/assets/aistudio/` còn nguyên. Không đụng chạm trong đợt 5B.5 trừ phi được yêu cầu riêng.

### A.2. Kiến trúc UI & Điều hướng Hiện tại
- **Khung Popup (`src/App.tsx:198`):** Cố định `w-[400px] min-h-[580px] max-h-[600px]`, nền sáng/tối Tailwind 4. Ngoài Chrome Extension (`!isChromeExtension()`), `App.tsx:267-312` bọc thêm khung demo preview tiếng Việt/Anh.
- **Top Header (`src/ui/components/Header.tsx`):** Hiển thị logo `FQ` + `Focus Quest`, nút `?` (`data-testid="help-btn"` mở `RewardHelpModal`), Coins, Level badge (`Lv. X`), thanh XP (`currentLevelXP/xpForNextLevel`), và nút pill Active Profile (`onOpenProfiles` chuyển sang tab `profiles`). Chưa có Era badge và chưa có nút chuyển ngôn ngữ.
- **Navigation (`src/ui/components/Navbar.tsx`):** Thanh tab nằm **phía trên** (ngay dưới Header), chia 4 cột đều nhau: `Quest` (`timer`) | `Civ` (`civilization`) | `Allowlist` (`profiles`) | `Daily Stats` (`stats`). Tab mặc định trong `App.tsx:44` là `'timer'`.
- **Civilization UI (`src/ui/components/civilization/`):** Gồm 6 component hoàn chỉnh (`CivilizationHeader`, `MapGridView`, `BuildingCatalogPanel`, `BuildingDetailsModal`, `LandExpansionModal`, `CivilizationScreen`) đang nằm sau tab thứ 2 (`Civ`). `MapGridView.tsx` vẽ lưới `CELL_SIZE = 22px` bằng các ô HTML + nút công trình gắn Lucide icon (`renderBuildingIcon`), hỗ trợ pan (ngưỡng 4px), zoom (`0.6×–2.0×`), `Recenter`, hover preview xanh/đỏ, phím `Esc`. Nút Upgrade trong `BuildingDetailsModal.tsx:154-161` khóa cứng ở `"Milestone 5C"`.
- **Profiles & Allowlist (`ProfileAllowlistView.tsx` vs `ProfileManager` + `MessageHandler`):**
  - Backend (`src/core/profiles/profileManager.ts` & `src/background/messageHandler.ts`) **đã có đầy đủ** `CREATE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE`, `SWITCH_PROFILE`, `ADD_DOMAIN`, `REMOVE_DOMAIN`, toàn bộ khóa chặt bằng `assertNoActiveSession` khi `RUNNING` hoặc `PAUSED`.
  - **Khoảng trống UI & Simulator:** `ProfileAllowlistView.tsx` mới có Switch/Create/Add/Remove domain — **chưa có UI Rename và Delete Profile**. Đồng thời `simulateMessageResponse()` trong `src/ui/services/extensionClient.ts` mới xử lý 20/24 actions, đang **thiếu 4 cases**: `RENAME_PROFILE`, `DELETE_PROFILE`, `GET_ACTIVE_PROFILE`, `GET_DAILY_STATS` (rơi vào `default` trả `{ success: true, data: undefined }`).
- **Stats (`StatsView.tsx` & `fq_daily_stats`):**
  - `StatsView.tsx` hiện chỉ nhận `todayStats: DailyStatRecord | null` cho ngày hôm nay (4 KPI: Focus Time, Quests Finished, Coins Earned, XP Earned).
  - Storage `STORAGE_KEYS.DAILY_STATS` (`'fq_daily_stats'`) lưu `Record<string, DailyStatRecord>` theo key `'YYYY-MM-DD'` giờ địa phương (`getLocalDateKey()`). Hiện chưa có logic xóa/pruning bản ghi cũ và `calculateLifetimeFocusMinutes()` cộng tổng toàn bộ `Object.values(dailyStats)`.
  - Công trình `stone_age_elder_hut` (*Elder's Hut*) có effect `{ type: 'FOCUS_STAT_UNLOCK', statId: 'focus_metric_streak_analysis' }` hiện chưa gắn với chỉ số Streak nào trong `StatsView`.
- **Bản địa hóa (i18n):** 100% text UI, building catalog, thông báo lỗi backend, Chrome Notifications (`sessionCoordinator.ts`), và `public/blocked.html` đang hardcode tiếng Anh (riêng khung demo ngoài popup trong `App.tsx` có vài câu tiếng Việt).

---

## B. KIẾN TRÚC THÔNG TIN (IA), ĐẶC TẢ MÀN HÌNH & WIREFRAMES (400×600)

### B.1. Sơ đồ Điều hướng Mới (Civilization-First Home + 3-Tab Bottom Nav)
- **Màn hình mặc định khi mở Popup:** `activeView = 'home'` (**Your Civilization**).
- **Thanh điều hướng chuyển xuống đáy (Bottom Navigation Bar, ~56px):** 3 tab:
  1. `Quest` (trái) — Nhật ký Daily & Weekly Quests.
  2. `Start Focus` (giữa, **CTA nổi bật** — cao hơn nhẹ hoặc pill nổi màu `indigo-600`, hiển thị chấm xanh + đồng hồ mini `14:32` / `PAUSE` / `REST` khi có phiên đang chạy).
  3. `Stats` (phải) — Thống kê Day / Month / Year + biểu đồ SVG + Streak.
- **Cơ chế quay về Home (`Your Civilization`):**
  - Không thêm tab thứ 4 để giữ đúng 3-tab bottom bar gọn gàng.
  - Khi đang ở bất kỳ tab con nào (`quest`, `focus`, `stats`), người dùng có **2 cách tự nhiên 1 chạm** để về Home:
    1. Chạm vào cụm **Brand (`FOCUS QUEST`) / nút mũi tên `← Map`** trên Header.
    2. Chạm lại vào **chính tab đáy đang active** (toggle về `'home'`).
  - Trong khung sub-screen cũng có nút icon bản đồ nhỏ ở góc Header khi rời `'home'` để đảm bảo tính khám phá (discoverability) 100% cho người dùng mới.

### B.2. Đặc tả Từng Màn hình & Wireframes ASCII (Khung 400×600px)

#### 1) Top Header Compact (~54px — Hiện diện trên mọi màn hình)
- **Hàng 1:** `[FQ] FOCUS QUEST` *(bấm để về Home)* + Badge Era (`Stone Age`) | `[🪙 120]` | `[Lv.3]` | `[?]` *(giữ `data-testid="help-btn"`)* | `[EN|VI]` *(nút chuyển ngôn ngữ 1-chạm, **không dùng icon bánh răng**)*.
- **Hàng 2 (siêu mảnh ~16px):** Thanh XP progress (`XP 150/300`) + trạng thái khóa/khiên nếu đang chạy phiên (`🛡 Shield ON · Study & Research`) hoặc nút `← Map` nhỏ khi đang ở tab con.
- *Lưu ý thiết kế:* Chuyển nút sửa Profile ra khỏi Header để Header không bị chật ở bề ngang `400px` khi thêm Era badge và nút `EN/VI`.

#### 2) Home — Your Civilization (`activeView === 'home'`)
```text
┌────────────────────────────────────────────────────────┐ 400px
│ [FQ] FOCUS QUEST [Stone Age]    🪙120  Lv.3 [?] [EN]  │
│ XP ████████░░░░░░░ 150/300                             │
├────────────────────────────────────────────────────────┤
│ Your Civilization · +5% Bonus · 75m    [Expand][Build] │ ← Sub-bar (~40px)
├────────────────────────────────────────────────────────┤
│ ┌───────────────┐                                      │
│ │ 4 Chunks · 3  │                                      │
│ └───────────────┘                                      │
│              [Camp]        [Granary 2x3]               │
│        +--+--+--+--+--+--+                             │
│        |  |  |🔥|  |  |🌾|  (Pixel-Art SVG Grid Map    │ ~444px
│        +--+--+--+--+--+--+   Pan / Zoom / Hover /      │
│              [Med. Cave]     Click Building -> Modal)  │
│                                                        │
│                                  [-][100%][+][Recenter]│
├────────────────────────────────────────────────────────┤
│  [📜 Quest]    [ ▶ Start Focus ]    [📊 Stats]         │ ~58px
└────────────────────────────────────────────────────────┘ 600px
```
- **Hành vi giữ nguyên:** `Build` mở `BuildingCatalogPanel` (bottom sheet), chọn công trình -> hiện banner `Placing ...` + `Cancel (Esc)` + hover preview xanh/đỏ trên grid; `Expand` mở `LandExpansionModal`; click công trình đã đặt -> `BuildingDetailsModal` (vẫn khóa nút Upgrade ở `"Milestone 5C"`, giữ `Demolish Building` 2 bước).

#### 3) Tab `Quest` (`activeView === 'quest'`)
```text
┌────────────────────────────────────────────────────────┐
│ [FQ] FOCUS QUEST [Stone Age]    🪙120  Lv.3 [?] [EN]  │
│ ← Back to Map                           XP 150/300     │
├────────────────────────────────────────────────────────┤
│ DAILY & WEEKLY QUESTS        Daily Cap: 10/40 Coins    │
│ ────────────────────────────────────────────────────── │
│ ☀ DAILY QUESTS                 Resets in 06h 14m       │
│ ┌────────────────────────────────────────────────────┐ │
│ │ First Spark · Complete 1 Focus Session      [1/1]  │ │
│ │ +10 Coins · +25 XP                 [ Claim Reward ]│ │
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Steady Rhythm · Focus 60m in completed sess [35/60]│ │
│ │ ██████████░░░░░░░░░ +15 Coins · +35 XP   In Prog.  │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Double Tap · Complete 2 Focus Sessions      [1/2]  │ │
│ │ █████████░░░░░░░░░░ +15 Coins · +40 XP   In Prog.  │ │
│ └────────────────────────────────────────────────────┘ │
│ 🗓 WEEKLY QUESTS           Resets Mon 00:00 (2d 06h)  │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Habit Builder · Focus on 4 separate days    [2/4]  │ │
│ │ ██████████░░░░░░░░░ +50 Coins · +120 XP  In Prog.  │ │
│ └────────────────────────────────────────────────────┘ │
│ ℹ Progress counts only from completed Focus Sessions.  │
├────────────────────────────────────────────────────────┤
│ [📜 Quest (1)]  [ ▶ Start Focus ]   [📊 Stats]         │
└────────────────────────────────────────────────────────┘
```

#### 4) Tab `Start Focus` (`activeView === 'focus'`) — Chế độ Idle / Running / Summary
```text
┌────────────────────────────────────────────────────────┐
│ [FQ] FOCUS QUEST [Stone Age]    🪙120  Lv.3 [?] [EN]  │
│ ← Back to Map                           XP 150/300     │
├────────────────────────────────────────────────────────┤
│ [  Countdown  |  Stopwatch  |  Pomodoro  ]             │
│                                                        │
│   Target Duration                                      │
│   [ 15m ]  [ 25m ]  [ 45m ]  [ 60m ]   Custom: [30]m   │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Est. Reward: +45 Coins (+5% Civ) · +150 XP (×1.2) │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ Active Focus Profile                  [ Edit Profiles ]│
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🛡 Study & Research              2 domains allowed │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │          ▶  START FOCUS SESSION                    │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│  [📜 Quest]    [ ▶ Start Focus * ]   [📊 Stats]        │
└────────────────────────────────────────────────────────┘
```
- Khi phiên đang `RUNNING` hoặc `PAUSED`: giao diện Timer giữ nguyên toàn bộ logic đếm chính xác, Pause (tối đa 2 × 5m), Pomodoro phase indicator, `Skip Break`, `Finish Session & Claim Reward` (Stopwatch / Pomo Stopwatch), `Give Up Session` (Countdown / Pomo Countdown). Nút `Edit Profiles` bị khóa (disabled + tooltip lý do), **tuyệt đối không có nút mở khóa vượt rào**.

#### 5) Bottom Sheet `Edit Profiles` (`ProfileBottomSheet` — Mở đè trên tab `Start Focus`)
```text
┌────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░ (Backdrop mờ) ░░░░░░░░░░░░░░░░░░░░░░ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Focus Profiles & Allowlist                     [✕] │ │
│ │────────────────────────────────────────────────────│ │
│ │ [+ New Profile]  (Disabled + Banner nếu đang Focus)│ │
│ │ ● Study & Research (Active)   [Rename] [🗑] 2 dom  │ │
│ │ ○ Deep Work / Coding          [Use] [Rename] [🗑]  │ │
│ │────────────────────────────────────────────────────│ │
│ │ Allowed Domains · Study & Research (2)             │ │
│ │ [ e.g. wikipedia.org, *.github.com       ] [ Add ] │ │
│ │ ┌────────────────────────────────────────────────┐ │ │
│ │ │ wikipedia.org                              [🗑]│ │ │
│ │ │ github.com                                 [🗑]│ │ │
│ │ └────────────────────────────────────────────────┘ │ │
│ │ ℹ Empty allowlist blocks all external websites.    │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```
- Hỗ trợ đầy đủ CRUD qua `MessageHandler`: Chọn Active (`SWITCH_PROFILE`), Tạo mới (`CREATE_PROFILE`), Đổi tên inline (`RENAME_PROFILE`), Xóa có xác nhận 2 bước và chặn xóa profile cuối cùng (`DELETE_PROFILE`), Thêm/Xóa domain (`ADD_DOMAIN` / `REMOVE_DOMAIN`).

#### 6) Tab `Stats` (`activeView === 'stats'`)
```text
┌────────────────────────────────────────────────────────┐
│ [FQ] FOCUS QUEST [Stone Age]    🪙120  Lv.3 [?] [EN]  │
│ ← Back to Map                           XP 150/300     │
├────────────────────────────────────────────────────────┤
│ Focus Analytics        🔥 4d Streak (Best: 9d)         │
│ [    Day    |    Month    |    Year    ]               │
│       ◀   November 2026 (2026-11)   ▶                  │
│                                                        │
│ ┌──────────────────────┐ ┌──────────────────────┐      │
│ │ Focus Time:   420 m  │ │ Completed: 14 (1 ab) │      │
│ └──────────────────────┘ └──────────────────────┘      │
│ ┌──────────────────────┐ ┌──────────────────────┐      │
│ │ Coins:       +712.5  │ │ XP:         +2,310   │      │
│ └──────────────────────┘ └──────────────────────┘      │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Daily Focus (mins)              Peak: 90m (Nov 12) │ │
│ │   ▄   █     █ ▄   █ ▂                              │ │
│ │ 1 3 5 7 9 11 13 15 17 19 21 23 25 27 29  (SVG Bar) │ │
│ └────────────────────────────────────────────────────┘ │
│ ℹ Focus minutes from interrupted sessions are kept.    │
├────────────────────────────────────────────────────────┤
│  [📜 Quest]    [ ▶ Start Focus ]    [📊 Stats ●]       │
└────────────────────────────────────────────────────────┘
```

---

## C. KẾ HOẠCH ĐỒNG BỘ THUẬT NGỮ (TERMINOLOGY REFACTOR PLAN)

### C.1. Quy ước Thuật ngữ Chính thức
- **`Focus Quest` (giữ nguyên 100%):** Tên thương hiệu / Extension (`manifest.json`, `index.html`, Header brand, tiêu đề Chrome Notification `"Focus Quest — ..."`).
- **`Focus Session` / `Pomodoro Session` / `Countdown Session`:** Dùng thay cho mọi chỗ trước đây gọi phiên tập trung là `"Quest"` / `"quest"`.
- **`Quest` / `Daily Quest` / `Weekly Quest`:** Chỉ dành riêng cho hệ thống Nhiệm vụ Hàng ngày / Hàng tuần mới.

### C.2. Kiểm kê Đầy đủ Vị trí Cần Sửa (Đã xác minh qua grep)
| Nhóm | File & Dòng chính xác | Text / Định danh hiện tại | Thay bằng |
|---|---|---|---|
| **UI Nav** | `src/ui/components/Navbar.tsx:29` | `Quest` | Tái cấu trúc thành 3 tab: `Quest` (mới cho nhiệm vụ), `Start Focus`, `Stats` |
| **UI Timer** | `src/ui/components/TimerView.tsx:390` | `Focus Quest Completed!` / `Quest Ended` | `Focus Session Completed!` / `Focus Session Ended` (+ key i18n) |
| **UI Timer** | `src/ui/components/TimerView.tsx:398,401,402` | `...-min quest`, `ended this quest` | `...-min focus session`, `ended this focus session` (+ key i18n) |
| **UI Timer** | `src/ui/components/TimerView.tsx:439` | `Start New Quest` | `Start New Focus Session` (+ key i18n) |
| **UI Timer** | `src/ui/components/TimerView.tsx:797,804,812,824` | `Finish Quest & Claim Reward`, `Give Up Quest`, `Give up this focus quest?` | `Finish Session & Claim Reward`, `Give Up Session`, `Give up this focus session?` |
| **UI Timer** | `src/ui/components/TimerView.tsx:1439` | `START POMODORO QUEST` / `START FOCUS QUEST` | `START POMODORO SESSION` / `START FOCUS SESSION` |
| **UI Stats** | `src/ui/components/StatsView.tsx:48,85` | `Quests Finished`, `Countdown quests` | `Sessions Completed`, `Countdown sessions` |
| **UI Profiles** | `src/ui/components/ProfileAllowlistView.tsx:246` | `during focus quests` | `during focus sessions` |
| **Background** | `src/background/sessionCoordinator.ts:979,1219` | `completed your ${...}-min quest`, `Pomodoro quest` | `completed your ${...}-min focus session`, `Pomodoro session` (qua i18n) |
| **BG Comments/Vars** | `sessionCoordinator.ts:279,281-282,1128,1228,2340`; `blockingCoordinator.ts:12` | `totalQuestMinutes`, comments `Quest completion`, `focus Quest` | Có thể đổi comment sang `Session` và giữ/đổi tên biến local `totalPlannedFocusMinutes` (không đổi behavior) |
| **Docs** | `PRODUCT_SPEC.md:73`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`, `README.md` | `toàn bộ Quest` (`PRODUCT_SPEC.md:73`), mô tả 4 tab cũ | Cập nhật thành `Focus Session` & đặc tả hệ thống Quest mới |
| **Tests (Comments)** | `pomodoro.test.ts:241`, `pomodoroSectionXIIChecklist.test.ts:160`, `pomodoroStopwatchCountdown.test.ts:245,355`, `lifecycleRecovery.test.ts:417,697`, `pomodoroPhaseTransition.test.ts:322` | Chỉ nằm trong **comment** nội bộ test | Cập nhật comment rõ nghĩa (không làm thay đổi bất kỳ assertion nghiệp vụ nào) |

### C.3. Đánh giá Storage Keys, Message Types & Backward Compatibility
- Đã kiểm tra `src/storage/storageKeys.ts` và `src/types/messages.ts`: **không có key hay action nào chứa từ `QUEST`** (`CURRENT_SESSION`, `START_SESSION`, `fq_current_session`, `fq_daily_stats`...).
- Do đó, `STORAGE_KEYS.QUESTS = 'fq_quests'` và các message mới (`GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`) **hoàn toàn sạch sẽ, không xung đột và không cần migrate đổi tên key cũ**.

---

## D. THIẾT KẾ HỆ THỐNG QUEST (DAILY & WEEKLY QUEST SYSTEM)

### D.1. Danh sách Quest Đề xuất & Cân bằng Kinh tế (Zero Passive Income)
**Quy tắc bất biến:**
1. Tiến độ Quest **CHỈ tăng khi có Focus Session thực sự hoàn thành hợp lệ** (`status === 'COMPLETED'`), tuyệt đối không có thu nhập thụ động hay thưởng điểm danh miễn phí.
2. **All-or-Nothing Consistency:**
   - **Countdown / Pomodoro Countdown** bị `Give Up` hoặc `INTERRUPTED`: **+0 tiến độ phút, +0 tiến độ số phiên, +0 thưởng Quest**.
   - **Stopwatch** dừng dưới ngưỡng 5 phút (`< 5m` -> `isThresholdMet === false`): **+0 tiến độ Quest**. Stopwatch `INTERRUPTED` cũng cho **0 tiến độ Quest** (dù vẫn ghi nhận phút vào Daily Stats / thưởng phạt theo quy tắc cũ của Stopwatch) để tuân thủ nghiêm ngặt *"chỉ từ Focus Session thực sự hoàn thành"*.
   - **Pomodoro Stopwatch:** Chỉ tính số phút từ **các focus interval đã hoàn thành 100%** (`completedFocusCount * intervalDuration`) khi người dùng bấm Finish (`COMPLETED`, `completedFocusCount > 0`). Interval đang dở dang không cộng vào tiến độ Quest.
3. **Thưởng Quest cố định (Flat Rewards):** Coins/XP từ Quest **không nhân** thêm Session Multiplier hay Civilization `CoinBonus` để giữ cân bằng lạm phát và dễ dự đoán.

#### Daily Quests (3 nhiệm vụ/ngày — Đã chốt — Cap tối đa: **40 Coins · 100 XP / ngày**)
| ID | Tên (EN / VI) | Điều kiện | Mục tiêu | Thưởng |
|---|---|---|---|---|
| `daily_first_spark` | **First Spark** / *Khởi động Tập trung* | Hoàn thành Focus Session hợp lệ | `1` phiên | `10 Coins · 25 XP` |
| `daily_steady_rhythm` | **Steady Rhythm** / *Nhịp độ Bền bỉ* | Tổng phút Focus từ các phiên hoàn thành hôm nay | `60` phút | `15 Coins · 35 XP` |
| `daily_double_tap` | **Double Tap** / *Cú Đúp Tập trung* | Hoàn thành Focus Sessions hợp lệ trong ngày | `2` phiên | `15 Coins · 40 XP` |

*(Tổng Daily Cap giữ nguyên: `10 + 15 + 15 = 40 Coins`, `25 + 35 + 40 = 100 XP`. So với 1 phiên Countdown 25m được `37.5 Coins, 125 XP`, toàn bộ Daily Quests đóng vai trò cú huých tích cực, không làm lu mờ Focus Timer.)*

#### Weekly Quests (3 nhiệm vụ/tuần — Rà soát trục trực giao — Cap tối đa: **150 Coins · 370 XP / tuần**)
Để **tránh 1 hành vi đơn lẻ thỏa hết cả 3 Weekly Quests**, bộ Weekly Quests đo 3 trục hành vi độc lập (không ép chọn chế độ timer cố định):

| ID | Tên (EN / VI) | Trục hành vi | Điều kiện | Mục tiêu | Thưởng |
|---|---|---|---|---|---|
| `weekly_habit_builder` | **Habit Builder** / *Giữ Nhịp 4 Ngày* | **Consistency** (Đều đặn đa ngày) | Số ngày phân biệt trong tuần có ít nhất 1 phiên hoàn thành | `4` ngày | `50 Coins · 120 XP` |
| `weekly_deep_diver` | **Deep Diver** / *Thợ Lặn Chuyên Sâu* | **Depth** (Độ sâu đơn phiên) | Số phiên hoàn thành có thời lượng hợp lệ **`>= 45 phút`** | `3` phiên sâu | `60 Coins · 150 XP` |
| `weekly_tenacity_10` | **Weekly Tenacity** / *Mười Phiên Kiên Định* | **Volume** (Tổng số phiên) | Tổng số Focus Sessions hợp lệ hoàn thành trong tuần | `10` phiên | `40 Coins · 100 XP` |

*(Kiểm chứng chống thỏa hết bằng 1 hành vi đơn lẻ: Cày dồn 10 phiên trong 1 ngày cuối tuần -> trượt `Habit Builder 1/4`; chỉ chạy 10 phiên ngắn 25m rải 5 ngày -> trượt `Deep Diver 0/3`; chỉ làm mỗi ngày 1 phiên sâu 50m trong 4 ngày -> trượt `Weekly Tenacity 4/10`. Tổng Weekly Cap giữ nguyên: `50 + 60 + 40 = 150 Coins`, `120 + 150 + 100 = 370 XP`.)*

### D.2. Chu kỳ Reset, Chống Gian lận Thời gian & Streak
- **Daily Reset (`00:00` local time):** Định danh bằng `getLocalDateKey()` (`'YYYY-MM-DD'`).
- **Weekly Reset (Thứ Hai `00:00` local time):** Viết helper `getLocalWeekStartKey(dateInput)` trả về ngày Thứ Hai đầu tuần theo local timezone dạng `'YYYY-MM-DD'` (tránh bug chuyển giao năm của ISO week number).
- **Bảo vệ đổi giờ hệ thống (Clock-Skew / Anti-Rollback Guard):**
  - Lưu `lastSettledTimestamp` và `claimedPeriodLedger` (hoặc giữ ring-buffer `recentClaimedKeys` tối đa 14 kỳ gần nhất dạng `daily:YYYY-MM-DD:questId` và `weekly:YYYY-MM-DD:questId`).
  - Nếu đồng hồ máy lùi về ngày cũ đã từng reset/claim trước đó: (a) `claimedPeriodLedger` chặn claim trùng kỳ cũ; (b) `periodKey` mới chỉ rollover tiến khi `now >= lastPeriodStartMs` hoặc ngày mới chưa có trong `processedPeriodKeys` để tránh reset xóa sạch tiến độ đang làm dở nếu đồng hồ giật nhẹ.
- **Focus Streak:**
  - Theo dõi `streak: { currentDays: number; longestDays: number; lastCompletedDateKey: string | null }`.
  - Chỉ tăng khi người dùng **hoàn thành 1 Focus Session hợp lệ** vào hôm nay (cùng ngày -> giữ nguyên; liền kề hôm qua -> `+1`; cách >= 2 ngày -> reset về `1`). Không thưởng Coin thụ động cho Streak; hiển thị ở tab `Stats` (và nối tiếp ý tưởng `FOCUS_STAT_UNLOCK` của `Elder's Hut`).

### D.3. Cơ chế Claim & Giao dịch Nguyên tử (`StorageMutex` + Schema v3)
- **Chốt: Manual Claim (`Claim Reward`).**
  - Khi quest đạt 100% (`progress >= target && !claimed`), nút `Claim Reward` sáng lên trong `QuestView`.
  - Tab `Quest` trên bottom nav **bắt buộc hiển thị huy hiệu "chưa nhận" (`unclaimed badge`)** rõ ràng (hiển thị số lượng quest đã hoàn thành chưa claim, ví dụ `data-testid="quest-unclaimed-badge"` kèm nhãn/aria song ngữ `"chưa nhận"` / `"unclaimed"`), tự ẩn khi `unclaimedCount === 0`.
  - Giao diện `QuestView` **bắt buộc hiển thị rõ đồng hồ đếm ngược / thời gian reset** cho cả 2 khu vực: Daily (`Resets in Xh Ym · 00:00`) và Weekly (`Resets Mon 00:00 · Xd Yh`).
  - Bấm `Claim` gửi `CLAIM_QUEST_REWARD` vào Background; quest đã xong nhưng chưa Claim khi qua `00:00` / Thứ Hai sẽ hết hạn khi rollover sang chu kỳ mới.
- **Schema v3 (`src/types/quests.ts`, `src/types/storageSchema.ts`, `src/storage/storageKeys.ts`):**
  - Thêm `STORAGE_KEYS.QUESTS = 'fq_quests'` và `CURRENT_SCHEMA_VERSION = 3` (`src/storage/migrations/v3_questsSchema.ts`).
  - `MigrationRunner` nâng v1/v2 -> v3 idempotent, **giữ nguyên 100%** `economy`, `profiles`, `dailyStats`, `civilization`, `currentSession`, `settings`; khởi tạo `fq_quests` sạch theo ngày/tuần hiện tại (không backfill giả các phiên cũ thành tiền thưởng đột ngột).
  - Riêng `UserSettings` giữ nguyên trường cũ `soundEnabled: boolean` (đánh dấu deprecated, bị bỏ qua, giữ để tương thích ngược schema/migration) + `notificationsEnabled: boolean`, và bổ sung `language?: 'en' | 'vi'` + `chimeEnabled?: boolean` (`undefined` nghĩa là bật chuông) ngay từ Giai đoạn 1a.
- **Giao dịch Nguyên tử (tách làm Giai đoạn 2a & 2b):**
  1. **Giai đoạn 2a (Domain thuần & Schema v3):** Chỉ định nghĩa types, catalog, rollover, streak, anti-rollback, `MigrationRunner` v3 và test engine/migration độc lập (**chưa nối vào session**).
  2. **Giai đoạn 2b (Atomic Session Integration & `QuestCoordinator`):** Mở rộng `commitSessionOutcomeInternal` nhận thêm `questOutcomeDelta?: { completedDateKey: string; completedFocusMinutes: number }` để ghi `CURRENT_SESSION` + `ECONOMY` + `DAILY_STATS` + `QUESTS` **trong một lần `setMultiple` duy nhất dưới `StorageMutex`**, bảo đảm tuyệt đối không thay đổi Coins/XP/Level/DailyStats của bản thân phiên Focus vừa kết thúc; đồng thời thêm `QuestCoordinator.claimQuestReward` chạy qua `storage.runExclusive` (chống double-claim 100%, từ chối nếu qua kỳ mới).
- **Message Protocol mới (`src/types/messages.ts`, `MessageHandler.ts`, `extensionClient.ts`):**
  - `SET_LANGUAGE`, `SET_CHIME_ENABLED` (thêm đầy đủ handler, types, simulator ngay từ Giai đoạn 1a).
  - `GET_QUEST_STATE` (tự rollover kỳ mới nếu sang ngày/tuần mới và trả về `QuestState` + thời gian còn lại tới reset + số lượng `unclaimedCount`).
  - `CLAIM_QUEST_REWARD` (`payload: { period: 'DAILY' | 'WEEKLY'; questId: string }`, trả về `{ questState, economy, claimedCoins, claimedXp }`).

---

## E. THIẾT KẾ NÂNG CẤP STATS (DAY / MONTH / YEAR + BIỂU ĐỒ SVG)

### E.1. Khả năng Tính toán từ `fq_daily_stats` Hiện tại
Cấu trúc hiện có của `DailyStatRecord` (`src/types/storageSchema.ts:6-13`): `{ date, totalFocusMinutes, completedSessions, abandonedSessions, coinsEarned, xpEarned }`.

| Góc nhìn | Tính được ngay từ `fq_daily_stats` | Không tính được (Giới hạn dữ liệu hiện tại) |
|---|---|---|
| **Day (`YYYY-MM-DD`)** | Focus minutes, Completed, Abandoned, Coins, XP của ngày chọn + xu hướng **7 ngày gần nhất** kết thúc tại ngày chọn | Phân bổ theo **từng giờ trong ngày** (`08:00`, `14:00`...) vì `DailyStatRecord` chỉ lưu tổng theo ngày, không lưu timestamp từng phiên |
| **Month (`YYYY-MM`)** | Tổng & trung bình/ngày của tháng, Active days, Completion rate (`completed / (completed + abandoned)`), Peak day, **biểu đồ cột 28–31 ngày** | Tỉ lệ theo Mode (`Countdown` vs `Stopwatch` vs `Pomodoro`) hay theo Profile |
| **Year (`YYYY`)** | Tổng cả năm, **biểu đồ cột 12 tháng (`T1–T12`)**, tháng năng suất nhất, số ngày active trong năm, Longest Streak | Chi tiết từng phiên riêng lẻ trong năm |

**Quyết định thiết kế:**
- Đợt 5B.5 **giữ nguyên `DailyStatRecord` gọn nhẹ**, xây dựng đầy đủ aggregation Day / Month / Year + 7-day trend (ở tab Day) + 28–31-day bars (tab Month) + 12-month bars (tab Year) bằng các pure functions trong `src/core/stats/statsAggregator.ts`.
- **Không tự động xóa (prune) `fq_daily_stats` cũ:** Hiện `calculateLifetimeFocusMinutes()` cộng tất cả entries trong `fq_daily_stats`. Mỗi bản ghi ngày ~150 bytes (~55 kB/năm), hoàn toàn an toàn trong hạn mức 10 MB của `chrome.storage.local` và bảo toàn chính xác tuyệt đối số liệu Year view + điều kiện mở khóa công trình Civilization.
- **Tích hợp `GET_DAILY_STATS`:** Backend (`MessageHandler.ts:262`) đã có `GET_DAILY_STATS` trả về toàn bộ `Record<string, DailyStatRecord>`. Cần bổ sung `GET_DAILY_STATS` vào `extensionClient.ts` simulator (kèm dữ liệu mẫu vài ngày trong tháng/năm cho preview web) và truyền `allDailyStats` vào `StatsView` thay vì chỉ `todayStats`.

### E.2. Biểu đồ SVG Thuần & Kiểm soát Kích thước Bundle
- Tự viết component `StatsBarChart.tsx` bằng **SVG chuẩn + Tailwind CSS** (~120 dòng, zero dependencies) với tooltip hover/focus hiển thị số phút + số phiên, gridlines mảnh, responsive đúng `368px` bề rộng nội dung trong popup `400px`.
- **Tác động bundle:** `dist/assets/popup-*.js` hiện là `596.04 kB`. Tự viết SVG chỉ tăng ~`6–10 kB`, tránh hoàn toàn việc phình `+180–300 kB` nếu cài thư viện chart. *(Tùy chọn ở Mục I: có thể cấu hình `manualChunks` tách `react` + `lucide-react` hoặc `React.lazy` cho modal để triệt tiêu cảnh báo >500 kB của Vite.)*

---

## F. KIẾN TRÚC PIXEL-ART MAP & BẢN QUYỀN ASSET (SPRITE & LICENSING STRATEGY)

1. **Nguyên tắc Bản quyền & MV3 Offline:**
   - **Tuyệt đối không** dùng asset có bản quyền/watermark từ bên thứ 3 hoặc tải ảnh qua URL mạng ngoài (vi phạm CSP Extension & offline reliability).
2. **Kiến trúc `spriteRegistry` (`src/ui/components/civilization/spriteRegistry.ts`):**
   - Tách riêng lớp render sprite khỏi `MapGridView.tsx` và `BuildingCatalogPanel.tsx` thông qua interface:
     `getBuildingSprite(definitionId: string, era: CivilizationEra, level: number, size: { w: number; h: number }): ReactNode`.
   - Trong **5B.5**, toàn bộ công trình Stone Age (`stone_age_campfire`, `stone_age_totem`, `stone_age_study_cave`, `stone_age_elder_hut`, `stone_age_foraging_post`, `stone_age_food_cache`) và tile nền (cỏ pixel `16×16` pattern SVG, đá viền chunk, vùng chưa mở khóa tối màu) dùng **bespoke inline Pixel-Art SVG** (`shapeRendering="crispEdges"`, viewBox bội số 16px, hiệu ứng lửa trại bập bùng bằng CSS opacity/scale nhẹ) do dự án tự sở hữu 100%.
   - **Tương thích Milestone 5C:** Khi lên 5C (`BRONZE_AGE`) hoặc khi có bộ `.png` `image-rendering: pixelated` tự vẽ sau này, chỉ cần cập nhật bảng ánh xạ trong `spriteRegistry.ts` mà không phải sửa logic grid hay placement.
3. **Bảo toàn 100% Tương tác Bản đồ Hiện có:**
   - Giữ `Build` -> `BuildingCatalogPanel`, `Expand` -> `LandExpansionModal`, Pan/Zoom (`0.6×–2.0×`), `Recenter`, `Placing ...` + `Cancel (Esc)`, hover preview xanh/đỏ, `BuildingDetailsModal` (`Demolish Building` 2 bước & nút nâng cấp khóa `"Milestone 5C"`).

---

## G. THIẾT KẾ ĐA NGÔN NGỮ (SONG NGỮ TIẾNG VIỆT / ENGLISH — i18n)

### G.1. Kiến trúc Gọn nhẹ (`src/i18n/`)
- Không cài `i18next` / `react-intl` để giữ bundle nhẹ và chạy đồng nhất trong cả 3 môi trường: **React Popup**, **Background Service Worker** (không có DOM), và **`blocked.html`**.
- Cấu trúc đề xuất:
  - `src/i18n/types.ts`: `export type SupportedLocale = 'en' | 'vi';` và union `TranslationKey` gõ kiểu chặt (compile-time check không bao giờ thiếu key).
  - `src/i18n/locales/en.ts` và `src/i18n/locales/vi.ts`: Dictionary phẳng với nội suy tham số `{minutes}`, `{coins}`, `{xp}`, `{name}`.
  - `src/i18n/translator.ts`: Pure function `translate(locale, key, params?)`, `formatDurationLabel`, `resolveLocaleFromNavigator()`.
  - `src/i18n/I18nContext.tsx`: React Context + hook `useTranslation()` bọc quanh `App`.

### G.2. Lưu trữ, Nhận diện Mặc định, Âm thanh (`chimeEnabled` & deprecated `soundEnabled`) & Bảo vệ Test Hiện tại
- Mở rộng `UserSettings` (`src/types/storageSchema.ts`): `language?: SupportedLocale;` và `chimeEnabled?: boolean;` (`undefined` nghĩa là **bật**).
- **Xử lý âm thanh chuông ngay ở Giai đoạn 1a (ĐC-3 & ĐC-4):**
  - Thực tế code đang có `soundEffects.ts` (Web Audio chimes trong `TimerView.tsx:249-251`), nhưng `UserSettings.soundEnabled` (`storageSchema.ts:16`, `v1_initialSchema.ts:37`, `storageManager.ts:260`) vẫn mang comment sai thực tế `"No audio in MVP"` / `"Default false for MVP (no audio)"`, trong khi `v2Migration.test.ts:66` đang dùng `soundEnabled: false` và người dùng cũ đều có `soundEnabled: false` trong storage.
  - **Phương án chốt (ĐC-3):**
    - Giữ nguyên trường `soundEnabled: boolean` và giá trị mặc định `false` để bảo toàn 100% migration/test cũ, nhưng đánh dấu là trường cũ không dùng (`// deprecated, ignored, kept for backward compatibility`) và cập nhật bỏ comment sai `"No audio in MVP"` ở `storageSchema.ts`, `v1_initialSchema.ts`, `storageManager.ts`.
    - Thêm trường mới `chimeEnabled?: boolean` (`undefined` nghĩa là bật). Chỉ tắt chuông khi `chimeEnabled === false`. Người dùng cũ có `soundEnabled: false` (`chimeEnabled === undefined`) **vẫn nghe chuông bình thường**.
    - Thêm `SET_LANGUAGE` và `SET_CHIME_ENABLED` ngay ở Giai đoạn 1a (types, `MessageHandler`, simulator `extensionClient.ts`), trả `settings` qua `GET_SESSION_STATE` (`FullSessionStateResponse.settings`), kèm nút bật/tắt chuông tối thiểu có `aria-label` i18n trong `TimerView`.
- **Quy tắc xác định ngôn ngữ mặc định:**
  - Trên Chrome Extension / Browser: nếu `settings.language` chưa set, kiểm tra `chrome.i18n?.getUILanguage?.() || navigator.language` -> bắt đầu bằng `'vi'` thì dùng `'vi'`, còn lại `'en'`.
  - **Trong Node.js test runner (`npm test`):** Không có `navigator` / `chrome.i18n` (hoặc chưa cấu hình), hàm mặc định trả về `'en'`. Nhờ vậy **100% snapshot text tiếng Anh trong các test UI/Background hiện tại vẫn khớp nguyên vẹn**.
- **Chuyển ngôn ngữ trực tiếp:** Gửi `SET_LANGUAGE` (`payload: { language }`) lưu vào `fq_settings` qua `StorageMutex`, kích hoạt `onStorageChange` cập nhật tức thì cả UI lẫn Background Service Worker (UI toggle trên Header sẽ mở ở Giai đoạn 5a).

### G.3. Phạm vi Dịch Toàn diện
1. **Popup UI:** Toàn bộ nhãn, nút, modal, tooltip, `RewardHelpModal` (giữ các con số công thức `5 – 29 min`, `×1.0`..`×2.5`, `1.5`, `5.0`, `1.0`, `3.0` đồng nhất).
2. **Building Catalog & Eras:** Ánh xạ qua key `buildings.<id>.name`, `buildings.<id>.description` và `eras.<EraEnum>` trong dictionary (không phải đổi data chuẩn trong `buildingCatalog.ts`).
3. **Chrome Notifications (`sessionCoordinator.ts`):** `SessionCoordinator` đọc `await this.storage.getSettings()` trước khi gọi `this.notifications.create(...)` tại 4 điểm (Countdown finish line 977, Pomodoro finish line 1217, Pomodoro break lines 1289 & 1371, Break ended line 1455) và render theo `settings.language`. *(Không ảnh hưởng trạng thái phiên nếu đọc lỗi -> fallback `'en'`.)*
4. **Thông báo lỗi Backend (`MessageResponse`):**
   - Giữ nguyên `error: string` tiếng Anh để **không phá vỡ** các test đang assert chuỗi lỗi tiếng Anh (như `messageHandler.test.ts:173,290` và `extensionClient.test.ts:141,157`).
   - Bổ sung optional `errorCode?: ErrorCode` và `errorParams?: Record<string, string | number>` trên `MessageResponse`. UI ưu tiên dịch `t(errorCode, errorParams)` khi có, fallback `res.error`.
5. **Trang chặn `public/blocked.html` (Lưu ý MV3 CSP!):**
   - Chrome MV3 **cấm inline `<script>`** trong extension pages (`script-src 'self'`). Vì vậy cần thêm một entry script nhỏ `src/blocked/blocked.ts` -> build ra `dist/blocked.js` (hoặc script tĩnh nhỏ `public/blocked.js` đã biên dịch) đọc `chrome.storage.local.get('fq_settings')` (fallback `navigator.language`) để cập nhật `document.documentElement.lang` và nội dung DOM sang `VI` hoặc `EN`.
6. **Chrome Web Store Metadata (`public/manifest.json`):**
   - Bổ sung `"default_locale": "en"`, `"description": "__MSG_extDescription__"`, giữ `"name": "Focus Quest"` (hoặc `"__MSG_extName__"` đều trả `"Focus Quest"`), tạo `public/_locales/en/messages.json` và `public/_locales/vi/messages.json`. *(Phải khai báo `vite` copy thư mục `public/_locales` vào `dist/_locales/` — tự động vì Vite copy toàn bộ `public/`.)*

---

## H. TÁC ĐỘNG LÊN 382 TESTS HIỆN TẠI & KẾ HOẠCH TEST MỚI

### H.1. Phân tích Tác động & Kỷ luật Sửa Test (Đã chốt)
| Nhóm Test | Số lượng | Tình trạng sau 5B.5 | Quy tắc & Hành động |
|---|---:|---|---|
| Core Engine, Background, Storage, Integration (`__tests__/core/*`, `background/*`, `storage/*`, `integration/*`) | ~358 | **PASS không đổi** | Không sửa assertion nghiệp vụ. Bổ sung test ở Giai đoạn 2b khẳng định kết quả thưởng (Coins/XP/Level/DailyStats) của **mọi phiên hiện có** (Countdown completed/give-up/interrupted, Stopwatch <5m/>=5m/interrupted, Pomodoro Countdown & Pomodoro Stopwatch) **KHÔNG đổi** khi nối Quest. |
| `__tests__/ui/extensionClient.test.ts` | 6 | **PASS không đổi** | Giữ nguyên error strings simulator, bổ sung test cho `SET_LANGUAGE`, `SET_CHIME_ENABLED` (1a) và `RENAME_PROFILE`, `DELETE_PROFILE`, `GET_DAILY_STATS`, `GET_QUEST_STATE`, `CLAIM_QUEST_REWARD` (2b). |
| `__tests__/ui/rewardHelpModal.test.ts` | 4 | **PASS nếu tương thích** | Giữ `data-testid="help-btn"` trên `Header` và `HeaderProps` tương thích ngược, giữ nội dung tiếng Anh mặc định trong `RewardHelpModal`. |
| `__tests__/ui/civilizationView.test.ts` | 11 | **10 PASS · Dòng 238 giữ nguyên trừ phi fail thật** | **10 tests đầu giữ nguyên** với export & props tương thích. **Test #371 (`line 238-241` assert `html.includes('Civ')`):** Vì Home mới render `"Your Civilization"` (chứa chuỗi con `'Civ'`), **KHÔNG tự ý sửa trước**; chỉ sửa nếu thực sự fail sau khi đổi nav ở Giai đoạn 5a và phải **báo cáo rõ** kết quả kiểm chứng thực tế. |
| `__tests__/ui/extensionPopupShell.test.ts` | 1 | **SỬA Ở GIAI ĐOẠN 5a (1 test duy nhất)** | **Line 32-33 (`Allowlist`, `Daily Stats`):** Theo ĐC-2, chuyển việc sửa test này sang **Giai đoạn 5a** (ngay khi đổi nav đáy) để mọi giai đoạn kết thúc với 100% test xanh: sửa sang assert 3 tab đáy (`Quest`, `Start Focus`, `Stats`) + Home (`Your Civilization`), giữ nguyên assert chống demo-shell và `Focus Quest` + `data-testid="help-btn"`. |

### H.2. Kế hoạch Test Mới Bổ sung (~70 tests mới -> Tổng ~452 tests)
1. **Giai đoạn 1a — `__tests__/core/i18n.test.ts` (~8+ tests):** Parity 100% key `en`/`vi`, nội suy tham số, fallback `'en'` ở Node, resolve locale từ `settings.language`, handler `SET_LANGUAGE` & `SET_CHIME_ENABLED`, gating chuông (`chimeEnabled: undefined` -> bật, `false` -> tắt, user cũ có `soundEnabled: false` VẪN nghe chuông).
2. **Giai đoạn 1b:** Kiểm tra build `dist/blocked.js`, `dist/_locales/{en,vi}/messages.json`, manifest `default_locale` và hướng dẫn/kiểm tra Chrome MV3 thật.
3. **Giai đoạn 2a — `__tests__/core/questEngine.test.ts` (~14 tests) & `__tests__/storage/v3Migration.test.ts` (~5 tests):** Daily quests mới (`First Spark 1 phiên`, `Steady Rhythm 60m`, `Double Tap 2 phiên`), Weekly quests 3 trục trực giao (`Habit Builder 4 ngày`, `Deep Diver 3 phiên >= 45m`, `Weekly Tenacity 10 phiên`), rollover `00:00` / Thứ Hai, anti-clock-rollback, Countdown Give Up/Interrupted = 0 tiến độ, Stopwatch `<5m`/Interrupted = 0 tiến độ, Pomodoro Stopwatch chỉ tính interval hoàn thành 100%, Streak, migration v1/v2 -> v3 an toàn & idempotent.
4. **Giai đoạn 2b — `__tests__/background/questCoordinator.test.ts` (~12 tests):** Atomic settlement `commitSessionOutcomeInternal`, concurrent `CLAIM_QUEST_REWARD` chống double-claim, từ chối claim khi quá kỳ, **regression suite khẳng định Coins/XP/Level/DailyStats thưởng của mọi loại phiên hiện có không thay đổi khi nối Quest**, và mở rộng `extensionClient.test.ts`.
5. **Giai đoạn 3 — `__tests__/core/statsAggregator.test.ts` (~10 tests):** Aggregation Day / Month / Year, năm nhuận, khoảng trống dữ liệu, Streak dài nhất/hiện tại, bất biến `lifetimeFocusMinutes`.
6. **Giai đoạn 5a — Cập nhật `__tests__/ui/extensionPopupShell.test.ts:32-33`** + kiểm chứng `civilizationView.test.ts:238`.
7. **Giai đoạn 6 — `__tests__/ui/questView.test.ts`, `statsView.test.ts`, `profileBottomSheet.test.ts`, `navigationRedesign.test.ts` (~20 tests):** 3-tab bottom nav, huy hiệu chưa nhận trên tab `Quest`, đồng hồ đếm ngược reset trên `QuestView`, Home mặc định là Civilization, nút quay về Home, Profile Bottom Sheet CRUD + active-session lock, `StatsView` + SVG Day/Month/Year, nút toggle `EN/VI`, thông báo Chrome Notification song ngữ.

---

## I. CÁC QUYẾT ĐỊNH ĐÃ CHỐT (APPROVED DECISIONS & SCOPE BOUNDARIES)

1. **Quy tắc sửa test cũ (ĐC-2):** Chỉ sửa **đúng 1 test** là `__tests__/ui/extensionPopupShell.test.ts:32-33` ngay ở **Giai đoạn 5a** sang assert 3 tab đáy + Home. `__tests__/ui/civilizationView.test.ts:238` **không tự ý sửa trước** — chỉ sửa nếu thực sự fail sau khi đổi nav và báo cáo rõ kết quả.
2. **Danh sách Quest đã chốt:**
   - Daily: `First Spark` (1 phiên, `10 Coins · 25 XP`), `Steady Rhythm` (60 phút tổng, `15 Coins · 35 XP`), `Double Tap` (2 phiên, `15 Coins · 40 XP`) — giữ trần `40 Coins · 100 XP / ngày`.
   - Weekly: `Habit Builder` (4 ngày phân biệt, `50 Coins · 120 XP`), `Deep Diver` (3 phiên `>= 45m`, `60 Coins · 150 XP`), `Weekly Tenacity` (10 phiên, `40 Coins · 100 XP`) — không thể thỏa hết bằng 1 hành vi đơn lẻ, giữ trần `150 Coins · 370 XP / tuần`.
   - Thưởng Quest cố định, không nhân `CoinBonus` hay Session Multiplier.
3. **Manual Claim & UX bắt buộc:** Giữ Manual Claim; `QuestView` phải hiển thị rõ thời gian reset (Daily & Weekly) và tab `Quest` phải có huy hiệu `"chưa nhận"` (`unclaimed badge`) rõ ràng.
4. **Cơ chế về Home:** Hỗ trợ cả bấm Brand/`← Map` trên Header lẫn bấm lại chính tab đáy đang active.
5. **Active Profile:** Chuyển vào `Start Focus` + `ProfileBottomSheet`, giữ `HeaderProps` tương thích ngược ở mức optional.
6. **Phạm vi Stats:** Tính toàn bộ từ `fq_daily_stats` hiện có (không prune dữ liệu cũ).
7. **i18n + `chimeEnabled` + deprecated `soundEnabled` (ĐC-1, ĐC-3, ĐC-4):**
   - **Giai đoạn 1a:** i18n lõi (`src/i18n/`), `UserSettings.language` & `chimeEnabled?: boolean` (`undefined` = bật), giữ `soundEnabled` làm trường cũ deprecated/ignored, bổ sung `SET_LANGUAGE` & `SET_CHIME_ENABLED` (types, `MessageHandler`, simulator `extensionClient.ts`), nút chuông tối thiểu ở `TimerView`, bọc `I18nProvider` quanh `App`.
   - **Giai đoạn 1b:** `src/blocked/blocked.ts` (MV3 CSP-safe), `vite.config.ts`, `public/blocked.html`, `public/_locales/{en,vi}/messages.json`, `public/manifest.json`, kiểm tra Chrome thật.
8. **Hoãn `manualChunks`:** Tạm hoãn tối ưu tách chunk Vite (`popup-*.js` >500 kB) ra ngoài phạm vi 5B.5.

---

## J. LỘ TRÌNH THI CÔNG TỪNG GIAI ĐOẠN (CẬP NHẬT ĐC-12: `1a → 5a → 5b → 5b-2 → 5b-3 → 4a → 4a-2 → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`)

**Quy tắc thi công bắt buộc:** Mỗi lượt chỉ thực hiện **ĐÚNG MỘT** giai đoạn dưới đây, chạy kiểm chứng thực tế, **ghi đè cập nhật `respond.md`** khi kết thúc lượt (kể cả khi chưa xong trọn vẹn) rồi **DỪNG chờ duyệt** trước khi sang giai đoạn tiếp theo.

1. **Giai đoạn 1a — Nền tảng i18n Lõi & Công tắc Chuông (`chimeEnabled`)** *(ĐÃ HOÀN TẤT)*
   - Tạo `src/i18n/` (`types`, `locales/en`, `locales/vi`, `translator`, `I18nContext`), thêm `language?: SupportedLocale` và `chimeEnabled?: boolean` vào `UserSettings`.
   - Giữ `soundEnabled` làm trường deprecated/ignored; cập nhật bỏ comment `"No audio in MVP"` tại `storageSchema.ts`, `v1_initialSchema.ts`, `storageManager.ts`.
   - Thêm `SET_LANGUAGE` & `SET_CHIME_ENABLED` vào `messages.ts`, `MessageHandler`, `extensionClient.ts`, trả `settings` qua `GET_SESSION_STATE`.
   - Gating `soundEffects` theo `chimeEnabled !== false`, thêm nút bật/tắt chuông tối thiểu có `aria-label` i18n trong `TimerView`, bọc `App` bằng `I18nProvider`.
   - Thêm `__tests__/core/i18n.test.ts`.
2. **Giai đoạn 5a — Điều hướng 3 Tab Đáy, Compact Header & Home Bản đồ (ĐC-5, ĐC-6)** *(ĐÃ HOÀN TẤT)*
   - Hạ `Navbar.tsx` thành 3-tab bottom bar (`Quest` | `Start Focus` CTA kèm chấm/nhãn trạng thái phiên khi chạy | `Stats`, chưa gắn badge chưa nhận ở 5a), làm gọn `Header.tsx` (`FOCUS QUEST`, Era mặc định `Stone Age`, Coins, `Lv. X`, XP, `?` giữ `data-testid="help-btn"`, nút chuyển `EN/VI` 1-chạm, `← Map` khi rời Home, huy hiệu khiên + tên profile chỉ hiện khi chạy phiên), chuyển `App.tsx` sang Home mặc định `'home'` (`Your Civilization` + `CivilizationScreen` giữ nguyên).
   - Tab `Quest` tạm thời (`Coming soon`, i18n); `Start Focus` (`TimerView`), `Stats` (`StatsView`), `ProfileAllowlistView` (lối vào tạm sub-view `'profiles'` có nút quay lại) và `RewardHelpModal` giữ nguyên nội dung cũ.
   - Sửa đúng 1 test `__tests__/ui/extensionPopupShell.test.ts:32-33` (theo ĐC-2), kiểm chứng `civilizationView.test.ts:238` (không sửa trước nếu chưa fail) và bổ sung test cho điều hướng mới (`navigationRedesign.test.ts`).
3. **Giai đoạn 5b — Start Focus (`TimerView`) & `ProfileBottomSheet` (ĐC-5, ĐC-6, ĐC-7)** *(ĐÃ HOÀN TẤT)*
   - Làm mới `TimerView.tsx` (tabs `Countdown | Stopwatch | Pomodoro`, chọn Profile & nút `Edit Profiles` khóa khi đang chạy, đồng bộ công tắc chuông `chimeEnabled`, đồng bộ thuật ngữ `Focus Session`).
   - Tạo `ProfileBottomSheet.tsx` thay cho lối vào tạm `ProfileAllowlistView` (Switch, Create, inline Rename, Delete có xác nhận & chặn xóa cuối, Add/Remove domains, strict active-session lock không nút bypass).
   - Bổ sung `RENAME_PROFILE`, `DELETE_PROFILE`, `GET_ACTIVE_PROFILE` vào simulator `extensionClient.ts`.
3b. **Giai đoạn 5b-2 — Bố cục màn hình ĐANG TẬP TRUNG (`FocusSceneArea` giữ chỗ, khung gọn 3 hàng, hàng điều khiển 3 cột) (ĐC-8, ĐC-9)** *(ĐÃ HOÀN TẤT)*
   - Tạo `getSessionModeLabel(session, t)` và `FocusSceneArea` (giữ chỗ tĩnh CSS/SVG theo `era` + `sceneState`, không sprite/ảnh ngoài/hoạt ảnh, chip góc trái + nút chuông góc phải).
   - Bố cục lại STATE 2 trong `TimerView.tsx`: `FocusSceneArea` bên trên, khung gọn 3 hàng bên dưới (`getSessionModeLabel`, lưới 3 cột `[Pause/Resume | thời gian | Give Up/End Session]`, dòng thưởng + chip hệ số), nút `"Skip Break & Start Next Focus"` khi nghỉ Pomodoro; bỏ dòng `Target: ...`, `pauses available`, và dải khóa `Edit Profiles` (kiểm tra xung đột test cũ).
   - Xác minh nguyên nhân chunk dùng chung (`domainNormalizer-*.js`) phình to do `MessageHandler` import `isSupportedLocale` từ `translator.ts` và tách `src/i18n/locale.ts`.
3c. **Giai đoạn 5b-3 — Sửa 3 lỗi sau 5b-2 (ĐC-10)** *(ĐÃ HOÀN TẤT)*
   - Nối dây nút `"Skip Break & Start Next Focus"` (`SKIP_POMODORO_BREAK`) qua prop riêng `onSkipBreak` (không kích hoạt nhánh tự chuyển pha `onAdvancePomodoroStage`), chuẩn hóa case `SKIP_POMODORO_BREAK` trong simulator `extensionClient.ts`.
   - Sửa lỗi `"Total Reward: 0 Coin, 0 XP"` ở Pomodoro Countdown trong simulator (`START_SESSION`/`ADVANCE_POMODORO_STAGE`) và fallback an toàn ở `TimerView.tsx`.
   - Sửa `FocusSceneArea` để SVG nền cỏ/đất/cảnh phủ đầy 100% chiều cao khung ở cả 160px và 300px (`absolute inset-0 w-full h-full`).
4. **Giai đoạn 4a — Sprite cho Bản đồ và Công trình Stone Age (ĐC-11)** *(ĐÃ HOÀN TẤT)*
   - Xây dựng `spriteData.ts`, `PixelSprite`, `TileImage`, `spriteRegistry.ts`, `SpriteGallery` (`#sprites`), dùng nền cỏ CC0 Tiny Town + 6 công trình tự vẽ theo bảng màu Tiny Town, gắn vào `MapGridView.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, giữ 100% logic placement/pan/zoom/demolish/khóa `"Milestone 5C"`.
4a-2. **Giai đoạn 4a-2 — Đất đầu game `8×8`, Chunk `4×4` & Cảnh quan rừng ở vùng chưa mở (ĐC-12 V2)** *(ĐÃ HOÀN TẤT)*
   - Chuyển lưới ban đầu sang `8×8` (`2×2` chunk `4×4`, `64` ô), mở rộng `4×4` (`+16` ô, giữ nguyên miễn phí tới 5B.6), giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2` (từ chối/re-seed state `10×10` cũ). Giữ nguyên `GridMapSnapshot = { chunks, buildings }` sạch không có `TerrainFeature`.
   - Tạo `terrainDecor.ts` thuần UI (`TERRAIN_DECOR_SEED = 5202402`, zero `Math.random`, an toàn tọa độ âm): vùng đã mở chỉ có cỏ (`0–2`), mảng đất thưa (`12–14, 24–26, 36–42`), đá rêu (`43`), mầm/nấm thưa (`17, 29`), tuyệt đối không có cây/chặn đặt; vùng chưa mở (viền 2 ô quanh bounding box trong `MapGridView`) ghép khối tán lá liền (`[6,8]/[30,32]`, `[9,11]/[33,35]`, `[7]/[31]`, `[10]/[34]`) xen cây đứng riêng CC0 Tiny Town (`3–5, 15–16, 27–28`) + lớp làm tối `bg-slate-950/50`.
   - Nâng `CELL_SIZE = 32` trên `MapGridView.tsx`, cập nhật `LandExpansionModal.tsx` (`4×4`, `+16 cells`), `SpriteGallery.tsx` (thêm mẫu khối tán lá ghép + mầm `#17` + nấm `#29` + đối chiếu 6×4 mở/khóa), `TILE_INDEX.md`, `CREDITS.md` và i18n EN/VI.
4b. **Giai đoạn 4b — Hoạt ảnh Cảnh Nhóm Người (`FocusSceneArea`, ĐC-11)**
   - Nâng cấp `FocusSceneArea` bằng cảnh nhóm người hoạt ảnh dùng nhân vật CC0 Tiny Dungeon (kèm đồ họa Stone Age đồng bộ).
5. **Giai đoạn 1b — `blocked.html` (MV3 CSP-safe), `_locales`, `manifest.json` & Kiểm tra Chrome thật**
   - Tạo `src/blocked/blocked.ts`, cập nhật `vite.config.ts` & `public/blocked.html`, thêm `public/_locales/{en,vi}/messages.json` & cập nhật `public/manifest.json` (`default_locale`, `description`).
6. **Giai đoạn 3 — Nâng cấp Stats Engine (`statsAggregator.ts`) & Biểu đồ SVG Thuần (ĐC-5)**
   - Bổ sung `aggregateDayStats`, `aggregateMonthStats`, `aggregateYearStats`, `calculateFocusStreak` (giữ `calculateLifetimeFocusMinutes`), bổ sung `GET_DAILY_STATS` vào simulator `extensionClient.ts`, tạo `StatsBarChart.tsx` (SVG thuần zero-dependency), thêm `__tests__/core/statsAggregator.test.ts`.
7. **Giai đoạn 2a — Types, Schema v3, Migration & Pure Quest Engine (Chưa nối vào Session)**
   - Tạo `src/types/quests.ts`, `src/core/quests/` (catalog Daily/Weekly mới, rollover `00:00`/Thứ Hai, anti-clock-rollback, Streak, quy tắc All-or-Nothing).
   - Thêm `STORAGE_KEYS.QUESTS`, `quests?: QuestState` vào `StorageSchema`, `v3_questsSchema.ts`, nâng `CURRENT_SCHEMA_VERSION = 3` trong `migrationRunner.ts`.
   - Thêm `__tests__/core/questEngine.test.ts` & `__tests__/storage/v3Migration.test.ts`. *(Tuyệt đối chưa đụng `SessionCoordinator` hoặc `commitSessionOutcomeInternal`.)*
8. **Giai đoạn 2b — Atomic Session Integration, `QuestCoordinator` & Message Wiring**
   - Mở rộng `StorageManager.commitSessionOutcomeInternal` (`questOutcomeDelta?` trong cùng `StorageMutex`), tạo `QuestCoordinator`, nối vào `SessionCoordinator` & `MessageHandler` (`GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`), bổ sung `GET_QUEST_STATE` & `CLAIM_QUEST_REWARD` vào simulator `extensionClient.ts`.
   - Thêm `__tests__/background/questCoordinator.test.ts` bao gồm **test khẳng định kết quả thưởng (Coins/XP/Level/DailyStats) của mọi phiên hiện có KHÔNG đổi**, và mở rộng `extensionClient.test.ts`.
9. **Giai đoạn 5c — Hoàn thiện `QuestView` & `StatsView`**
   - Hoàn thiện `QuestView.tsx` (Daily/Weekly quests, Manual `Claim Reward`, huy hiệu `"chưa nhận"` trên tab `Quest`, đếm ngược thời gian reset rõ ràng, cap, quy tắc phiên hoàn thành).
   - Nâng cấp `StatsView.tsx` (`Day | Month | Year`, điều hướng kỳ `◀ / ▶`, Streak, biểu đồ `StatsBarChart`, thuật ngữ `Sessions Completed`).
10. **Giai đoạn 6 — i18n Backend Notifications, `RewardHelpModal`, Error Codes & Bộ Test UI**
    - Đa ngôn ngữ 4 Chrome Notifications trong `SessionCoordinator`, bổ sung `errorCode`/`errorParams` trên `MessageResponse` (giữ `error` string tiếng Anh), đa ngôn ngữ `RewardHelpModal.tsx`, thêm `questView.test.ts`, `statsView.test.ts`, `profileBottomSheet.test.ts` (xử lý `civilizationView.test.ts:238` chỉ nếu thực sự fail).
11. **Giai đoạn 7 — Đồng bộ Tài liệu & Nghiệm thu Cuối**
    - Cập nhật `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md` (gồm sửa số test cũ ở `README.md:67`), rà soát mọi bất biến Zero Passive Income / Allowlist Lock / All-or-Nothing / Milestone 5C, chạy full `npm test`, `npm run lint`, `npm run clean && npm run build` và chốt báo cáo nghiệm thu cuối vào `respond.md`.

---

## K. QUY TẮC DUY TRÌ BÁO CÁO (`respond.md`)

1. Bản kế hoạch chính thức đã lưu tại `respond_plan_5B.5.md` (giữ nguyên mọi file `respond_*.md` trước đó).
2. Ở cuối **MỖI giai đoạn (`1a`, `1b`, `2a`, `2b`, `3`, `4`, `5a`, `5b`, `5c`, `6`, `7`)**, **ghi đè cập nhật `respond.md`** thành báo cáo trạng thái của giai đoạn vừa thực hiện (kèm kết quả thực tế `npm test`, `npm run lint`, `npm run build` và những gì làm được / chưa xong nếu bị gián đoạn), rồi **DỪNG chờ duyệt** trước khi sang giai đoạn tiếp theo.
