# Focus Quest — Technical Architecture Specification (Manifest V3)

**Version:** 1.4.0  
**Status:** MV3 Background, Civilization Engine & Full Bilingual Architecture  
**Target Platform:** Google Chrome Extension (Manifest V3)  
**Language & Stack:** TypeScript 7, React 19 (Popup & Blocked UI), Tailwind CSS 4, Chrome Extension APIs (`declarativeNetRequest`, `alarms`, `storage`, `notifications`, `runtime`, `action`, `i18n`)  

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
  "minimum_chrome_version": "102",
  "default_locale": "en",
  "description": "__MSG_extDescription__",
  "permissions": [
    "storage",
    "alarms",
    "notifications",
    "declarativeNetRequest"
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
*Ghi chú:* Vite đóng gói 3 entrypoint (`index.html` → popup, `src/background/index.ts` → `dist/background.js`, `src/blocked/blocked.ts` → `dist/blocked.js` không có inline script theo CSP MV3) cùng thư mục `public/_locales/{en,vi}/messages.json`.

### Phân tích và Biện minh Quyền (Permissions Justification):
- `"storage"`: Lưu trữ bền vững dữ liệu session, profiles, ví kinh tế và thống kê ngày trên máy người dùng.
- `"alarms"`: Đánh thức Service Worker khi Countdown chạm đích (`FQ_ALARM_COUNTDOWN_FINISH`) hoặc khi Pause chạm mốc 5 phút (`FQ_ALARM_PAUSE_AUTO_RESUME`).
- `"notifications"`: Phát Chrome Notification hệ thống khi hoàn thành phiên Countdown hoặc Pomodoro. (Hiệu ứng âm thanh chuông chuyển phase được thực hiện riêng bằng Web Audio API khi Popup mở, không phụ thuộc file âm thanh ngoài hay quyền notification).
- `"declarativeNetRequest"`: Chặn hoặc chuyển hướng các truy cập web không nằm trong Allowlist ở cấp độ network của trình duyệt.
- `"host_permissions": ["*://*/*"]`: Yêu cầu kỹ thuật bắt buộc của Chrome Manifest V3 đối với `declarativeNetRequest` khi sử dụng action `redirect` chuyển hướng trang web sang trang extension nội bộ (`blocked.html`). Nếu không có host permissions, DNR chỉ có thể thực hiện action `block` (hiển thị trang lỗi trình duyệt `ERR_BLOCKED_BY_CLIENT`) thay vì chuyển hướng sang giao diện Focus Shield thân thiện.

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
│   │ SessionCoordinator         │  │ ProfileManager              │     │
│   │ - startSession              │  │ - create/rename/delete      │     │
│   │ - pauseSession (max 2)      │  │ - add/remove domain         │     │
│   │ - resumeSession (auto-res)  │  │ - get/set active profile    │     │
│   │ - completeCountdown         │  └──────────────┬──────────────┘     │
│   │ - finishStopwatch           │                 │                    │
│   │ - giveUpCountdown           │                 │                    │
│   │ - recoverSession (startup)  │                 │                    │
│   └──────┬──────────────┬───────┘                 │                    │
│          │              │                         │                    │
│          ▼              ▼                         ▼                    │
│   ┌─────────────┐ ┌─────────────┐ ┌──────────────────────────────┐     │
│   │ Alarms      │ │ Notify      │ │ BlockingCoordinator (DNR)    │     │
│   │ Adapter     │ │ Adapter     │ │ - applyAllowlistRules        │     │
│   └─────────────┘ └─────────────┘ │ - clearBlockingRules         │     │
│                                   │ - reconcile                  │     │
│                                   └───────────────┬──────────────┘     │
│                                                   │                    │
│   ┌───────────────────────────────────────────────┴──────────────┐     │
│   │ StorageManager & Mutex (chrome.storage.local)                │     │
│   │ - Ground Truth Snapshot, Economy, Daily Stats, Profiles      │     │
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
}
```
Các action được hỗ trợ:
- Session & Pomodoro: `GET_SESSION_STATE`, `START_SESSION`, `PAUSE_SESSION`, `RESUME_SESSION`, `GIVE_UP_SESSION`, `FINISH_STOPWATCH`, `SKIP_POMODORO_BREAK`, `ADVANCE_POMODORO_STAGE`, `RESET_SESSION`, `HEARTBEAT`.
- Profiles: `GET_PROFILES`, `GET_ACTIVE_PROFILE`, `SWITCH_PROFILE`, `CREATE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE`, `ADD_DOMAIN`, `REMOVE_DOMAIN`.
- Economy & Stats: `GET_ECONOMY`, `GET_DAILY_STATS`.
- Civilization (`CURRENT_SCHEMA_VERSION = 2`, lưới `8×8` / chunk `4×4` mở rộng theo tọa độ `origin` và điều kiện `Level >= k + 2`): `GET_CIVILIZATION_STATE`, `PLACE_BUILDING`, `REMOVE_BUILDING`, `EXPAND_LAND`.
- Preferences: `SET_LANGUAGE`, `SET_CHIME_ENABLED`.
- UI hiển thị lỗi qua `src/i18n/errorTranslator.ts` để giữ nguyên thông điệp chuẩn khi dùng EN và dịch tự nhiên khi dùng VI.

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
2. **Sub-resources:** Cơ chế chặn chỉ áp dụng cho `resourceTypes: ['main_frame']`. Tài nguyên CDN nhúng (ảnh, css, fonts) của trang học tập được phép tải bình thường.
3. **Độ trễ cập nhật Dynamic Rules:** API `chrome.declarativeNetRequest.updateDynamicRules` là bất đồng bộ. Hệ thống luôn `await` việc cập nhật hoàn tất trước khi xác nhận phiên đã kích hoạt.

---

## 5. Chrome Alarms & Notifications Boundary

1. **Alarms:**
   - Chrome Alarms có độ trễ nhỏ (không cam kết chính xác đến từng mili-giây, thông thường sai số từ 1–10 giây tùy tải của hệ điều hành). Do đó, khi Alarm kích hoạt, hệ thống luôn lấy `Date.now()` và chạy qua `TimeCalculator` để tính toán chính xác, không dùng Alarm làm thước đo thời gian có thẩm quyền.
2. **Notifications:**
   - Sử dụng cho thông báo hoàn thành Countdown / Pomodoro Countdown, chuyển sang giờ nghỉ (Short / Long Break), và hết giờ nghỉ quay lại pha Focus.
   - `SessionCoordinator.getActiveLocale()` đọc `settings.language` từ storage (`resolveLocale`) và gọi `translate(...)` để phát thông báo song ngữ EN/VI nhất quán.
   - Bọc trong try/catch an toàn; nếu người dùng tắt quyền thông báo hoặc bật Do Not Disturb, lỗi notification chỉ được ghi log và **không làm gián đoạn** giao dịch trao thưởng trong storage.
   - Cờ `notificationSent: true` đảm bảo notification hoàn thành chỉ được bắn đúng một lần duy nhất cho mỗi session ID.

---

## 6. Giao diện Popup, Cảnh quan UI & Blocked Page (Stages B–E)
- **Điều hướng Popup 400×600px:** `Navbar.tsx` dùng 5 tab đáy (`Quests | Focus | Map | Awards | Stats`), mặc định mở `map` (`CivilizationScreen`), hỗ trợ đóng/mở `ProfileBottomSheet`, `RewardHelpModal` và `SpriteGallery` (`#sprites` chỉ ở Web Preview).
- **Cảnh quan & Hiệu ứng mở đất (thuần UI):** `terrainDecor.ts` dựng cảnh quan mở & rừng tối chunk `4×4` xác định (không lưu trong storage, không cản đặt công trình); `ExpansionRevealOverlay.tsx` + `expansionReveal.ts` chạy rìu chém rừng `127` + rung nhẹ lớp bản đồ trong `1150ms` sau commit, tôn trọng `prefers-reduced-motion`.
- **Blocked Page CSP-Safe:** `public/blocked.html` ẩn thẻ bằng opacity anti-flash cho tới khi `blocked.js` (`src/blocked/blocked.ts`) đọc `fq_settings` từ `chrome.storage.local` để áp dụng ngôn ngữ EN/VI và lắng nghe `chrome.storage.onChanged`.
