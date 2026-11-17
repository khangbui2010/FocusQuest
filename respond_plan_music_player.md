# KẾ HOẠCH TRIỂN KHAI — MUSIC PLAYER & SESSION NOTIFICATIONS

**Ngày cập nhật:** 2026-11-16  
**Phạm vi tài liệu:** Kế hoạch kiến trúc, cấu trúc thư viện nhạc MP3 đóng gói sẵn, MV3 Offscreen Audio Engine, `MusicCoordinator`, chuẩn hóa & bảo toàn hệ thống Session Notifications trên `SessionCoordinator`, tích hợp UI popup `400×600px`, chiến lược kiểm thử bắt buộc và lộ trình thi công theo từng giai đoạn.  
**Trạng thái hiện tại:** **CHỜ DUYỆT & CHỜ FILE MP3** *(Chưa viết code production; hiện trong repo chưa có file `.mp3` nào trong `public/assets/` và chưa có `MusicCoordinator` / `offscreen.html`)*.

---

## 1. TỔNG QUAN ĐIỀU CHỈNH BẮT BUỘC & NGUYÊN TẮC BẤT BIẾN

Kế hoạch này áp dụng toàn bộ các điều chỉnh bắt buộc cho tính năng **Music Player** và **Session Notifications** trên nền kiến trúc thực tế của Focus Quest (`Vite v8.3`, `React 19`, `Tailwind v4`, Chrome MV3 Service Worker, `StorageMutex`, 490/490 tests đang PASS sau Giai đoạn 4b):

1. **Nguồn nhạc 100% MP3 đóng gói sẵn trong Extension:**
   - Tác giả dự án trực tiếp chuẩn bị và upload các file `.mp3` vào `public/assets/music/`.
   - **CẤM** xây dựng chức năng cho phép người dùng cuối tự upload nhạc (không `<input type="file">`, không drag-drop, không `FileReader`).
   - **CẤM** tải nhạc từ Internet, tích hợp YouTube, streaming ngoài hoặc tách âm thanh từ video.
   - Catalog nội bộ linh hoạt, không cố định số lượng bài, không hardcode danh sách track trong UI hay coordinator.
2. **Tuân thủ bản quyền & Attribution nghiêm ngặt:**
   - Chỉ hỗ trợ `CC0`, `CC BY`, `CC BY-SA`.
   - **KHÔNG** tự suy đoán giấy phép; **KHÔNG** tự gán `CC0` cho bất kỳ file nào chưa được xác minh.
   - Với `CC BY` và `CC BY-SA`, lưu và hiển thị đầy đủ thông tin ghi công (`creator`, `attribution`, `sourceUrl`, `licenseUrl`, `isModified`) trong UI.
3. **Đóng gói MV3 & Storage sạch:**
   - Toàn bộ `.mp3` phải nằm trong gói `dist/assets/music/` và nạp qua `chrome.runtime.getURL(...)` từ Offscreen Document (không dùng đường dẫn máy dev, không phụ thuộc file ngoài).
   - **KHÔNG** lưu binary file `.mp3` vào `chrome.storage.local` hoặc `IndexedDB`; storage chỉ lưu trạng thái phát nhạc & cấu hình nhẹ.
4. **Bảo toàn & Mở rộng Session Notifications trên hệ thống hiện có:**
   - **KHÔNG** tạo hệ thống notification thứ hai. Tái sử dụng và chuẩn hóa `SessionCoordinator` + `ChromeNotificationsAdapter` + `SessionSnapshot.notificationSent`.
   - Cô lập lỗi 2 chiều giữa **Music Player / Offscreen** và **Session Notifications**: lỗi âm thanh không bao giờ chặn thông báo; lỗi thông báo không bao giờ làm crash `MusicCoordinator` hay hỏng commit phiên.
   - Giữ nguyên độc lập Web Audio `soundEffects` (`src/ui/services/soundEffects.ts`, khóa bởi `chimeEnabled`).

---

## 2. KIỂM TOÁN HIỆN TRẠNG REPO (GROUND-TRUTH AUDIT)

### 2.1. Hạ tầng Build & Manifest hiện tại
- **`public/manifest.json`:**
  - Đang đặt `"minimum_chrome_version": "102"` → cần nâng lên tối thiểu **`"109"`** để sử dụng API `chrome.offscreen`.
  - `"permissions"` hiện có `["storage", "alarms", "notifications", "declarativeNetRequest"]` → cần bổ sung **`"offscreen"`**.
  - `"web_accessible_resources"` đã có `["blocked.html", "blocked.js", "assets/*"]` — khớp tự nhiên với `assets/music/*.mp3` khi `public/assets/music/` được Vite copy sang `dist/assets/music/`.
- **`vite.config.ts`:**
  - Hiện có 3 entrypoint: `popup` (`index.html`), `background` (`src/background/index.ts` → `dist/background.js`), `blocked` (`src/blocked/blocked.ts` → `dist/blocked.js`).
  - Cần thêm entrypoint thứ 4 `offscreen` (`src/offscreen/offscreen.ts` → `dist/offscreen.js`) đi kèm `public/offscreen.html` **không chứa inline script** (tuân thủ CSP MV3 tương tự pattern `blocked.html` + `blocked.ts`).
  - **Ràng buộc `dist/background.js`:** Tiếp tục không import React/UI/sprite vào Service Worker; `src/data/musicCatalog.ts` phải là module TypeScript thuần, không phụ thuộc DOM/React.

### 2.2. Các khoảng trống vừa phát hiện trong `SessionCoordinator` & Notification
Qua kiểm tra trực tiếp `src/background/sessionCoordinator.ts` và `src/chrome/notificationsAdapter.ts`, cần xử lý 5 điểm cụ thể sau để đáp ứng Section 5 & Section 6:

1. **`finishStopwatch()` (`src/background/sessionCoordinator.ts:698-925`) CHƯA gửi thông báo hoàn thành phiên:**
   - Hiện tại cả hai nhánh `POMODORO_STOPWATCH` (`lines 734-854`) và `STOPWATCH` (`lines 856-924`) đều commit economy/daily stats và clear alarms/blocking nhưng **chưa gọi `notifications.create(...)`** và **chưa set `notificationSent = true`**.
   - *Điều chỉnh:* Sau khi `commitSessionOutcomeInternal` hoàn tất, nếu phiên hoàn thành hợp lệ (`STOPWATCH`: `rewardResult.isThresholdMet === true`, tức `>= 5` phút; `POMODORO_STOPWATCH`: `completedIntervals > 0`), gọi helper notification chung để gửi thông báo hoàn thành 1 lần duy nhất (kèm thời lượng focus thực tế và phần thưởng) + đánh dấu `notificationSent: true`. Nếu chưa đạt ngưỡng (`< 5` phút hoặc `0` intervals hoàn thành), coi như kết thúc sớm chưa hoàn thành → **không** gửi thông báo hoàn thành.
2. **`advancePomodoroStage()` (`src/background/sessionCoordinator.ts:1235-1247`) thiếu kiểm tra/persist `notificationSent` ở nhánh 100% completion:**
   - Nhánh hoàn thành toàn bộ mission `POMODORO_COUNTDOWN` hiện gọi `this.notifications.create('fq_pomodoro_finish_${session.id}', ...)` mà chưa kiểm tra `if (!session.notificationSent)` và chưa cập nhật `notificationSent: true`.
   - *Điều chỉnh:* Chuẩn hóa qua cùng helper deduplication + đánh dấu `notificationSent: true` trong storage để chống trùng tuyệt đối qua SW restart/race.
3. **`UserSettings.notificationsEnabled` chưa được `SessionCoordinator` kiểm tra:**
   - `src/types/storageSchema.ts:19` và `v1_initialSchema.ts:38` đã có `notificationsEnabled: boolean` (mặc định `true`), nhưng `SessionCoordinator` đang bắn notification mà không check cài đặt này.
   - *Điều chỉnh:* Helper notification kiểm tra `settings?.notificationsEnabled !== false` trước khi gọi `this.notifications.create(...)`.
4. **Đường dẫn icon trong `ChromeNotificationsAdapter` (`src/chrome/notificationsAdapter.ts:23`):**
   - Đang gọi `chrome.runtime.getURL('assets/icon128.png')`, trong khi icon thực tế của extension nằm ở `public/icons/icon128.png` (`icons/icon128.png` trong `dist/`).
   - *Điều chỉnh:* Sửa sang `chrome.runtime.getURL('icons/icon128.png')` (giữ data URL fallback an toàn).
5. **Phân biệt thông báo chuyển pha Pomodoro vs hoàn thành cả Focus Session:**
   - Các thông báo pha (`fq_pomodoro_${session.id}_${now}` tại dòng `1314, 1402, 1494`) là thông báo **Break / Back to Focus** cho 1 interval; thông báo hoàn thành toàn phiên dùng key chuẩn hóa `fq_finish_${session.id}` và tiêu đề/nội dung hoàn thành phiên riêng, không bao giờ lẫn giữa "hết 1 pha Focus" và "hoàn thành cả Focus Session".

---

## 3. THIẾT KẾ CẤU TRÚC THƯ VIỆN NHẠC & METADATA BẢN QUYỀN

### 3.1. Bố cục thư mục
- `public/assets/music/` — Nơi chứa toàn bộ các file `.mp3` được người dùng upload (tên file ASCII lowercase/kebab-case không khoảng trắng, ví dụ `track-name.mp3`, kèm file `public/assets/music/CREDITS.md` ghi bản quyền).
- `src/types/music.ts` — Định nghĩa toàn bộ type cho track, giấy phép, trạng thái playback, cài đặt đồng bộ và hợp đồng giao tiếp background/offscreen/UI.
- `src/data/musicCatalog.ts` — Catalog/manifest nội bộ khai báo danh sách bài hát + hàm kiểm tra tính toàn vẹn (`validateMusicCatalog`, `getTrackById`, `resolveTrackAssetUrl`).

### 3.2. Schema `MusicTrack` & Kiểm soát Giấy phép
```ts
export type MusicLicenseType = 'CC0' | 'CC BY' | 'CC BY-SA';

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** Đường dẫn tương đối bên trong gói extension, VD: 'assets/music/forest-dawn.mp3' */
  readonly file: string;
  /** Thời lượng tính bằng giây (optional nếu chưa xác định trước; UI cập nhật qua audio metadata) */
  readonly duration?: number;
  readonly license: MusicLicenseType;
  readonly licenseUrl: string;
  readonly creator: string;
  readonly sourceUrl: string;
  /** Chuỗi ghi công đầy đủ; BẮT BUỘC khác rỗng với 'CC BY' và 'CC BY-SA' */
  readonly attribution: string;
  readonly isModified: boolean;
}
```

**Quy tắc ràng buộc & kiểm chứng catalog (`validateMusicCatalog`):**
- `MUSIC_CATALOG: readonly MusicTrack[]` được khởi tạo **rỗng (`[]`)** cho tới khi tác giả upload các file `.mp3` thật và cung cấp thông tin giấy phép đã xác minh. Tuyệt đối **không** điền sẵn bài giả hoặc gắn mặc định `'CC0'`.
- Kiểm tra tĩnh & runtime:
  - `id` duy nhất, khác rỗng.
  - `file` phải kết thúc bằng `.mp3` (case-insensitive), bắt đầu bằng `assets/music/`, không chứa `..`, không chứa `http://`, `https://`, `data:`, `blob:`, `file://`, `/Users/`, `C:\`, `\`.
  - `license` chỉ chấp nhận `'CC0' | 'CC BY' | 'CC BY-SA'`.
  - Nếu `license === 'CC BY'` hoặc `'CC BY-SA'`: bắt buộc `creator`, `sourceUrl`, `licenseUrl`, `attribution` đều khác rỗng.
- **Nhận diện động không sửa logic UI/Player:** Toàn bộ danh sách track trong `MusicCoordinator`, `offscreen.ts` và UI Music Player đọc trực tiếp từ `MUSIC_CATALOG` thông qua selector/helper dùng chung. Thêm file `.mp3` vào `public/assets/music/` + thêm 1 entry vào `MUSIC_CATALOG` rồi rebuild là hiển thị & phát được ngay.

---

## 4. KIẾN TRÚC ĐÓNG GÓI & XỬ LÝ TÀI NGUYÊN MV3

1. **Manifest (`public/manifest.json`):**
   - `"minimum_chrome_version": "109"`
   - `"permissions": ["storage", "alarms", "notifications", "declarativeNetRequest", "offscreen"]`
   - `"web_accessible_resources"`: giữ `["blocked.html", "blocked.js", "assets/*"]` (bao phủ `dist/assets/music/*.mp3`).
2. **Vite (`vite.config.ts`):**
   - Thêm input `offscreen: path.resolve(import.meta.dirname, 'src/offscreen/offscreen.ts')`.
   - Trong `output.entryFileNames`: `if (chunkInfo.name === 'offscreen') return 'offscreen.js';`.
   - Thêm `public/offscreen.html` tối giản chỉ có `<script type="module" src="./offscreen.js"></script>` (0 inline script, CSP-safe).
3. **Phân giải URL asset:**
   - Trong Extension runtime (`Offscreen` hoặc `Popup`): `chrome.runtime.getURL(track.file)` (chuẩn hóa bỏ dấu `/` đầu).
   - Trong Web Preview ngoài Chrome: `./${track.file}` (nếu dev/preview phục vụ `public/`).
4. **Quy tắc Storage:**
   - Tuyệt đối không lưu dữ liệu nhị phân `.mp3` vào `chrome.storage.local` hay `IndexedDB`.
   - Thêm `STORAGE_KEYS.MUSIC_STATE = 'fq_music_state'` lưu duy nhất JSON trạng thái nhẹ (`MusicPlaybackPersistedState`).

---

## 5. KIẾN TRÚC MUSIC PLAYER & OFFSCREEN DOCUMENT

### 5.1. Các thành phần mới
1. **`src/chrome/offscreenAdapter.ts` (`IOffscreenAdapter` / `ChromeOffscreenAdapter`):**
   - `ensureDocument()`: kiểm tra `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] })` (kèm fallback an toàn cho mock/browser cũ); chỉ tạo khi chưa tồn tại với `reasons: ['AUDIO_PLAYBACK']`, `justification: 'Play bundled MP3 background music during Focus Quest sessions.'`.
   - `closeDocument()` & `hasDocument()`.
   - Gửi message tới Offscreen Document (`scope: 'FQ_OFFSCREEN_MUSIC'`) và nhận response có timeout/safe catch để không bao giờ treo background SW.
2. **`src/offscreen/offscreen.ts` (Offscreen Audio Engine):**
   - Giữ duy nhất 1 `HTMLAudioElement` trong Offscreen Document.
   - Hỗ trợ đầy đủ lệnh:
     - `LOAD_AND_PLAY` (nhận `trackUrl`, `trackId`, `positionSec`, `volume`, `muted`)
     - `PAUSE`, `RESUME`, `STOP`
     - `SEEK` (`positionSec`)
     - `SET_VOLUME` (`volume`, `muted`)
     - `GET_AUDIO_STATUS` (trả về trạng thái thực của phần tử `<audio>`: `paused`, `currentTime`, `duration`, `src` — phục vụ SW restart recovery!)
   - Phát sự kiện ngược về Background qua `chrome.runtime.sendMessage`:
     - `OFFSCREEN_TRACK_LOADED` (gửi `durationSec` thực đo được từ `<audio>` để hiển thị nếu catalog không khai báo trước `duration`)
     - `OFFSCREEN_TIME_UPDATE` (throttle mỗi ~3–5 giây hoặc khi pause/seek để checkpoint `positionSec`)
     - `OFFSCREEN_TRACK_ENDED` (kích hoạt `Repeat One` / `Next` / `Shuffle` trên `MusicCoordinator`)
     - `OFFSCREEN_AUDIO_ERROR` (báo lỗi rõ ràng về state mà không làm treo coordinator)
3. **`src/background/musicCoordinator.ts` (`MusicCoordinator`):**
   - Quản lý playlist queue đọc động từ `MUSIC_CATALOG`, bảo vệ bất biến bằng lock tuần tự nội bộ (tách khỏi `StorageMutex` của `SessionCoordinator` để tránh tranh chấp lock khi Timer/Alarm đang xử lý!).
   - **State quản lý (`MusicPlayerState`):**
     - `status: 'IDLE' | 'PLAYING' | 'PAUSED' | 'STOPPED' | 'ERROR'`
     - `currentTrackId: string | null`
     - `positionSec: number`
     - `durationSec: number | null` (ưu tiên `loadedmetadata`, fallback `track.duration ?? null`)
     - `volume: number` (`0.0 – 1.0`, mặc định `0.7`)
     - `muted: boolean`
     - `shuffle: boolean`
     - `repeatMode: 'off' | 'all' | 'one'`
     - `shuffledOrder: string[]` (tính xác định theo danh sách track hiện có trong `MUSIC_CATALOG`; khi catalog thay đổi ID không còn tồn tại sẽ lọc sạch hoặc tái lập hàng đợi an toàn)
     - `syncWithSession: boolean` (tùy chọn người dùng: mặc định `true` — tự dừng nhạc khi Focus Session kết thúc/Give Up/Interrupted, tùy chọn tạm dừng khi Pause phiên & tiếp tục khi Resume)
     - `lastError?: string | null`
   - **Thao tác điều khiển đầy đủ:**
     - `playTrack(trackId?)`, `pause()`, `resume()`, `stop()`
     - `next()`, `previous()` (hỗ trợ cả `repeatMode`: `one` lặp lại khi hết bài, `all` quay vòng cuối→đầu, `off` dừng sau bài cuối khi hết tự nhiên; nhấn tay Next/Prev xử lý chuẩn player)
     - `seek(positionSec)` (clamp `[0, durationSec]`)
     - `setVolume(volume)`, `setMuted(muted)`
     - `toggleShuffle()`, `cycleRepeatMode()`, `setSyncWithSession(enabled)`
   - **Phục hồi khi Service Worker Restart (`ensureInitialized()` / `rehydrate()`):**
     - Khi SW thức dậy, `MusicCoordinator` đọc `STORAGE_KEYS.MUSIC_STATE`.
     - Kiểm tra xem Offscreen Document có đang sống không (`offscreenAdapter.hasDocument()`):
       - Nếu Offscreen còn sống: hỏi `GET_AUDIO_STATUS` để đồng bộ `currentTime`, `duration`, `paused` thực tế vào `MusicPlayerState` mà **không làm gián đoạn tiếng nhạc đang phát**!
       - Nếu Offscreen đã bị đóng cùng SW trước đó và `status === 'PLAYING'` trong khi điều kiện phát còn hợp lệ: không ép phát lại sai ngữ cảnh nếu phiên vừa kết thúc (kiểm tra trạng thái phiên); hoặc đồng bộ lại vị trí `positionSec` để bấm Play tiếp đúng giây cũ (hoặc tự khôi phục phát nếu cấu hình & người dùng đang phát hợp lệ — ưu tiên kiểm tra chính xác trạng thái phiên trước khi quyết định resume/stop).
       - Nếu `trackId` không còn trong `MUSIC_CATALOG`: fallback về bài đầu tiên của catalog (hoặc `null` + `'IDLE'` nếu catalog rỗng).
   - **Giao thức Message (`src/types/messages.ts` & `src/background/messageHandler.ts`):**
     - `MUSIC_GET_STATE`
     - `MUSIC_PLAY` (`{ trackId?: string }`)
     - `MUSIC_PAUSE`
     - `MUSIC_RESUME`
     - `MUSIC_STOP`
     - `MUSIC_NEXT`
     - `MUSIC_PREVIOUS`
     - `MUSIC_SEEK` (`{ positionSec: number }`)
     - `MUSIC_SET_VOLUME` (`{ volume: number; muted?: boolean }`)
     - `MUSIC_SET_SHUFFLE` (`{ enabled: boolean }`)
     - `MUSIC_SET_REPEAT` (`{ mode: 'off' | 'all' | 'one' }`)
     - `MUSIC_SET_SYNC_WITH_SESSION` (`{ enabled: boolean }`)
     - *(Các sự kiện nội bộ `OFFSCREEN_*` chỉ xử lý cho offscreen bridge, tách biệt khỏi hành động UI).*

---

## 6. CHUẨN HÓA SESSION NOTIFICATIONS & CÔ LẬP LỖI VỚI MUSIC PLAYER

### 6.1. Luồng thông báo thống nhất trong `SessionCoordinator`
Tạo một phương thức nội bộ duy nhất trong `SessionCoordinator`, ví dụ:
```ts
private async dispatchSessionCompletionNotification(params: {
  session: SessionSnapshot;
  actualFocusMinutes: number;
  coinsEarned: number;
  xpEarned: number;
}): Promise<boolean>
```
**Quy tắc hoạt động của helper này:**
1. **Kiểm tra deduplication đầu tiên:** Nếu `session.notificationSent === true` (hoặc đã đánh dấu trong session hiện tại) → return `false` ngay lập tức, tuyệt đối không gửi lại.
2. **Kiểm tra cài đặt người dùng:** Đọc `settings = await this.storage.getSettings()`; nếu `settings?.notificationsEnabled === false` → không gọi `this.notifications.create`, nhưng trả về sạch sẽ không throw.
3. **Bắn thông báo trên hệ thống hiện có:**
   - Gọi `this.notifications.create('fq_finish_' + session.id, { title, message })` sử dụng `translate(locale, ...)` với tiêu đề & nội dung nêu rõ **Focus Session đã hoàn thành** + **thời lượng focus thực tế (`{minutes}`)** + phần thưởng kiếm được.
   - Đánh dấu `notificationSent = true` lên snapshot và lưu lại `await this.storage.setCurrentSession({ ...session, notificationSent: true })` (hoặc đặt sẵn trước khi commit nếu thích hợp — lưu ý cần đánh dấu ngay sau khi dispatch hoặc chống re-entry bằng in-memory `completedSessionNotificationIds: Set<string>` kết hợp persisted `notificationSent: true` trong storage để không bao giờ bắn đúp khi 2 sự kiện sát nhau).
   - *Mẹo chống race tuyệt đối:* `SessionCoordinator` giữ mọi transition kết thúc (`completeCountdown`, `finishStopwatch`, `advancePomodoroStage`) trong `this.storage.runExclusive(...)`. Do đó `rewardProcessed || status === 'COMPLETED'` + `session.notificationSent` bên trong critical section kết hợp ID cố định `fq_finish_${session.id}` bảo đảm **tối đa 1 notification / phiên** cả trong runtime lẫn kiểm thử mock.

### 6.2. Ma trận trạng thái Session Notification & Music Sync (BẮT BUỘC ĐẠT 100%)

| Kịch bản sự kiện | Gửi Notification? | Loại Notification | Hành vi Music Player (`syncWithSession = true`) | Ghi chú bảo toàn |
|---|---|---|---|---|
| **Countdown kết thúc tự nhiên** (`completeCountdown` từ alarm/heartbeat/SW wake) | **CÓ (đúng 1 lần)** | Hoàn thành Focus Session + `{minutes}m` | **Stop nhạc** (`positionSec` reset hoặc giữ cấu hình) | Music lỗi vẫn phải gửi Notification |
| **Pomodoro Countdown hoàn thành 100%** (tất cả cycles & intervals) | **CÓ (đúng 1 lần)** | Hoàn thành Pomodoro Focus Session + `{minutes}m` | **Stop nhạc** | Persist `notificationSent = true` |
| **Stopwatch hoàn thành hợp lệ** (`finishStopwatch` >= 5 phút) | **CÓ (đúng 1 lần)** | Hoàn thành Focus Session + `{minutes}m` | **Stop nhạc** | *Bổ sung mới vì hiện đang thiếu* |
| **Pomodoro Stopwatch hoàn thành hợp lệ** (`finishStopwatch` >= 1 interval) | **CÓ (đúng 1 lần)** | Hoàn thành Focus Session + `{minutes}m` | **Stop nhạc** | *Bổ sung mới vì hiện đang thiếu* |
| **Stopwatch < 5m / Pomodoro Stopwatch 0 intervals** kết thúc sớm | **KHÔNG** gửi hoàn thành thành công | — | **Stop nhạc** | Không đánh lừa người dùng là hoàn thành |
| **Pomodoro kết thúc 1 pha Focus → Short/Long Break** | **CÓ (Thông báo pha)** | `Short Break` / `Long Break` (KHÔNG phải hoàn thành cả phiên) | Giữ nguyên hoặc tùy chọn tạm nghỉ nếu cấu hình | Giữ ID `fq_pomodoro_${id}_${now}` |
| **Pomodoro hết Break → Focus mới** | **CÓ (Thông báo pha)** | `Break Ended` (quay lại Focus) | Giữ nguyên hoặc tiếp tục nếu đang chờ | Độc lập với `fq_finish_*` |
| **Pause phiên (`pauseSession`)** | **KHÔNG** | — | Tùy chính sách đồng bộ (tạm dừng nếu sync bật; mặc định không gửi notif) | Tuyệt đối không bắn hoàn thành |
| **Give Up / Abandon (`giveUpCountdown`)** | **KHÔNG** | — | **Stop nhạc** | Không gửi notif hoàn thành |
| **Browser Closed / Extension Reloaded / Disabled Recovery** | **KHÔNG** | — | **Stop nhạc** (hoặc đồng bộ IDLE khi khởi động lại) | Tuyệt đối không bắn notif khi hủy/phạt |
| **SW Restart gần cuối Countdown** (alarm/wake vượt đích trong lúc browser mở) | **CÓ (đúng 1 lần)** | Hoàn thành Focus Session (`reconcileActiveSession` → `completeCountdown`) | **Stop nhạc** | `notificationSent` chặn trùng nếu alarm bắn tiếp |
| **Alarm lặp / Gọi lặp `completeCountdown` / `finishStopwatch`** | **KHÔNG gửi lần 2** | — | Idempotent no-op | Bảo vệ bởi `rewardProcessed`, `status === 'COMPLETED'`, `notificationSent` |

### 6.3. Ranh giới cô lập lỗi (Error Isolation Boundaries)
Ở mọi điểm chuyển trạng thái kết thúc/dừng phiên trong `SessionCoordinator`:
- Hook tích hợp nhận dạng callback nhẹ (ví dụ `onSessionLifecycleHook?: (event: SessionLifecycleSignal) => Promise<void> | void` truyền vào `SessionCoordinator` ở `src/background/index.ts`, nên `SessionCoordinator` không phụ thuộc cứng vào DOM/Offscreen).
- **Thực thi tách khối độc lập:**
  ```ts
  // 1. Đã commitSessionOutcomeInternal() thành công trước đó
  // 2. Notification block độc lập
  try {
    await this.dispatchSessionCompletionNotification(...);
  } catch (err) {
    console.warn('[SessionCoordinator] Notification failed:', err);
  }
  // 3. Music sync block độc lập — MusicCoordinator tự try/catch bên trong
  try {
    await this.onSessionEndedStopMusic?.(session.id, outcome);
  } catch (err) {
    console.warn('[SessionCoordinator] Music sync hook failed:', err);
  }
  ```
- Nhờ thứ tự & 2 khối `try / catch` tách rời:
  - Dù `onSessionEndedStopMusic` throw lỗi / Offscreen document lỗi, `dispatchSessionCompletionNotification` **đã chạy xong trước đó** và hoàn toàn không bị ảnh hưởng.
  - Dù `notifications.create` ném lỗi hoặc từ chối quyền, khối Music Sync phía sau vẫn chạy bình thường, và ngược lại trong `MusicCoordinator` mọi xử lý notification hoàn toàn không nằm trong path của audio engine.
  - Web Audio `soundEffects.ts` trên Popup UI chạy độc lập theo `pomodoroPhase` / `sessionStatus` transition và cài đặt `chimeEnabled`, không chia sẻ tài nguyên AudioContext với Offscreen `<audio>`.

---

## 7. THIẾT KẾ UI MUSIC PLAYER TRONG POPUP `400×600px`

### 7.1. Nguyên tắc tích hợp không phá vỡ giao diện hiện tại
- **Không** thu hẹp chiều cao tối thiểu (~160px) của `FocusSceneArea` ở Giai đoạn 4b và **không** làm tràn thanh đáy 5 tab (`Quests | Focus | Map | Awards | Stats`) của `Navbar`.
- Bố trí **2 lớp UI gọn nhẹ**:
  1. **Nút & Mini-Indicator trên Header / Focus:** Một nút icon âm nhạc nhỏ gọn (Music note / animated equalizer bars khi `PLAYING`, ẩn/tĩnh khi `reducedMotion`) ở góc `Header` (hoặc thanh phụ dưới Header) hiển thị trạng thái phát nhanh và mở **Music Player Drawer / Bottom Sheet** tương tự `ProfileBottomSheet` (`fixed inset-0 z-40` trong khung popup 400×600).
  2. **Music Player Bottom Sheet (`src/ui/components/MusicPlayerSheet.tsx`):**
     - **Track Info & Playback Controls:** Tiêu đề, nghệ sĩ, album, thanh tua Seek (`<input type="range">` + `mm:ss / mm:ss`), nút `Prev`, `Play/Pause`, `Next`, `Stop`, `Shuffle`, `Repeat (Off/All/One)`, thanh `Volume` + `Mute`, toggle `Dừng nhạc khi hết phiên Focus`.
     - **Playlist đọc động từ `MUSIC_CATALOG`:** Render danh sách tất cả bài từ `MUSIC_CATALOG`; khi `MUSIC_CATALOG.length === 0`, hiển thị thông báo rõ ràng bằng EN/VI (*"Chưa có bài nhạc nào được đóng gói trong thư viện"*).
     - **Attribution & License Badge:** Mỗi bài hiển thị rõ `license` (`CC0` / `CC BY` / `CC BY-SA`). Với `CC BY` và `CC BY-SA`, hiển thị đầy đủ khối ghi công: `creator`, `attribution`, `isModified` (nếu có chỉnh sửa), kèm link `sourceUrl` & `licenseUrl` (`target="_blank" rel="noopener noreferrer"`).
     - **Cam kết không có Upload UI:** Không có nút upload, không `<input type="file">`, không nhập URL ngoài.
- **Song ngữ i18n 100% (`src/i18n/locales/en.ts` & `vi.ts`):** Mọi nhãn điều khiển, `aria-label`, trạng thái repeat/shuffle, nhãn bản quyền/ghi công, thông báo lỗi audio và nội dung Chrome Notification mới (nếu bổ sung khóa notification cho Stopwatch completion).

---

## 8. KẾ HOẠCH KIỂM THỬ BẮT BUỘC (MANDATORY TEST SUITES)

Tất cả test cũ (490 tests) phải tiếp tục PASS. Bổ sung 2 nhóm test chuyên biệt cho tính năng mới:

### 8.1. Nhóm Test Music Assets, Catalog & Packaging
- `__tests__/core/musicCatalog.test.ts`:
  - Kiểm tra mọi phần tử trong `MUSIC_CATALOG` hợp lệ (đủ 12 trường schema hỗ trợ, `license ∈ {'CC0','CC BY','CC BY-SA'}`, `CC BY`/`CC BY-SA` có đủ `creator`, `sourceUrl`, `licenseUrl`, `attribution`).
  - Kiểm tra **0 external URLs** trong trường `file`, **0 local dev paths** (`/Users/`, `C:\`), mọi đường dẫn `file` hợp chuẩn `assets/music/*.mp3`.
  - Kiểm tra **khả năng nhận diện track động**: hàm playlist/selector/UI helper hoạt động với 0 bài, 1 bài, 3 bài, N bài bất kỳ mà không phụ thuộc số lượng cố định; khi truyền danh sách có thêm track mới, track mới tự động xuất hiện và phát/next/shuffle chính xác.
  - Kiểm tra **không có UI upload** trong HTML render của Music Player (`!html.includes('type="file"')`, không có handler upload) và **hiển thị đầy đủ attribution** khi track là `CC BY` hoặc `CC BY-SA`.
- `__tests__/background/musicCoordinator.test.ts`:
  - Play / Pause / Resume / Stop / Next / Prev / Seek / Volume / Mute / Shuffle / Repeat (`off`/`all`/`one`) / `positionSec` persistence.
  - SW restart recovery (`rehydrate()`): đồng bộ khi Offscreen đang sống (`GET_AUDIO_STATUS`), khôi phục an toàn khi Offscreen đóng, xử lý khi catalog thay đổi.
  - Không lưu dữ liệu nhị phân MP3 vào `chrome.storage.local` (chỉ lưu metadata/state nhỏ).
- `__tests__/integration/musicPackaging.test.ts`:
  - Xác minh file `dist/manifest.json` sau build có quyền `"offscreen"`, `minimum_chrome_version >= 109`, `web_accessible_resources` cho `assets/*`, có `dist/offscreen.html` & `dist/offscreen.js`, không có inline `<script>` trong `offscreen.html`.
  - Xác minh mọi `track.file` được khai báo trong `MUSIC_CATALOG` thực sự tồn tại trong `public/` và được copy vào `dist/` sau build, đọc được đường dẫn qua `getURL`.

### 8.2. Nhóm Test Session Notifications & Error Isolation
- `__tests__/background/sessionNotifications.test.ts`:
  1. Gửi notification hoàn thành khi `COUNTDOWN` kết thúc tự nhiên (hiển thị đúng trạng thái hoàn thành + thời lượng focus thực tế).
  2. Gửi notification hoàn thành khi `POMODORO_COUNTDOWN` hoàn thành 100% cycles/intervals (và lưu `notificationSent: true`).
  3. Gửi notification hoàn thành khi `STOPWATCH` kết thúc >= 5 phút & `POMODORO_STOPWATCH` kết thúc >= 1 interval (`finishStopwatch()`).
  4. **KHÔNG** gửi notification hoàn thành khi `PAUSE`, `GIVE_UP`, `STOPWATCH < 5m`, `POMODORO_STOPWATCH 0 intervals`, hoặc `EXTENSION_RELOADED` / `BROWSER_CLOSED`.
  5. **KHÔNG** gửi trùng notification khi: gọi `completeCountdown()` 2 lần, `finishStopwatch()` 2 lần, alarm lặp, hoặc `processHeartbeat()` đụng alarm.
  6. **KHÔNG** mất notification khi SW restart gần thời điểm kết thúc (`SERVICE_WORKER_WAKE` / `reconcileActiveSession` khi đồng hồ vừa chạm target).
  7. **KHÔNG** nhầm lẫn thông báo kết thúc 1 pha Focus Pomodoro (chuyển sang Break) với thông báo hoàn thành cả Focus Session.
  8. Music Player tự dừng khi Session kết thúc **đồng thời** Notification vẫn được tạo thành công.
  9. **Cô lập lỗi 2 chiều:**
     - Offscreen/Music hook ném lỗi → `SessionCoordinator` vẫn gửi notification hoàn thành bình thường và session outcome vẫn commit đúng.
     - `notifications.create` ném lỗi → `MusicCoordinator` & `SessionCoordinator` không bị crash, nhạc vẫn dừng sạch sẽ.
  10. `soundEffects` (`playPhaseTransitionChime`, `chimeEnabled`) tiếp tục hoạt động độc lập.

---

## 9. LỘ TRÌNH TRIỂN KHAI THEO GIAI ĐOẠN (CHỈ BẮT ĐẦU KHI ĐƯỢC DUYỆT)

1. **Giai đoạn M1 — Catalog, Types & MV3 Packaging Foundation:**
   - Tạo `src/types/music.ts`, `src/data/musicCatalog.ts` (đợi/tiếp nhận các file `.mp3` từ người dùng vào `public/assets/music/` và thông tin giấy phép xác minh để khai báo, tuyệt đối không bịa license), `public/assets/music/CREDITS.md`.
   - Cập nhật `public/manifest.json`, `vite.config.ts`, tạo `public/offscreen.html` + `src/chrome/offscreenAdapter.ts` + `src/offscreen/offscreen.ts`.
2. **Giai đoạn M2 — `MusicCoordinator`, Storage State & SW Recovery:**
   - Thêm `STORAGE_KEYS.MUSIC_STATE`, xây `MusicCoordinator`, tích hợp `src/background/index.ts`, `src/background/messageHandler.ts`, `src/types/messages.ts`, và simulator cơ bản trong `src/ui/services/extensionClient.ts`.
3. **Giai đoạn M3 — Chuẩn hóa Session Notifications & Sync/Isolation Hook:**
   - Chuẩn hóa `dispatchSessionCompletionNotification` trong `SessionCoordinator`, bổ sung completion notifications cho `finishStopwatch()`, persist `notificationSent` cho `POMODORO_COUNTDOWN`, kiểm tra `notificationsEnabled`, sửa default icon path `'icons/icon128.png'` trong `ChromeNotificationsAdapter`, và nối hook `onSessionEnded` sang `MusicCoordinator` trong `try / catch` cô lập.
   - Bổ sung i18n keys (`en.ts`, `vi.ts`).
4. **Giai đoạn M4 — Music Player UI & Attribution CC BY / CC BY-SA:**
   - Xây `MusicPlayerSheet.tsx` + nút trigger gọn trên `Header.tsx` / `App.tsx`, hiển thị danh sách động từ `MUSIC_CATALOG`, đầy đủ controls + hiển thị Attribution đầy đủ cho CC BY / CC BY-SA, **0** upload UI, giữ nguyên layout `FocusSceneArea` & `Navbar`.
5. **Giai đoạn M5 — Kiểm thử toàn diện & Báo cáo Nghiệm thu Tách biệt:**
   - Viết đầy đủ test nhóm **Music Assets / Packaging / Coordinator** và nhóm **Session Notifications / Error Isolation**.
   - Chạy `npm run lint`, `npm run clean && npm run build`, `npm test` (3 lần liên tiếp), kiểm tra thực tế artifacts `dist/` (`assets/music/*.mp3`, `offscreen.html`, `offscreen.js`, `manifest.json`, `background.js`).
   - **Báo cáo cuối cùng bắt buộc tách 2 mục riêng biệt:**
     - **Phần 1: Music Player**
     - **Phần 2: Session Notifications**
     *(Không tuyên bố hoàn thành khi một trong hai phần chưa kiểm chứng đủ tiêu chí).*

---

## 10. HƯỚNG DẪN BỔ SUNG FILE MP3 CHO TÁC GIẢ DỰ ÁN

Khi bạn upload các file `.mp3` vào `public/assets/music/`, vui lòng kèm theo thông tin xác minh cho từng bài (tối thiểu: `tên file .mp3`, `title`, `artist`/`creator`, `album`, `license` là `CC0` / `CC BY` / `CC BY-SA`, `licenseUrl`, `sourceUrl`, `attribution`, `isModified`) để hệ thống khai báo vào `src/data/musicCatalog.ts` và hiển thị ghi công chính xác mà không tự suy đoán giấy phép.
