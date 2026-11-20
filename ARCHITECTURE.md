# Focus Quest — Technical Architecture Specification (Manifest V3)

**Version:** 1.9.0  
**Status:** MV3 Background, Offscreen LOFI Streaming, Civilization Engine (UX-5 Bitmap & UX-5.1 Cinematic Camera Approved; **Stage 5C-1 `UPGRADE_BUILDING`**), Schema v3 QuestCoordinator & Atomic Settlement (**Milestone 5B.5 Closed & Approved**)  
**Target Platform:** Google Chrome Extension (Manifest V3, Chrome >= 116)  
**Language & Stack:** TypeScript, React 19 (Popup & Blocked UI), Tailwind CSS 4, Chrome Extension APIs (`declarativeNetRequest`, `alarms`, `notifications`, `offscreen`, `storage`, `runtime`, `action`, `i18n`)  

---

## 1. Executive Summary & Design Principles

Focus Quest là một Chrome Extension Manifest V3 kết hợp công cụ năng suất nghiêm ngặt và hệ thống game hóa tiến trình. Trong môi trường Manifest V3, **Service Worker là ephemeral (phù du - bị hủy/suspend khi không hoạt động sau ~30 giây)**. 

### Nguyên tắc Bắt buộc:
1. **Background Service Worker là Single Source of Truth:**
   - Mọi thao tác làm thay đổi trạng thái phiên (`START`, `PAUSE`, `RESUME`, `GIVE_UP`, `FINISH`) và trao thưởng tiền tệ/XP **bắt buộc** phải được điều phối tập trung qua Background Service Worker (`SessionCoordinator`).
   - Popup, side panel hoặc bất kỳ UI context nào tuyệt đối không được tự ý ghi đè trạng thái hay tự cộng Coins/XP. UI chỉ gửi Message Command và render State phản ánh từ Storage.
2. **State Hydration from Wall-Clock Timestamps:**
   - Không bao giờ dựa vào biến trong RAM hoặc vòng lặp `setInterval`. Mọi tính toán thời gian dựa trên `TimeCalculator` với mốc thời gian thực (`startedAt`, `totalPauseMs`, `currentPauseStartedAt`) được lưu bền vững trong `chrome.storage.local`.
   - Chrome Alarms chỉ là cơ chế đánh thức (wake-up signal); khi alarm kích hoạt, hệ thống luôn đọc lại timestamp thực tế để tính toán trạng thái.
3. **Idempotent Operations & Double-Action Protection:**
   - Cờ `rewardProcessed: true` và `notificationSent: true` được ghi bền vững ngay trong transaction đầu tiên để ngăn chặn việc trao thưởng trùng hoặc gửi thông báo lặp lại khi có retry hay restart.
4. **Resilient Allowlist Blocking:**
   - Sử dụng `chrome.declarativeNetRequest` để chuyển hướng điều hướng `main_frame` ngoài allowlist về trang nội bộ `/blocked.html`.
   - Khi phiên `IDLE`, `COMPLETED`, `ABANDONED`, hoặc `INTERRUPTED`, dynamic rules được xóa sạch 100%.

---

## 2. Chrome Extension Manifest & Permissions Model

File cấu hình Manifest V3 (`public/manifest.json`):
```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "default_locale": "en",
  "description": "__MSG_extDescription__",
  "permissions": [
    "storage",
    "alarms",
    "notifications",
    "declarativeNetRequest",
    "offscreen"
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "index.html",
    "default_title": "__MSG_extName__"
  },
  "web_accessible_resources": [
    {
      "resources": ["blocked.html", "blocked.js", "assets/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```
*Ghi chú:* Vite đóng gói **4 entrypoint** (`index.html` → popup, `src/background/index.ts` → `dist/background.js`, `src/blocked/blocked.ts` → `dist/blocked.js`, `public/offscreen.html` + `src/offscreen/offscreen.ts` → `dist/offscreen.js` không có inline script theo CSP MV3) cùng thư mục `public/_locales/{en,vi}/messages.json`.

### Phân tích và Biện minh Quyền (Permissions Justification):
- `"storage"`: Lưu trữ bền vững dữ liệu session, profiles, ví kinh tế, thống kê ngày, trạng thái nhạc và cache danh mục bài hát trên máy người dùng.
- `"alarms"`: Đánh thức Service Worker khi Countdown chạm đích (`FQ_ALARM_COUNTDOWN_FINISH`) hoặc khi Pause chạm mốc 5 phút (`FQ_ALARM_PAUSE_AUTO_RESUME`).
- `"notifications"`: Phát Chrome Notification hệ thống khi hoàn thành phiên Countdown, Stopwatch (>= 5m), Pomodoro hoặc chuyển pha. (Hiệu ứng âm thanh chuông chuyển phase được thực hiện riêng bằng Web Audio API trong `soundEffects.ts` khi Popup mở).
- `"declarativeNetRequest"`: Chặn hoặc chuyển hướng các điều hướng `main_frame` không nằm trong Allowlist ở cấp độ network của trình duyệt.
- `"offscreen"`: Tạo Offscreen Document ẩn với reason `['AUDIO_PLAYBACK']` (Chrome >= 116 để hỗ trợ `chrome.runtime.getContexts`) nhằm duy trì phát nhạc nền `<audio>` liên tục ngay cả khi Popup đóng.
- `"host_permissions": ["http://*/*", "https://*/*"]`: Đã tồn tại sẵn cho `declarativeNetRequest` `redirect` sang `blocked.html`. **Không thêm bất kỳ `host_permissions` mới nào cho LOFI-1.** Việc tải `tracks.json` từ GitHub Pages chỉ thực hiện HTTPS `fetch()` tới CDN công khai hỗ trợ CORS.

---

## 3. Kiến trúc Background Service Worker & Message Protocol

```
┌────────────────────────────────────────────────────────────────────────┐
│                              UI CONTEXT                                │
│                     Popup / Blocked Page / Options                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ chrome.runtime.sendMessage(msg)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND SERVICE WORKER                         │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ MessageHandler (Validation, Routing, Standard Response)      │     │
│   └───────────────┬──────────────────────────────┬───────────────┘     │
│                   │                              │                     │
│                   ▼                              ▼                     │
│   ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│   │ SessionCoordinator         │  │ ProfileManager / QuestCoord.│     │
│   │ - startSession / pause/res.│  │ - Profile CRUD & allowlist  │     │
│   │ - completeCountdown        │  │ - getQuestState (rollover)  │     │
│   │ - finishStopwatch          │  │ - claimQuestReward (atomic) │     │
│   │ - giveUpCountdown          │  └──────────────┬──────────────┘     │
│   │ - recoverSession (startup) │                 │                    │
│   └──────┬──────────────┬──────┘                 │                    │
│          │              │                        │                    │
│          ▼              ▼                        ▼                    │
│   ┌─────────────┐ ┌─────────────┐ ┌──────────────────────────────┐     │
│   │ Alarms      │ │ Notify      │ │ BlockingCoordinator (DNR)    │     │
│   │ Adapter     │ │ Adapter     │ │ - applyAllowlistRules        │     │
│   └─────────────┘ └─────────────┘ │ - clearBlockingRules         │     │
│                                   │ - reconcile                  │     │
│                                   └───────────────┬──────────────┘     │
│                                                   │                    │
│   ┌───────────────────────────────────────────────┴──────────────┐     │
│   │ StorageManager & Mutex (chrome.storage.local)                │     │
│   │ - Atomic batch: Session, Economy, Daily Stats, Quests, Civ   │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Message Protocol Contract (`src/types/messages.ts`)
Tất cả các tin nhắn đều có payload và response có cấu trúc chuẩn:
```typescript
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorParams?: ErrorParams;
}
```
Các action được hỗ trợ:
- Session & Pomodoro: `GET_SESSION_STATE`, `START_SESSION`, `PAUSE_SESSION`, `RESUME_SESSION`, `GIVE_UP_SESSION`, `FINISH_STOPWATCH`, `SKIP_POMODORO_BREAK`, `ADVANCE_POMODORO_STAGE`, `RESET_SESSION`, `HEARTBEAT`.
- Profiles: `GET_PROFILES`, `GET_ACTIVE_PROFILE`, `SWITCH_PROFILE`, `CREATE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE`, `ADD_DOMAIN`, `REMOVE_DOMAIN`.
- Economy & Stats: `GET_ECONOMY`, `GET_DAILY_STATS`.
- Civilization & Quests (Storage Schema v3, `CURRENT_SCHEMA_VERSION = 3`): `fq_civilization` giữ nguyên cấu trúc v2 (lưới `8×8` / chunk `4×4` mở rộng theo `origin`, `Level >= k + 2`).
  - **Nâng cấp, Phá dỡ 50% & Giới hạn xây dựng Build Limit (`Stage 5C-1` — `src/core/civilization/buildingUpgrade.ts`):** `CivilizationCoordinator.upgradeBuilding` xử lý `UPGRADE_BUILDING { buildingId, expectedLevel }` hoàn toàn trong `StorageManager.executeCivilizationTransaction` dưới `StorageMutex` (kiểm tra khóa lạc quan `expectedLevel` chống race bấm đúp → `BUILDING_LEVEL_MISMATCH`, chỉ nâng nhóm `ECONOMY_EFFECT`, kiểm tra `minPlayerLevel + currentLevel`, trừ `focusCoins`, cập nhật `cachedBonuses` trong `onCommitted` trước khi nhả lock, không chạm `fq_daily_stats`/`fq_quests`). `PLACE_BUILDING` áp giới hạn xây dựng `MAX_ECONOMY_EFFECT_BUILDINGS = 4` riêng theo từng loại công trình (`CIV_ECONOMY_BUILDING_LIMIT_REACHED`); `REMOVE_BUILDING` hoàn trả nguyên tử `50%` tổng Coins đã đầu tư via `refundCoins` trong `executeCivilizationTransaction`.
  - **Quyết toán Quest nguyên tử (`StorageManager.commitSessionOutcomeInternal`):** Chỉ khi phiên kết thúc hợp lệ (`COMPLETED` qua `toQuestOutcomeDelta`), đọc `fq_quests` (tự phục hồi bằng `sanitizeQuestState` nếu thiếu/hỏng), chạy `rolloverQuestState` rồi `applyCompletedSession`, và ghi đồng thời `CURRENT_SESSION + ECONOMY + DAILY_STATS + QUESTS` trong một `setMultiple` duy nhất dưới `StorageMutex` kèm rollback compensation nếu ghi thất bại; lỗi Quest được cô lập hoàn toàn để không bao giờ làm hỏng quyết toán phiên. Nhánh `Give Up` / `INTERRUPTED` / Stopwatch `< 5m` / Pomodoro Stopwatch `0` interval / `Reset` không đụng tới `fq_quests`.
  - **`QuestCoordinator` (`src/background/questCoordinator.ts`):** Quản lý `GET_QUEST_STATE` (persist khi rollover ngày/tuần mới, trả `questState`, `resetCountdown`, `unclaimedCount`) và `CLAIM_QUEST_REWARD` (chỉ trả thưởng phẳng vào `ECONOMY` qua `commitQuestClaimInternal`, dùng đúng `calculatePlayerLevel(totalXP)` và **không bao giờ ghi vào `fq_daily_stats`**).
  - Messages: `GET_CIVILIZATION_STATE`, `PLACE_BUILDING`, `REMOVE_BUILDING`, `UPGRADE_BUILDING`, `EXPAND_LAND`, `GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`.
- Preferences: `SET_LANGUAGE`, `SET_CHIME_ENABLED`, `SET_MUSIC_PLAYER_EXPANDED`.
- Focus Music Player: `MUSIC_GET_STATE`, `MUSIC_GET_CATALOG`, `MUSIC_REFRESH_CATALOG`, `MUSIC_PLAY_TRACK`, `MUSIC_PAUSE`, `MUSIC_RESUME`, `MUSIC_STOP`, `MUSIC_NEXT`, `MUSIC_PREVIOUS`, `MUSIC_SEEK`, `MUSIC_SET_VOLUME`, `MUSIC_SET_SHUFFLE`, `MUSIC_SET_REPEAT`.
- SW ↔ Offscreen Document (lọc bằng `target: 'offscreen' | 'background'`): `MUSIC_PLAY`, `MUSIC_PAUSE`, `MUSIC_STOP`, `MUSIC_SEEK`, `MUSIC_SET_VOLUME`, `MUSIC_GET_STATUS` ↔ `MUSIC_POSITION`, `MUSIC_ENDED`, `MUSIC_ERROR`.
- **Lỗi có cấu trúc & Bản địa hóa (`src/types/errors.ts`, `src/i18n/errorTranslator.ts`):** Các coordinator và `MessageHandler` ném/trả `AppError` kèm `107` `ErrorCode` chuẩn hóa + `errorParams` (giữ `error: string` tiếng Anh tương thích ngược). Phía UI chuyển mọi exception qua `toUiErrorPayload` và render qua `localizeErrorMessage` (dịch đủ 107 mã + 4 mã offscreen legacy trong EN/VI, làm sạch mọi chuỗi lỗi kỹ thuật / stack trace).
- **Thông báo & Hiển thị (`src/background/notificationFormatter.ts`, `src/core/reward/rewardPreview.ts`):** Chrome Notifications chạy qua `formatSessionNotificationContent` (đọc `settings.language`, định dạng số thập phân half-up tối đa 2 chữ số từ `formatRewardAmount` tách khỏi `SessionCoordinator`); `getSessionRewardPreview` dùng chung nguồn công thức cho cả Setup/Running/Outcome và phản ánh đúng `0 Coins / 0 XP` khi `POMODORO_STOPWATCH` bị `EXTENSION_DISABLED`/`EXTENSION_RELOADED`.

### 3.2. Idempotent Reward Processing & Session Persistence
1. **Idempotency Guard:**
   - Khi phiên hoàn thành (`completeCountdown` hoặc `finishStopwatch`), hệ thống kiểm tra cờ `rewardProcessed`.
   - Nếu `rewardProcessed === true`, hàm trả về session hiện tại ngay lập tức, không cộng thêm tiền vào `economy` và không tăng số đếm trong `dailyStats`.
2. **Khôi phục Phiên khi Khởi động lại (Recovery Mechanism):**
   - Khi Service Worker khởi động (`chrome.runtime.onStartup` hoặc script evaluation), `sessionCoordinator.recoverSession()` được gọi tự động:
     - Nếu Countdown đang `RUNNING` và thời gian hiện tại đã vượt quá thời điểm kết thúc mục tiêu (do máy tính sleep hoặc worker suspend): tự động gọi `completeCountdown()` để chốt thưởng và dọn dẹp.
     - Nếu Countdown đang `RUNNING` và chưa hết giờ: tái tạo `COUNTDOWN_FINISH_ALARM` với thời gian còn lại chính xác, kích hoạt lại DNR rules.
     - Nếu đang `PAUSED`: nếu thời gian pause đã vượt quá 5 phút -> tự động kích hoạt `resumeSession(true)` (auto-resume); nếu chưa quá 5 phút -> đặt lại alarm `PAUSE_AUTO_RESUME` cho khoảng thời gian còn lại.
     - Nếu phiên ở trạng thái kết thúc (`COMPLETED`, `ABANDONED`, `INTERRUPTED`): dọn sạch DNR rules và badge để không chặn web nhầm.

---

## 4. DeclarativeNetRequest (DNR) Blocking Coordinator

### 4.1. Quy tắc Sinh Dynamic Rules
- **Rule ID cơ sở:** `FOCUS_BLOCK_RULE_BASE_ID = 20000`.
- **Condition:** Chặn điều hướng `main_frame` với `urlFilter: "|http*"` (tất cả các trang web ngoài HTTP/HTTPS).
- **Excluded Domains:** Trích xuất từ `activeProfile.allowedDomains`. Ví dụ `['wikipedia.org', '*.github.com']` -> `excludedRequestDomains: ['wikipedia.org', 'github.com']`.
- **Allowlist rỗng (`allowedDomains: []`):** Chặn toàn bộ web bên ngoài (`excludedRequestDomains: undefined`).
- **Action:** Chuyển hướng (`redirect`) sang `extensionPath: "/blocked.html"`.

### 4.2. Ranh giới & Giới hạn Kỹ thuật của Trình duyệt (DNR Boundaries)
1. **Các trang bảo vệ của Chrome:** Chrome tuyệt đối cấm extension can thiệp vào `chrome://*`, `chrome-extension://*`, `about:*` và Chrome Web Store (`chromewebstore.google.com`).
2. **Sub-resources & LOFI Streaming Non-Interference:** Cơ chế chặn chỉ áp dụng nghiêm ngặt cho `resourceTypes: ['main_frame']` (chỉ chặn điều hướng tab). Yêu cầu `fetch(LOFI_CATALOG_URL)` từ Background Service Worker và luồng `<audio>` HTTPS từ Offscreen Document thuộc `xmlhttprequest`/`media` trong context extension (`chrome-extension://*`), hoàn toàn **không bao giờ bị DNR chặn** ngay cả khi Allowlist của người dùng đang rỗng (`allowedDomains: []`).

---

## 5. Chrome Alarms & Notifications Boundary

1. **Alarms:**
   - Chrome Alarms có độ trễ nhỏ (không cam kết chính xác đến từng mili-giây, thông thường sai số từ 1–10 giây tùy tải của hệ điều hành). Do đó, khi Alarm kích hoạt, hệ thống luôn lấy `Date.now()` và chạy qua `TimeCalculator` để tính toán chính xác, không dùng Alarm làm thước đo thời gian có thẩm quyền.
2. **Notifications:**
   - Sử dụng cho thông báo hoàn thành Countdown / Stopwatch (>= 5m) / Pomodoro, chuyển sang giờ nghỉ (Short / Long Break), và hết giờ nghỉ quay lại pha Focus.
   - `SessionCoordinator` đọc `settings.language` từ storage (`resolveLocale`) và gọi `translate(...)` để phát thông báo song ngữ EN/VI nhất quán.
   - Bọc trong try/catch an toàn; nếu người dùng tắt quyền thông báo hoặc bật Do Not Disturb, lỗi notification chỉ được ghi log và **không làm gián đoạn** giao dịch trao thưởng trong storage.
   - Cờ `notificationSent: true` đảm bảo notification hoàn thành chỉ được bắn đúng một lần duy nhất cho mỗi session ID.

---

## 6. Giao diện Popup, Cảnh quan UI, Quests & Stats (Stages B–E, UX-5 & 5c)
- **Điều hướng Popup 400×600px:** `Navbar.tsx` dùng 5 tab đáy (`Quests | Focus | Map | Awards | Stats`), mặc định mở `map` (`CivilizationScreen`), hỗ trợ huy hiệu phần thưởng chưa nhận (`quest-unclaimed-badge` ẩn khi `0`, `1..9`, `9+` khi `>=10`) trên tab `Quests`, và đóng/mở `ProfileBottomSheet`, `RewardHelpModal`, `MusicPlayerSheet` và `SpriteGallery` (`#sprites` chỉ ở Web Preview).
- **Tab Quests, Stats & Stage 6–7 Polish (Giai đoạn 5c + 6–7):**
  - `src/ui/components/quests/QuestView.tsx` + `src/ui/utils/questFormatting.ts`: đọc động định nghĩa và cap Daily/Weekly từ `questCatalog.ts`, hiển thị 4 trạng thái thẻ (`IN_PROGRESS`, `READY`, `CLAIMED`, `EXPIRED`), đếm ngược reset 1s/giây kèm auto-refetch 1 lần khi chạm `0`, khóa chống bấm đúp khi gọi `CLAIM_QUEST_REWARD`, thẻ Quest Streak (0 Coin thụ động), và thông báo lỗi bản địa hóa qua `errorTranslator.ts`.
  - `src/ui/components/StatsView.tsx` + `src/ui/utils/statsPeriod.ts` + `src/ui/utils/focusStatUnlock.ts`: nâng cấp 3 chế độ `Day | Month | Year` trên nền `statsAggregator.ts` & `StatsBarChart.tsx` (neo ngày địa phương via `getLocalDateKey`, khóa không bước qua tương lai, xử lý năm nhuận 29/02 và `completionRate === null`; cột biểu đồ `<g role="img" tabIndex={0}>` tránh lỗi button lồng nhau), kèm thẻ `Focus Streak` khóa/mở theo effect `FOCUS_STAT_UNLOCK` (`focus_metric_streak_analysis` của `stone_age_elder_hut`). Chỉ còn tab `Awards` giữ chỗ `"Coming soon"`.
  - `src/ui/components/RewardHelpModal.tsx`: đọc động hệ số & tỉ lệ cơ bản từ `DEFAULT_REWARD_CONFIG` + `MultiplierRules`, giải thích đầy đủ `CoinBonus`, All-or-Nothing/Settlement, Quests thưởng phẳng & độ chính xác số thực IEEE-754 trong EN/VI (`545` khóa i18n, kiểm tra tĩnh `0` chuỗi/thuộc tính hardcode trong `src/ui/` trừ `SpriteGallery.tsx`).
  - `BuildingDetailsModal.tsx`, `BuildingCatalogPanel.tsx`, `MapGridView.tsx` & `CivilizationScreen.tsx` (**Giai đoạn 5C-1**): mở khóa phần nâng cấp trong `BuildingDetailsModal` dùng `evaluateBuildingUpgrade` + `UPGRADE_BUILDING` với khóa chống bấm đôi theo `building.id` (`inFlightLockRef`), hiển thị preview `+X% → +Y% CoinBonus`, cảnh báo hoàn 50% khi phá dỡ, huy hiệu cấp độ trên `MapGridView` khi `level > 1`, bộ đếm `limit 4/4` ở `BuildingCatalogPanel`, và gọi `onStateMutated()` đồng bộ tức thì `civBonusRate` sang `TimerView` khi đang mở Popup.
- **Cảnh quan Canvas Tổng hợp Một Tấm (`UX-5`), Persistent Camera (`UX-5.1`) & Hiệu ứng mở đất:**
  - `terrainDecor.ts` giữ nguyên thuật toán đặt cảnh quan mở & 6 mẫu rừng tối M1–M6 xác định (không lưu trong storage, không cản đặt công trình).
  - Toàn bộ nền địa hình của `MapGridView` được `terrainBitmapRenderer.ts` (`buildTerrainBitmapPlan`, `renderTerrainBitmap`, `renderTerrainBitmapIfNeeded`) + `TerrainBitmapCanvas.tsx` ghép sẵn vào **một `<canvas>` duy nhất** kích thước gốc `(cols × 16) × (rows × 16)` (`imageSmoothingEnabled = false`, `image-rendering: pixelated`), vẽ đúng thứ tự UX-3 (`nền -> lớp bù tối tùy chọn -> cây -> lớp phủ #020617` dùng `computeLockedForestOpacities`), có fallback màu phẳng khi ảnh spritesheet lỗi, và **chỉ vẽ lại khi `contentKey` đổi** (mở đất / hết hiệu ứng che / đổi seed — không bao giờ vẽ lại khi pan hoặc zoom), giúp triệt tiêu 100% khe sáng/lưới sub-pixel ở mọi mức DPR (`1..3`), zoom (kể cả Expansion auto-fit) và pan.
  - Phía trên `<canvas>` là lưới ô tương tác trong suốt (`map-interaction-grid`, `0` thẻ `<img>` địa hình), giữ nguyên hover đặt công trình, khung chunk, công trình (`PixelSprite`), slot mở rộng, và hiệu ứng rìu chém rừng `127` (`ExpansionRevealOverlay.tsx` + `expansionReveal.ts`, lộ đất ở `680ms`, rung `340ms`, tổng `1150ms`). Sân khấu camera (`getMapStageClassName`) tắt `transition-transform` và `shadow-sm` trong khi kéo/tĩnh (chỉ bật `160ms` ngắn khi bấm nút zoom). Camera Expansion Mode (`expansionCamera.ts`) giữ nguyên pan/zoom khi mở chế độ, trượt `600ms` (`easeInOutCubic`) tới tâm chunk khi chọn và trượt về vị trí cũ kèm bù `renderBox`.
- **Blocked Page CSP-Safe:** `public/blocked.html` ẩn thẻ bằng opacity anti-flash cho tới khi `blocked.js` (`src/blocked/blocked.ts`) đọc `fq_settings` từ `chrome.storage.local` để áp dụng ngôn ngữ EN/VI và lắng nghe `chrome.storage.onChanged`.

---

## 7. Milestone LOFI — Kiến trúc Offscreen Streaming & Quy tắc Đồng bộ Phiên (LOFI-1 / LOFI-2)

### 7.1. Kiến trúc Offscreen & Quy tắc 30 giây của Chrome
- `ChromeOffscreenAdapter` quản lý single-flight (`creatingPromise`) cho `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })` (Chrome >= 116) và `chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'] })`.
- `public/offscreen.html` + `src/offscreen/offscreen.ts` chạy `<audio id="lofi-audio" preload="metadata">` ngoài vòng đời Popup, tuân thủ CSP MV3 (không inline script).
- **Xử lý tự đóng sau 30 giây im lặng (`AUDIO_PLAYBACK`):** Hệ thống **không** dùng âm thanh im lặng giả hay mẹo keepalive. Trong khi phát, Offscreen gửi `MUSIC_POSITION` mỗi `5s` và khi pause/seek/ended về `MusicCoordinator` lưu bền vững vào `STORAGE_KEYS.MUSIC_STATE`. Nếu Chrome đóng Offscreen Document khi không hoạt động quá 30 giây trong lúc còn phiên đang chạy/tạm dừng, lần đồng bộ hoặc điều khiển tiếp theo tự kiểm tra `hasDocument()` và tái tạo document qua `ensureDocument()` với `MUSIC_PLAY { startAtSec: savedPosition }`.

### 7.2. Quy tắc Hiển thị & Phát/Dừng Nhạc (LOFI-2)
- **Hiển thị theo phiên tập trung (`App.tsx`, `MusicPlayerSheet.tsx`):** Mini-player (`56px`, thanh tiến độ `3px` ở mép trên) và Bottom Sheet mở rộng (`rounded-t-[22px]`, backdrop mờ) **chỉ render ở đáy màn Tập trung khi phiên đang ở trạng thái `RUNNING` hoặc `PAUSED`** (bao gồm focus, `SHORT_BREAK`, `LONG_BREAK`). Không hiển thị ở ngoài phiên (`null`/`IDLE`), không hiển thị ở các tab khác, và không hiển thị ở màn kết quả sau khi phiên đã kết thúc (`COMPLETED`/`ABANDONED`/`INTERRUPTED`).
- **Quy tắc Phát/Dừng (`deriveMusicIntent` & `MusicCoordinator.syncInternal`):**
  - `deriveMusicIntent(snapshot)` trả về `'keep'` khi `snapshot.status` là `'RUNNING'` hoặc `'PAUSED'`, và `'stop'` cho mọi trạng thái còn lại (`null`, `'IDLE'`, `'COMPLETED'`, `'ABANDONED'`, `'INTERRUPTED'`).
  - **Pause phiên, Resume phiên, nghỉ ngắn, nghỉ dài không làm thay đổi trạng thái phát nhạc** (nhạc đang phát tiếp tục phát, nhạc đang tạm dừng thủ công giữ nguyên tạm dừng).
  - **Không tự động phát** khi bắt đầu phiên (`START_SESSION`); người dùng tự bấm phát, giữ nguyên `currentTrackId`, `volume`, `muted`, `shuffle`, `repeatMode`.
  - **Dừng hẳn (`STOPPED`, đóng Offscreen Document, `positionSec = 0`, giữ nguyên bài & tùy chọn đã chọn)** ngay khi phiên kết thúc vì bất cứ lý do gì (hoàn thành, `Give Up`, `INTERRUPTED`, `RESET_SESSION`, recovery không còn phiên hoạt động) hoặc khi `MUSIC_GET_STATE` / sự kiện từ offscreen phát hiện nhạc còn phát mà không có phiên hoạt động.
  - Gỡ bỏ các message/tùy chọn cũ `MUSIC_SET_SYNC_WITH_SESSION`, `MUSIC_SET_PLAY_DURING_BREAK`, `stopMusicOnSessionEnd`, `musicPlayDuringBreak`, `pausedBySession`; dữ liệu cũ trong storage được bỏ qua an toàn khi chuẩn hóa state.

### 7.3. Catalog Online Động, Kiểm tra An toàn & Cô lập Mutex
- **Không đóng gói audio trong repo/extension:** `LOFI_CATALOG_URL` (`https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json`) được `MusicCoordinator` fetch từ Background Service Worker (cache TTL `6` giờ ở `STORAGE_KEYS.MUSIC_CATALOG_CACHE`), dựng URL HTTPS từ `LOFI_BASE_URL`, và fallback cache cũ nếu mạng lỗi hoặc JSON hỏng.
- **Phòng vệ Catalog không đáng tin cậy:** `parseRemoteCatalog` từ chối payload không phải object, `schemaVersion !== 1`, mảng `tracks > 200`, chuỗi/URL quá dài; bỏ qua và đếm (`skippedCount`) các bài thiếu `title`/`artist`/`license`/`licenseUrl`/`sourceUrl`, sai định dạng/trùng `id` (`^[a-z0-9-]+$`), URL không phải `https://`, `file` chứa `..`/`/`/`\`, hoặc giấy phép ngoài danh sách SPDX cho phép (`CC0-1.0`, `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-SA-3.0`, `CC-BY-SA-4.0`). Nếu bài đang chọn biến mất khi refresh, tự động chuyển về bài đầu tiên (`positionSec: 0`). Nếu lần đầu mở offline chưa có cache, UI hiển thị hàng gọn `"Chưa tải được nhạc"` + nút Thử lại (`music-mini-retry-btn` / `music-retry-catalog-btn`) mà không crash.
- **Đồng bộ `SessionCoordinator` & Cô lập Mutex:** Các điểm chuyển trạng thái phiên gọi `onSessionSyncHook` / `onSessionEndedHook` **sau khi giải phóng `StorageMutex`** và bọc `try/catch` để không bao giờ giữ lock khi gọi Offscreen IPC hay làm sai lệch Coin/XP/commit thưởng.

### 7.4. Ghi chú Quyền riêng tư (Privacy Note)
- Khi fetch `tracks.json` hoặc stream file `.mp3` từ `https://khangbui2010.github.io/FocusQuest-LOFI-archive/`, kết nối HTTPS trực tiếp từ trình duyệt người dùng tới GitHub Pages CDN sẽ để lộ **địa chỉ IP và HTTP headers chuẩn (như `User-Agent`)** cho máy chủ host tĩnh (`github.io`). Extension không gửi cookie theo dõi, không gửi telemetry và không gửi bất kỳ dữ liệu phiên tập trung nào ra ngoài.
