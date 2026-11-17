# BÁO CÁO NGHIỆM THU — MUSIC PLAYER & SESSION NOTIFICATIONS HARDENING

**Ngày hoàn thành:** 2026-11-16  
**Tài liệu kế hoạch tham chiếu:** `respond_plan_music_player.md`  
**Kết quả kiểm định tổng thể:** `npm run lint` PASS (`0` lỗi) · `npm run clean && npm run build` PASS (`1.12s`) · `npm test` PASS **3/3 lần chạy liên tiếp — `509 / 509 tests PASS` (`30.06s`, `30.26s`, `31.12s`)**.

---

## 1. MUSIC PLAYER (MP3 Đóng gói sẵn, MV3 Offscreen & Bản quyền CC BY 4.0 / CC0 1.0)

### 1.1. Tài nguyên & Thư viện Nhạc
- Đã đóng gói đủ **10 file MP3** vào `public/assets/music/` và **xóa hoàn toàn `public/assets/aistudio/`** (đã xác minh cả `public/assets/aistudio` và `dist/assets/aistudio` đều không tồn tại):
  - **Purrple Cat (CC BY 4.0):**
    1. `purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3` (2:55 / 175s)
    2. `purrple-cat-city-nights-2-02-rooftop-rendezvous_25a6b224.mp3` (3:04 / 184s)
    3. `purrple-cat-city-nights-2-07-lonely_26f60337.mp3` (2:56 / 176s)
    4. `purrple-cat-indigo-dreams-07-walking-to-the-park-at-3-a-m_8fae33b8.mp3` (3:22 / 202s)
    5. `purrple-cat-sea-of-stars-2-10-starlit-beach_715e8b5f.mp3` (2:54 / 174s)
  - **HoliznaCC0 — Public Domain Lofi (CC0 1.0):**
    6. `holizna-cc0-into-the-mist.mp3` (2:10 / 130s)
    7. `holizna-cc0-before-everything.mp3` (2:51 / 171s)
    8. `holizna-cc0-theta-frequency.mp3` (2:07 / 127s)
    9. `holizna-cc0-birds.mp3` (2:50 / 170s)
    10. `holizna-cc0-when-time-called-me-darling.mp3` (3:35 / 215s)
- **Catalog động nội bộ (`src/data/musicCatalog.ts`, `src/types/music.ts`):**
  - Khai báo đủ 12 trường (`id`, `title`, `artist`, `album`, `file`, `duration`, `license`, `licenseUrl`, `creator`, `sourceUrl`, `attribution`, `isModified`), hỗ trợ `'CC0' | 'CC BY' | 'CC BY-SA'`.
  - Ép kiểm tra ghi công bắt buộc đối với `CC BY` & `CC BY-SA` (`validateMusicCatalog`), chặn đường dẫn ngoài / URL Internet / `..` (`isBundledMp3Path`), không hardcode số lượng bài trong UI hay coordinator.
  - Ghi công đầy đủ trong `public/assets/music/CREDITS.md`, `src/data/musicCatalog.ts`, `README.md`, và UI `MusicPlayerSheet.tsx`:
    - `Music by Purrple Cat (purrplecat.com), licensed under CC BY 4.0: creativecommons.org/licenses/by/4.0/`
    - `Music by HoliznaCC0 — CC0 1.0 Universal (Public Domain): freemusicarchive.org/music/holiznacc0/public-domain-lofi`

### 1.2. Đóng gói MV3, Offscreen Audio Engine & Storage
- **`public/manifest.json`:** Nâng `"minimum_chrome_version": "109"`, bổ sung quyền `"offscreen"`, giữ `web_accessible_resources` phủ `assets/*`.
- **`vite.config.ts` & `public/offscreen.html`:** Thêm entrypoint `src/offscreen/offscreen.ts` → `dist/offscreen.js` (`2,828 B`), `dist/offscreen.html` (`209 B`) chỉ nạp external module `./offscreen.js` (0 inline script, chuẩn CSP MV3).
- **`src/chrome/offscreenAdapter.ts` & `src/background/musicCoordinator.ts`:**
  - `MusicCoordinator` quản lý hàng đợi phát nhạc, Play / Pause / Resume / Stop / Next / Previous / Seek / Volume / Mute / Shuffle (xác định, zero `Math.random`) / Repeat (`off` | `all` | `one`) / `syncWithSession`.
  - Phục hồi khi Service Worker khởi động lại (`ensureInitialized()`): hỏi `GET_AUDIO_STATUS` nếu Offscreen Document đang sống (không ngắt nhạc), hoặc khởi tạo lại tại `positionSec` đã lưu nếu Offscreen đã đóng.
  - Khóa tuần tự riêng biệt (không tranh chấp `StorageMutex`), chỉ lưu metadata/trạng thái nhẹ ở `STORAGE_KEYS.MUSIC_STATE = 'fq_music_state'`, **không** lưu dữ liệu nhị phân MP3 vào `chrome.storage.local` hay `IndexedDB`.
  - `src/background/index.ts`: Đẩy `scope === 'FQ_OFFSCREEN_MUSIC'` trả về `false` để Offscreen Document nhận lệnh trực tiếp; xử lý `scope === 'FQ_MUSIC_EVENT'` cập nhật tiến trình/chuyển bài kế tiếp.
- **UI & Simulator (`src/ui/components/MusicPlayerSheet.tsx`, `Header.tsx`, `App.tsx`, `extensionClient.ts`, `errorTranslator.ts`, `en.ts`/`vi.ts`):**
  - Bottom sheet `400px`, danh sách phát đọc động từ `catalog`, điều khiển đầy đủ, hiển thị khối bản quyền & link nguồn/giấy phép (`target="_blank" rel="noopener noreferrer"`), tôn trọng `motion-reduce`, song ngữ 100% EN/VI (kể cả lỗi audio), **0** upload UI / YouTube / URL ngoài.

### 1.3. Kiểm thử Music Player (12 tests mới — PASS)
- `__tests__/core/musicCatalog.test.ts` (5 tests)
- `__tests__/background/musicCoordinator.test.ts` (4 tests)
- `__tests__/integration/musicPackaging.test.ts` (1 test kiểm tra `dist/manifest.json`, `dist/offscreen.html`, `dist/offscreen.js`, `dist/assets/music/*.mp3`, không có `dist/assets/aistudio` và `dist/background.js` sạch UI)
- `__tests__/ui/musicPlayerSheet.test.ts` (2 tests)

---

## 2. SESSION NOTIFICATIONS (Chuẩn hóa trên `SessionCoordinator` & Cô lập lỗi 2 chiều)

### 2.1. Chuẩn hóa & Mở rộng Độ phủ
- Tái sử dụng duy nhất `SessionCoordinator` + `ChromeNotificationsAdapter` + `SessionSnapshot.notificationSent` (**không** tạo hệ thống thông báo thứ hai).
- **`src/chrome/notificationsAdapter.ts`:** Sửa đường dẫn icon mặc định từ `'assets/icon128.png'` sang `'icons/icon128.png'` khớp thư mục `public/icons/`.
- **`src/background/sessionCoordinator.ts`:**
  - Tạo `notifySessionCompletedInternal(...)` thống nhất: kiểm tra `session.notificationSent`, persisted flag, `dispatchedCompletionNotificationIds` in-memory, và `UserSettings.notificationsEnabled !== false`; dùng ID chuẩn hóa `fq_finish_${sessionId}`, kèm thời lượng focus thực tế & phần thưởng; ghi nhận `notificationSent: true` vào storage.
  - Bổ sung gửi thông báo hoàn thành cho `finishStopwatch()` ở cả `STOPWATCH` (`>= 5` phút / `rewardResult.isThresholdMet`) và `POMODORO_STOPWATCH` (`completedIntervals > 0`).
  - Chuẩn hóa nhánh hoàn thành 100% `POMODORO_COUNTDOWN` trong `advancePomodoroStage()` qua `notifySessionCompletedInternal(...)`.
  - Tách biệt rõ thông báo **pha Pomodoro** (`fq_pomodoro_${session.id}_c{cycle}_i{interval}_{phase}_{now}` chống trùng ID cùng mili-giây) với thông báo **hoàn thành cả phiên** (`fq_finish_${session.id}`).
  - **Không** gửi thông báo hoàn thành khi `Pause`, `Give Up`, `Stopwatch < 5m`, `Pomodoro Stopwatch 0 intervals`, `Extension Reloaded`, hoặc `Browser Closed`.
  - **Cô lập lỗi 2 chiều:** tách khối `try/catch` giữa `notifySessionCompletedInternal` và `triggerSessionEndedHookInternal` (`onSessionEndedHook` gọi `musicCoordinator.handleFocusSessionEnded`); lỗi từ Offscreen/Music không làm rớt thông báo hay hỏng commit phiên, và lỗi `notifications.create` không làm crash `MusicCoordinator` / `SessionCoordinator`.
  - Giữ nguyên độc lập Web Audio `soundEffects.ts` (điều khiển bởi `chimeEnabled`).

### 2.2. Kiểm thử Session Notifications (7 tests mới — PASS)
- `__tests__/background/sessionNotifications.test.ts` (7 tests bao phủ toàn bộ 10 kịch bản: Countdown, Pomodoro 100% vs Break/Focus phases, Stopwatch >= 5m & Pomodoro Stopwatch >= 1 interval, không gửi khi Pause/Give Up/<5m/0 interval/Reload/Browser Close, chống trùng lặp, phục hồi SW wake gần cuối Countdown, cô lập lỗi 2 chiều Music ↔ Notifications, và tôn trọng `notificationsEnabled=false` độc lập với `chimeEnabled`).
