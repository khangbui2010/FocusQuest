# Focus Quest — Technical Architecture Specification (Manifest V3)

**Version:** 1.17.0  
**Status:** MV3 Background, Offscreen LOFI Streaming, Civilization Engine (UX-5 Bitmap, UX-5.1 Camera, **Stage 5C-1**, **Milestone Villager V1–V5.2**, **Milestone 5E-1/1b/1c/2/2b**, **Milestone 5E-3 Cave Entry Animation**), Storage Schema v7 (`v4_villagersSchema` + `v5_questPoolSchema` + `v6_constructionJobsSchema` + `v7_awardsSchema`), Quest Pool & Atomic Settlement (**Milestone 5B.5 & 5D-1**), & Tiered Stone Age Awards (**Milestone 5D-2**)  
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
- Civilization, Quests & Awards (Storage Schema v7, `CURRENT_SCHEMA_VERSION = 7`): `fq_civilization` giữ `schemaVersion = 2` (`CURRENT_CIVILIZATION_SCHEMA_VERSION = 2`, lưới `8×8` / chunk `4×4` mở rộng theo `origin`, `Level >= k + 2`), `villagers?: readonly Villager[]` (`v4_villagersSchema`), `jobs?: readonly ConstructionJob[]`, và `founderRole?: VillagerRole | null` (backfill tự động qua `v6_constructionJobsSchema.ts` ở **`Milestone 5E-1`**); `fq_quests` dùng `CURRENT_QUEST_STATE_VERSION = 2` qua `v5_questPoolSchema.ts`; `fq_awards` (`STORAGE_KEYS.AWARDS`, `CURRENT_AWARDS_STATE_VERSION = 1`) được khởi tạo và backfill với `seen: true` từ lịch sử qua `v7_awardsSchema.ts` ở **`Milestone 5D-2`**.
  - **Công việc Xây dựng theo Đội dân làng, FIFO & Đếm ngược đến giây (`Milestone 5E-1` — `src/core/civilization/jobs.ts`, `StorageManager.commitSessionOutcomeInternal`):**
    - 3 loại việc: `place`, `upgrade`, `expand` với thời lượng lưu **số nguyên giây Focus** (*Campfire*: `0` dân / `0s` tức thì; *Totem*, *Rock Shelter*, *Foraging Post*: `1` dân / `3600s`; *Elder's Hut*, *Primitive Granary*: `2` dân / `7200s`; nâng cấp `L → L+1`: `1` dân nếu `L <= 2` / `2` dân nếu `L >= 3`, `300 × L` giây; mở đất: `2` dân / `3600s`).
    - `assignJobsFifo(jobs, totalVillagers)` và `assignJobsWithSchedule(jobs, totalVillagers, options?)` (`Milestone 5E-2`) cấp trạng thái `ACTIVE` tối đa `MAX_ACTIVE_CONSTRUCTION_JOBS = 4` việc đồng thời trong giới hạn tổng thợ (`recruited + founder`), ưu tiên `priorityJobIds` hợp lệ trước khi điền bổ sung FIFO khi `autoContinue !== false`, và tuần tự từng bậc nâng cấp trên cùng công trình; `assignVillagersToActiveJobs` phân bổ từng dân làng thật (`founder_villager` trước rồi `villagers`) không trùng lặp giữa các việc `ACTIVE`.
    - `MessageHandler` + `SessionCoordinator.startSession` (`START_SESSION`) kiểm tra nguyên tử `assignedJobIds` qua `validateSessionJobAssignment` bên trong `storage.runExclusive` (từ chối với `6` mã `SESSION_*` mà không đổi `activeProfileId` hay `currentSession`) và lưu `assignedJobIds?` / `autoContinueJobs?` trên `SessionSnapshot`; `SessionCoordinator` truyền `advanceCivilizationJobsSeconds = completedFocusMinutes * 60` cùng `{ priorityJobIds: session.assignedJobIds, autoContinue: session.autoContinueJobs }` **chỉ khi phiên `COMPLETED` hợp lệ** vào `StorageManager.commitSessionOutcomeInternal` — ghi đồng thời `CURRENT_SESSION + ECONOMY + DAILY_STATS + QUESTS + CIVILIZATION` dưới `StorageMutex` bằng `advanceJobs(...)` và đồng bộ `CivilizationCoordinator.refreshCachedBonuses()` sau khi ghi (tương đương 100% trên `extensionClient.ts`). `Give Up`, `INTERRUPTED` và thời gian Break không đẩy tiến độ job; đồng hồ hệ thống không bao giờ tính tiến độ nền.
    - `CivilizationCoordinator.cancelConstructionJob` xử lý `CANCEL_CONSTRUCTION_JOB { jobId }` (hoàn `100%` nếu `remainingSeconds === totalSeconds`, hoàn `50%` nếu đã làm `> 0s`, hủy nối tầng upgrade bậc cao hơn trên cùng công trình, thu hồi đặt nếu hủy `place`).
    - `CivilizationCoordinator.selectFounder` xử lý một lần `SELECT_FOUNDER { role }` (`CIV_INVALID_FOUNDER_PAYLOAD`, `CIV_FOUNDER_ALREADY_SELECTED`), cấp `1` thợ khởi đầu miễn phí (0 chiếm chỗ *Rock Shelter*, tính vào tổng dân cho crew và công thức tuyển dân `round(25 × 1.35^totalCount)`).
  - **Nâng cấp, Phá dỡ 50%, Giới hạn xây dựng, Buff Dân làng & Luật Era thuần (`Stage 5C-1` + `Milestone Villager V2 & V5.2` + `5E-1` — `src/core/civilization/{buildingUpgrade,villager,villagerBuffs,eraRules,civilizationBonusHelper,landExpansion}.ts`):**
    - `CivilizationCoordinator.upgradeBuilding` xử lý `UPGRADE_BUILDING { buildingId, expectedLevel }` dưới `StorageMutex` (chặn nếu công trình đang xây `CIV_BUILDING_UNDER_CONSTRUCTION`, khóa lạc quan `getEffectiveTargetLevel` chống race bấm đúp → `BUILDING_LEVEL_MISMATCH`, cho phép nâng nhóm `ECONOMY_EFFECT` và `stone_age_study_cave`, áp dụng giảm giá nâng cấp từ **Elder** `-6%/người` trần `-30%` via `applyCostDiscount` tối thiểu `1` Coin, trừ `focusCoins` và xếp job `upgrade`).
    - `EXPAND_LAND` dùng **cấp số cộng bậc thang** (`cost(1) = 30`, `cost(k) = 30 + Σ_{j=1}^{k-1} (10 + 5 × ⌊(j - 1) / 5⌋)`, `k = 1..8 -> [30, 40, 50, 60, 70, 80, 95, 110]`, `k = 20 -> 355`) và cổng `Player Level >= k + 2`, áp dụng giảm giá mở đất từ **Woodworker** `-5%/người` trần `-40%` qua `applyCostDiscount` và tạo job dọn đất `expand` (`2` dân / `3600s`, chặn trùng ô via `CIV_EXPAND_ALREADY_QUEUED`).
    - `extractCivilizationCoinBonuses(buildings, villagers, jobs, founderRole)` tự động bỏ qua mọi công trình còn job `place` (`isBuildingUnderConstruction`), cộng dồn `ECONOMY_EFFECT`, **Crafter** (`+5%/người`, trần `+40%`) và **Complete Tribe** (`+10%` khi có đủ 3 vai trò → trần lý thuyết Stone Age `+150%`), cập nhật đồng bộ sang `SessionCoordinator` qua `cachedBonuses` mà không tác động tới XP hay Quest.
    - `eraRules.ts` (`ERA_LEVEL_RULES`, `evaluateEraAdvance`) chỉ tính công trình đã xây xong (`!isBuildingUnderConstruction`), mở rộng đất đã xong (`landExpansions >= 3`), đủ 3 vai trò dân làng (tính cả `founderRole`), `minPlayerLevel = 9`, `minTotalFocusMinutes = 500`, `feeCoins = 500`, Cave & Economy floor `Lv.5`; **tuyệt đối chưa kích hoạt chuyển Era** (`era` giữ `'STONE_AGE'`).
    - `PLACE_BUILDING` áp giới hạn `MAX_ECONOMY_EFFECT_BUILDINGS = 4` theo loại (`CIV_ECONOMY_BUILDING_LIMIT_REACHED`), `MAX_VILLAGE_CAVES = 1` cho `stone_age_study_cave` (*Rock Shelter*, `CIV_VILLAGE_CAVE_LIMIT_REACHED`), `MAX_CAMPFIRE_BUILDINGS = 3`, `MAX_TOTEM_BUILDINGS = 3`, và `MAX_ELDER_HUT_BUILDINGS = 2` (`CIV_BUILDING_PLACEMENT_LIMIT_REACHED`, trần đồng thời `17` công trình trên bản đồ Đồ Đá; giữ nguyên sàn `minCount: 1` của `eraRules.ts`). `REMOVE_BUILDING` chặn phá dỡ *Rock Shelter* nếu `villagers.length > 0` (`CIV_CAVE_HAS_VILLAGERS`) và hoàn trả `50%` tổng Coins đã đầu tư + job chưa hoàn thành gắn với công trình via `refundCoins`.
  - **Quest Pool 3 Khe & Quyết toán Quest nguyên tử (`questCatalog.ts`, `questEngine.ts`, `StorageManager.commitSessionOutcomeInternal`):** `questCatalog.ts` quản lý pool `19` nhiệm vụ theo `3` khe/kỳ (`Daily`: `9`, cap bất biến `40C·100XP`; `Weekly`: `10`, cap bất biến `150C·370XP`, gồm `weekly_tenacity_10` gắn `difficulty: 'hard'`). `selectQuestsForPeriod` băm thuần FNV-1a + Murmur3 (`0` lời gọi `Date.now()`/`Math.random()`) trên `(salt, period, periodKey, slot)` để chọn `1` nhiệm vụ mỗi khe và tránh lặp lại kỳ trước (`dailyPreviousSelection`/`weeklyPreviousSelection`). Khi phiên kết thúc hợp lệ (`COMPLETED` qua `toQuestOutcomeDelta`, truyền thêm `pomodoroCompletedIntervals?` chỉ cho `POMODORO_COUNTDOWN` / `POMODORO_STOPWATCH`), hệ thống đọc `fq_quests` (tự phục hồi bằng `sanitizeQuestState`), chạy `rolloverQuestState` rồi `applyCompletedSession` trên `getActiveQuestDefinitions`, cập nhật `weeklyDailyMinutes` (cho `weekly_three_days` `minDailyMinutes: 25`), và ghi đồng thời `CURRENT_SESSION + ECONOMY + DAILY_STATS + QUESTS + CIVILIZATION` dưới `StorageMutex` kèm rollback compensation; lỗi Quest được cô lập hoàn toàn và nhánh không hoàn thành/interval dở dang không cộng tiến độ.
  - **`QuestCoordinator` (`src/background/questCoordinator.ts`):** Quản lý `GET_QUEST_STATE` (persist khi rollover ngày/tuần mới hoặc backfill `salt`/`schemaVersion = 2`, trả `questState`, `resetCountdown`, `unclaimedCount`) và `CLAIM_QUEST_REWARD` (chỉ trả thưởng phẳng vào `ECONOMY` qua `commitQuestClaimInternal`, từ chối mọi nhiệm vụ không có trong kỳ hoạt động, dùng đúng `calculatePlayerLevel(totalXP)` và **không bao giờ ghi vào `fq_daily_stats`**).
  - **`AwardsCoordinator` & Thành tựu Độc lập Kinh tế (`src/core/awards/{awardsCatalog,awardsState,awardsEngine}.ts`, `src/background/awardsCoordinator.ts` — `Milestone 5D-2`):** Quản lý `13` thành tựu Stone Age (`STONE_AGE_AWARDS_CATALOG`, mở khóa vĩnh viễn một chiều, `0` Coins, `0` XP, `0` thu nhập thụ động). Hàm thuần `evaluateAwards` trả `levels` (`{ level, nextThreshold }`) và gắn `level`, `isSingleLevel`, `nextThreshold` lên `AwardViewModel` (hỗ trợ mở rộng `Lv.1 → Lv.N` động theo Era). `StorageManager.commitSessionOutcomeInternal` (chỉ khi `COMPLETED`: `longestSessionMinutes` và tăng `totalBuildingsBuilt` đúng 1 lần cho mỗi job `place` hoàn tất), `QuestCoordinator.claimQuestReward` (`totalQuestsClaimed`, `perfectDaysCount`), và `CivilizationCoordinator.placeBuilding` (chỉ tăng `totalBuildingsBuilt` ngay khi đặt công trình `0s` như `Campfire`; không tăng với công trình bất đồng bộ hay khi hủy job chưa xong) cập nhật `counters` nguyên tử trong cùng `StorageMutex`; `AwardsCoordinator` phục vụ `GET_AWARDS_STATE` (tự evaluate & persist nếu có bậc mới mở) và `MARK_AWARDS_SEEN` (validate `awardIds` → `INVALID_AWARDS_PAYLOAD`).
  - Messages: `GET_CIVILIZATION_STATE`, `PLACE_BUILDING`, `REMOVE_BUILDING`, `UPGRADE_BUILDING`, `EXPAND_LAND`, `RECRUIT_VILLAGER`, `CANCEL_CONSTRUCTION_JOB`, `SELECT_FOUNDER`, `GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`, `GET_AWARDS_STATE`, `MARK_AWARDS_SEEN`.
- Preferences: `SET_LANGUAGE`, `SET_CHIME_ENABLED`, `SET_MUSIC_PLAYER_EXPANDED`.
- Focus Music Player: `MUSIC_GET_STATE`, `MUSIC_GET_CATALOG`, `MUSIC_REFRESH_CATALOG`, `MUSIC_PLAY_TRACK`, `MUSIC_PAUSE`, `MUSIC_RESUME`, `MUSIC_STOP`, `MUSIC_NEXT`, `MUSIC_PREVIOUS`, `MUSIC_SEEK`, `MUSIC_SET_VOLUME`, `MUSIC_SET_SHUFFLE`, `MUSIC_SET_REPEAT`.
- SW ↔ Offscreen Document (lọc bằng `target: 'offscreen' | 'background'`): `MUSIC_PLAY`, `MUSIC_PAUSE`, `MUSIC_STOP`, `MUSIC_SEEK`, `MUSIC_SET_VOLUME`, `MUSIC_GET_STATUS` ↔ `MUSIC_POSITION`, `MUSIC_ENDED`, `MUSIC_ERROR`.
- **Lỗi có cấu trúc & Bản địa hóa (`src/types/errors.ts`, `src/i18n/errorTranslator.ts`):** Các coordinator và `MessageHandler` ném/trả `AppError` kèm **`131`** `ErrorCode` chuẩn hóa + `errorParams` (giữ `error: string` tiếng Anh tương thích ngược; `CIV_UNKNOWN_BUILDING_DEF` đọc cả `buildingDefinitionId` lẫn `buildingId` để đồng bộ `CivilizationCoordinator` và simulator). Phía UI chuyển mọi exception qua `toUiErrorPayload` và render qua `localizeErrorMessage` (dịch đủ `131` mã + 4 mã offscreen legacy trong EN/VI, làm sạch mọi chuỗi lỗi kỹ thuật / stack trace).
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
  - `src/ui/components/quests/QuestView.tsx` + `src/ui/utils/questFormatting.ts`: đọc động bộ nhiệm vụ đang hiệu lực (`getActiveQuestDefinitions`) và cap bất biến từ `questCatalog.ts`, hiển thị nhãn khe `quests.slot.*`, nhãn `Hard`/`Khó` cho nhiệm vụ vượt mức `1×60m`, 4 trạng thái thẻ (`IN_PROGRESS`, `READY`, `CLAIMED`, `EXPIRED`), đếm ngược `New quests in {time}` / `Nhiệm vụ mới sau {time}` auto-refetch 1 lần khi chạm `0`, **không có nút reroll**, khóa chống bấm đúp khi gọi `CLAIM_QUEST_REWARD`, thẻ Quest Streak (0 Coin thụ động), và thông báo lỗi bản địa hóa qua `errorTranslator.ts`.
  - `src/ui/components/StatsView.tsx` + `src/ui/utils/statsPeriod.ts` + `src/ui/utils/focusStatUnlock.ts`: nâng cấp 3 chế độ `Day | Month | Year` trên nền `statsAggregator.ts` & `StatsBarChart.tsx` (neo ngày địa phương via `getLocalDateKey`, khóa không bước qua tương lai, xử lý năm nhuận 29/02 và `completionRate === null`; cột biểu đồ `<g role="img" tabIndex={0}>` tránh lỗi button lồng nhau), kèm thẻ `Focus Streak` khóa/mở theo effect `FOCUS_STAT_UNLOCK` (`focus_metric_streak_analysis` của `stone_age_elder_hut`).
  - `src/ui/components/awards/{AwardsView,AwardDetailsModal,AwardIcon,awardFormatting}.tsx` (**`Milestone 5D-2`**): thay thế hoàn toàn `"Coming soon"` bằng danh sách `13` thành tựu có bậc số **`Lv.1 → Lv.N`** (`Lv.0` khi chưa đạt; thành tựu 1 bậc `tribe_complete` / `era_ready` dùng `"Achieved"`/`"Not achieved"` / `"Đã đạt"`/`"Chưa đạt"` không gắn `Lv.N`; `getAwardLevelBand` / `getAwardLevelFrameClass` phân cấp viền CSS `locked`, `single`, `lv1-2`, `lv3`, `lv4`, `lv5`, `lv6-plus`), 4 tab lọc `All / Focus / Quests / Civilization`, tab `All` phân 3 nhóm (`Focus → Quests → Civilization`) và `sortAwardsForDisplay` xếp trong nhóm theo `level` giảm dần rồi tên bản địa hóa tăng dần, thẻ `NEW`, thanh tiến độ, modal chi tiết, đồng bộ badge `awards-unseen-badge` trên `Navbar.tsx` và toast mở khóa không chặn trên `App.tsx`.
  - `src/ui/components/RewardHelpModal.tsx`: đọc động hệ số, giá trị giảm/tăng từ `DEFAULT_REWARD_CONFIG`, `MultiplierRules` và `constants.ts` (giải thích đầy đủ `CoinBonus`, mục **Villager Buffs** `help-villager-buffs`: Crafter `+5%/+40%`, Woodworker `-5%/-40%`, Elder `-6%/-30%`, Complete Tribe `+10%`), All-or-Nothing/Settlement, Quests Pool 3 khe thưởng phẳng & độ chính xác số thực IEEE-754 trong EN/VI (**`756`** khóa i18n parity được bảo vệ bởi `i18n Static Key-Usage Guard` quét toàn bộ lời gọi `t(...)`/`translate(...)` trong `src/`).
  - `BuildingDetailsModal.tsx`, `BuildingCatalogPanel.tsx`, `LandExpansionModal.tsx`, `ClearingChunkModal.tsx`, `FounderPickerModal.tsx`, `CivilizationHeader.tsx`, `MapGridView.tsx` + `ConstructionFence.tsx` + `constructionTools.ts`, `useVillagerWander.ts`, `villagerEntryAnimation.ts` (**`5E-3`**), `jobProjection.ts` & `CivilizationScreen.tsx` (**`5C-1`**, **`Villager V2–V5`**, **`5E-1/1b/1c`**, **`5E-2`**, **`5E-3`**): mở khóa nâng cấp trong `BuildingDetailsModal`, hàng đợi job & nút `CANCEL_CONSTRUCTION_JOB`, khu vực tuyển dân `cave-village-section`, `ClearingChunkModal`, `FounderPickerModal`, `ConstructionFence` 4 cọc gỗ + vải viền rìa trong suốt (gỡ hoàn toàn dụng cụ lơ lửng khỏi Bản đồ ở `5E-2` Mục 0), giàn gỗ nâng cấp, badge đồng hồ pixel `clock_tiles_16.png` + đếm ngược `1s` đồng bộ `session.assignedJobIds` / `autoContinueJobs`, sprite 4 giai đoạn (`constructionSpriteData.ts`), hoạt ảnh thuần UI `villagerEntryAnimation.ts` kiểm tra hiển thị viewport (`isCaveVisibleInViewport` dùng `cameraViewportRef` từ `MapGridView.tsx`, bỏ qua khi Hang trú ẩn nằm ngoài khung nhìn do pan/zoom) và đưa dân mới tuyển từ `RECRUIT_VILLAGER` đi vào cửa Hang `(cave.x+1, cave.y+2)` (`computeVillagerCaveEntryPlan`, `sampleVillagerEntryFrame`, `suppressedVillagerIds` trên `useVillagerWander` tránh render trùng, tối đa `3` luồng, `<= 3000ms`, `0` ghi storage, tắt khi `prefers-reduced-motion`), và đồng bộ tức thì `civBonusRate` sang `TimerView` qua `onStateMutated()`.
  - `FocusJobAssignmentCard.tsx` (`TimerView.tsx` IDLE) & `FocusSceneArea.tsx` + `focusSceneModel.ts` + `focusWorkSceneModel.ts` + `civilizationScale.ts` (**`Villager V4` + `5E-1` + `5E-2` + `5E-2b`**): trước phiên cho phép bật/tắt `Tự động` chọn việc (`<= 4`, giới hạn dân, nâng cấp tuần tự, `autoContinueJobs`, nút sang Bản đồ khi trống). Khi chạy phiên, nếu `0` việc `ACTIVE`, `FocusSceneArea` giữ nguyên sân khấu trại cổ đại (`buildFocusSceneModel`); nếu `1..4` việc `ACTIVE`, chuyển sang lưới `1..4` khung làm việc bằng nhau (`focus-work-grid`), dùng `civilizationScale.ts` (`MAP_CELL_PX = 32`, `computeWorkSubSceneLayout`) giữ đúng tỉ lệ pixel `MapGridView` giữa dân làng cỡ `1` ô và công trình chiếm đúng số ô `footprint`, mỗi khung gán đúng `crewRequired` dân thật không trùng lặp gắn công cụ trực tiếp lên tay bên trong `focus-work-villager-*` trước `focus-work-subject-*` (lớp `.fq-work-hand-tool-strike-right` `transform-origin: 20% 85%` / `.fq-work-hand-tool-strike-left` `transform-origin: 80% 85%`, `.fq-work-hand-tool-rest-*` khi nghỉ), sprite công trình/giàn nâng cấp/rừng dọn, `ClockTileIcon` + đếm ngược `1s`, và công cụ (`117`/`127`/`115` từ `constructionTools.ts`) chỉ vung khi `sceneState === 'working' && !reducedMotion` (đứng yên khi `paused`, `resting` Pomodoro break hoặc `prefers-reduced-motion`).
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

---

## 8. Chế độ Nhà phát triển Cô lập (`src/dev/` & `vite.config.ts` — Milestone 5E-2b)

- **Cô lập hoàn toàn khỏi bản build phát hành (`dist/`):**
  - Toàn bộ UI, kiểu dữ liệu, bộ điều khiển background và plugin simulator của **GOD MODE** nằm gọn trong `src/dev/` (`devTypes.ts`, `devStateHelpers.ts`, `devBackgroundService.ts`, `devBackground.ts`, `devSimulatorPlugin.ts`, `DevGodModePanel.tsx`, `DevGodModeMount.tsx`).
  - Các điểm nối production (`src/App.tsx`, `src/ui/services/extensionClient.ts`, `src/ui/components/TimerView.tsx`, `src/background/index.ts`) chỉ dùng cầu nối trung tính `src/ui/services/devRuntimeBridge.ts` và dynamic `import(...)` được rào chặt bằng `import.meta.env.DEV === true` (không chứa bất kỳ chuỗi `'GOD MODE'`, `'GOD_MODE'` hay `'DEV_*'`).
  - `vite.config.ts` gán `process.env.NODE_ENV = 'production'` trước khi khởi tạo plugin React và ép `import.meta.env.DEV = 'false'`, `import.meta.env.PROD = 'true'`, `process.env.NODE_ENV = '"production"'` cho mọi `vite build` mặc định (`command === 'build' && mode !== 'development'`) nhằm bảo đảm Vite/Rolldown loại bỏ 100% mã chết, chunk `src/dev/` và `jsxDEV` khỏi `dist/`, bất kể biến môi trường `NODE_ENV` bên ngoài.
- **Bảo toàn bất biến nghiệp vụ:** Mọi thao tác trong `devBackgroundService.ts` / `devSimulatorPlugin.ts` đều đi qua `StorageManager` (`StorageMutex`, `validateCivilizationState`, `sanitizeQuestState`), `CivilizationCoordinator.refreshCachedBonuses`, `AwardsCoordinator`, và các hàm kết thúc phiên thật của `SessionCoordinator` (`completeCountdown`, `advancePomodoroStage`, `finishStopwatch`). Giá thật, công thức Coins/XP, All-or-Nothing (`Give Up` vẫn `0` thưởng), `era: 'STONE_AGE'` (mục Meet Era Requirements chỉ chuẩn bị điều kiện để `evaluateEraAdvance` trả `eligible: true`), và `CURRENT_SCHEMA_VERSION = 7` được giữ nguyên 100%.

