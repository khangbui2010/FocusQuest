# BÁO CÁO NGHIỆM THU — MILESTONE LOFI / GIAI ĐOẠN LOFI-1 & BẢN BỔ SUNG LOFI-1b

**Giai đoạn:** Milestone LOFI — Giai đoạn LOFI-1 + Bản bổ sung LOFI-1b *(tính năng MỚI, KHÔNG thuộc Phase 5 / Milestone 5B.5; chưa sang LOFI-2)*  
**Ngày hoàn thành:** 2026-11-17  
**File sao lưu báo cáo cũ:** `/respond_lofi1_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`520 / 520` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt trước khi sang LOFI-2**

---

# PHẦN I — BÁO CÁO GIAI ĐOẠN LOFI-1 (ĐẦY ĐỦ & ĐÃ ĐÍNH CHÍNH)

## 0. BƯỚC 0 — KIỂM TRA HIỆN TRẠNG (TRƯỚC KHI THAY ĐỔI)

### 0.1. Âm thanh đang phát bằng gì, ở đâu & đóng popup có tắt không?
- **Nơi phát nhạc nền:** `public/offscreen.html` kết hợp `src/offscreen/offscreen.ts` dùng thẻ HTML `<audio>` thuần (không dùng `AudioContext` cho nhạc nền) chạy bên trong **Chrome MV3 Offscreen Document** tạo qua `chrome.offscreen.createDocument` (`reasons: ['AUDIO_PLAYBACK']`).
- **Khi đóng popup:** Nhạc **tiếp tục phát** trong Offscreen Document vì Service Worker + Offscreen Document sống độc lập với popup DOM. Tuy nhiên kiến trúc tiền LOFI-1 đang nạp file từ `chrome.runtime.getURL('assets/music/...')`, dùng giao thức `scope: 'FQ_OFFSCREEN_MUSIC'` (`LOAD_AND_PLAY`, `PAUSE`, `RESUME`, `GET_AUDIO_STATUS`), chưa xử lý đồng bộ Pause/Resume/Break từ `SessionCoordinator`, và phụ thuộc danh sách hard-code cục bộ.
- **Các nguồn âm thanh khác trong repo (giữ nguyên ngoài phạm vi LOFI-1):**
  - `src/ui/services/soundEffects.ts`: phát chuông chuyển pha Pomodoro (`AudioContext` + `OscillatorNode`, không phải nhạc nền).
  - `src/ui/services/extensionClient.ts`: giả lập `HTMLAudioElement` cho chế độ **Web Preview** (khi chạy ngoài Chrome Extension).

### 0.2. Vị trí file audio trong repo & dung lượng `dist/`
- **File audio trong repo:** Toàn bộ file audio cục bộ đã được xóa khỏi repo trước khi triển khai LOFI-1 (`0` file `.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac` trong `public/` hay toàn bộ repo; tổng dung lượng audio đóng gói = `0 B`).
- **Dung lượng build `dist/` sau LOFI-1 (trước LOFI-1b):**
  - Tổng dung lượng toàn thư mục `dist/`: **`1,038,979 bytes`** (`~1,021 KiB`)
  - `dist/offscreen.html`: **`264 bytes`**
  - `dist/offscreen.js`: **`3,878 bytes`** (`3.87 kB`)
  - `dist/background.js`: **`86,691 bytes`** (`86.69 kB`)
  *(Xem bảng đối chiếu đầy đủ trước LOFI-1 → sau LOFI-1 → sau LOFI-1b tại Mục 5(c) ở Phần II.)*

### 0.3. Catalog cũ hard-code ở đâu & hiển thị bản quyền ra sao?
- **Vị trí hard-code trước LOFI-1:** Mảng `MUSIC_CATALOG: readonly MusicTrack[]` (11 bài) trong `src/data/musicCatalog.ts`, trỏ tới `file: 'assets/music/...'`.
- **Hiển thị nhãn giấy phép:**
  - Code cũ trước LOFI-1 khai báo `'CC BY'`, `'CC0'`, `'CC BY-SA'`.
  - `src/ui/components/MusicPlayerSheet.tsx` hiển thị mục **License & Attribution** (`Bản quyền & Ghi công`): tên giấy phép, tên tác giả (`creator`), trạng thái chỉnh sửa (`Modified` / `Unmodified original`), link `Artist Site` (`sourceUrl`), link `License Terms` (`licenseUrl`), và huy hiệu `Attribution Required` khi `isAttributionRequired(license) === true` (bật cho `CC-BY*`/`CC-BY-SA*`, tắt cho `CC0*`).

### 0.4. Bảng đối chiếu 11 bài: Code tiền LOFI-1 vs Catalog online (`tracks.json`)
Nguồn online: `https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json` (`schemaVersion: 1`, `updatedAt: "2026-11-17"`).

| # | `id` | `title` | `artist` | `file` (`tracks.json`) | `durationSec` | License trong code cũ | License trong `tracks.json` | Khớp / Sai khác |
|---|---|---|---|---|---|---|---|---|
| 1 | `purrple-cat-twilight-market` | Twilight Market | Purrple Cat | `purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3` | 175 | `CC BY` | `CC-BY-4.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-4.0` và chỉ tên file không kèm `assets/music/` |
| 2 | `purrple-cat-rooftop-rendezvous` | Rooftop Rendezvous | Purrple Cat | `purrple-cat-city-nights-2-02-rooftop-rendezvous_25a6b224.mp3` | 184 | `CC BY` | `CC-BY-4.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-4.0` |
| 3 | `purrple-cat-lonely` | Lonely | Purrple Cat | `purrple-cat-city-nights-2-07-lonely_26f60337.mp3` | 176 | `CC BY` | `CC-BY-4.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-4.0` |
| 4 | `purrple-cat-walking-to-the-park-at-3am` | Walking to the Park at 3 A.M. | Purrple Cat | `purrple-cat-indigo-dreams-07-walking-to-the-park-at-3-a-m_8fae33b8.mp3` | 202 | `CC BY` | `CC-BY-4.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-4.0` |
| 5 | `purrple-cat-starlit-beach` | Starlit Beach | Purrple Cat | `purrple-cat-sea-of-stars-2-10-starlit-beach_715e8b5f.mp3` | 174 | `CC BY` | `CC-BY-4.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-4.0` |
| 6 | `holizna-cc0-into-the-mist` | Into The Mist | HoliznaCC0 | `holizna-cc0-into-the-mist.mp3` | 130 | `CC0` | `CC0-1.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC0-1.0` |
| 7 | `holizna-cc0-before-everything` | Before Everything | HoliznaCC0 | `holizna-cc0-before-everything.mp3` | 171 | `CC0` | `CC0-1.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC0-1.0` |
| 8 | `holizna-cc0-theta-frequency` | Theta Frequency | HoliznaCC0 | `holizna-cc0-theta-frequency.mp3` | 127 | `CC0` | `CC0-1.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC0-1.0` |
| 9 | `holizna-cc0-birds` | Birds | HoliznaCC0 | `holizna-cc0-birds.mp3` | 170 | `CC0` | `CC0-1.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC0-1.0` |
| 10 | `holizna-cc0-when-time-called-me-darling` | When Time Called Me Darling | HoliznaCC0 | `holizna-cc0-when-time-called-me-darling.mp3` | 215 | `CC0` | `CC0-1.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC0-1.0` |
| 11 | `ikkun-barradeen-whisper` | whisper | ikkun (ex. Barradeen) | `ikkun-barradeen-whisper.mp3` | 66 | `CC BY-SA` | `CC-BY-SA-3.0` | Khớp bài & nghệ sĩ; online dùng mã SPDX `CC-BY-SA-3.0` |

**Ghi chú sai khác cấu trúc schema:** `tracks.json` dùng tên trường `durationSec` và `modified` (thay cho `duration` và `isModified`), không chứa `creator`/`attribution` sẵn mà được `parseRemoteCatalog` tổng hợp lại; giữ nguyên 100% nhãn SPDX `CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-3.0` từ `tracks.json` khi hiển thị (không tự sửa ngữ nghĩa giấy phép).

---

## 1. KIẾN TRÚC LOFI-1 ĐÃ TRIỂN KHAI

### 1.1. Offscreen Document & Giao thức Tin nhắn (`public/offscreen.html`, `src/offscreen/offscreen.ts`, `src/types/music.ts`)
- **`public/offscreen.html`:** Trang HTML tĩnh chứa `<audio id="lofi-audio" preload="metadata"></audio>` và `<script type="module" src="./offscreen.js"></script>` (tuân thủ CSP MV3, không có inline script).
- **Lọc `target` rõ ràng:** Mọi message gửi tới Offscreen có `target: 'offscreen'`, mọi event gửi về Service Worker có `target: 'background'`. Service Worker (`src/background/index.ts`) trả `false` với message `target === 'offscreen'` để Offscreen xử lý trực tiếp.
- **Lệnh SW → Offscreen:** `MUSIC_PLAY { url, volume, startAtSec, trackId?, muted? }`, `MUSIC_PAUSE`, `MUSIC_STOP`, `MUSIC_SEEK { positionSec }`, `MUSIC_SET_VOLUME { volume, muted? }`, `MUSIC_GET_STATUS`.
- **Báo cáo Offscreen → SW:**
  - `MUSIC_POSITION { trackId, positionSec, durationSec }`: gửi ngay khi `loadedmetadata`, `pause`, `ended`, `seek`, và định kỳ với throttle **5 giây** khi đang phát.
  - `MUSIC_ENDED { trackId }`: báo kết thúc bài để Coordinator chuyển bài hoặc dừng theo `repeatMode`.
  - `MUSIC_ERROR { code, trackId?, message? }`: chuẩn hóa 4 mã lỗi `'autoplay_blocked' | 'network' | 'decode' | 'unknown'`.

### 1.2. Xử lý Giới hạn 30 giây của Chrome (`AUDIO_PLAYBACK`)
- **Không** dùng âm thanh im lặng hay mẹo giữ kết nối để giữ Offscreen Document sống khi tạm dừng.
- Trong lúc phát, `positionSec` liên tục được đồng bộ về `STORAGE_KEYS.MUSIC_STATE`.
- Khi `Pause` kéo dài và Chrome tự đóng Offscreen Document sau 30 giây, lần `Resume` hoặc `Sync` tiếp theo trong `MusicCoordinator` kiểm tra `hasDocument()`, tự gọi `ensureDocument()`, gửi `MUSIC_PLAY` với `startAtSec = positionSec` đã lưu; `offscreen.ts` giữ `pendingStartAtSec` và tự tua ngay tại sự kiện `loadedmetadata` sau `audio.load()`.

### 1.3. `src/background/musicCoordinator.ts` & `src/chrome/offscreenAdapter.ts`
- **Single-flight Offscreen Guard:** `ChromeOffscreenAdapter` là nơi duy nhất gọi `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })` và `chrome.offscreen.createDocument`, dùng `creatingPromise` chống tạo trùng 2 document khi gọi đồng thời.
- **Catalog online động & Cache TTL 6 giờ (`src/data/musicCatalog.ts`, `src/storage/`):**
  - Đọc động từ `LOFI_CATALOG_URL` và dựng URL phát nhạc HTTPS từ `LOFI_BASE_URL` (không hard-code danh sách bài hay số lượng bài).
  - Cache vào `STORAGE_KEYS.MUSIC_CATALOG_CACHE` (`fq_music_catalog_cache`) với TTL **6 giờ**; khi mạng lỗi vẫn fallback về cache cũ thay vì crash; hỗ trợ `MUSIC_REFRESH_CATALOG` để người dùng làm mới thủ công.
- **Đồng bộ Phiên Tập trung (`deriveMusicIntent` & `SessionCoordinator`):**
  - Pure helper `deriveMusicIntent(snapshot, settings)` xác định ý định `'play' | 'pause' | 'stop'` theo trạng thái phiên (`RUNNING`, `PAUSED`, `SHORT_BREAK` / `LONG_BREAK`, terminal `COMPLETED`/`ABANDONED`/`INTERRUPTED`), kết hợp `musicEnabled`, `playDuringBreak` (`UserSettings.musicPlayDuringBreak` / `MUSIC_SET_PLAY_DURING_BREAK`), và `stopMusicOnSessionEnd`.
  - Tôn trọng Pause thủ công của người dùng: nếu người dùng tự bấm Pause nhạc trước khi phiên Pause, khi Resume phiên hệ thống không tự ép nhạc phát lại.

### 1.4. Giao diện & Song ngữ EN/VI (`MusicPlayerSheet.tsx`, `App.tsx`, `extensionClient.ts`, `en.ts`, `vi.ts`, `errorTranslator.ts`)
- Giữ nguyên toàn bộ bố cục & tính năng của trình phát, gỡ bỏ hoàn toàn `MUSIC_CATALOG` hard-code.
- Thêm toggle `Keep playing music during Pomodoro breaks` / `Tiếp tục phát nhạc trong giờ nghỉ Pomodoro` (`data-testid="music-play-during-break-toggle"`) và nút `Refresh` / `Làm mới` (`data-testid="music-refresh-catalog-btn"`).
- Hỗ trợ dịch lỗi `'autoplay_blocked'`, `'network'`, `'decode'`, `'unknown'` và thông báo lỗi tải catalog sang tiếng Việt qua `localizeErrorMessage`.

## 2. PHẦN ĐÍNH CHÍNH ĐÃ THỰC HIỆN (LOFI-1)

1. **Không giữ / không tạo file audio hay thư mục tạm:** Không tạo `_music_source/`, không tạo file âm thanh giả/placeholder; `public/` và `dist/` chứa **`0` file audio** (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`), thư mục `public/assets/music/` và `dist/assets/music/` không tồn tại.
2. **Gỡ bỏ mọi tham chiếu tới thư viện nhạc cục bộ:** Gỡ `MUSIC_CATALOG`, `isBundledMp3Path`, `resolveTrackAssetUrl`, mọi đường dẫn `assets/music/...`, và chuỗi `"Bundled offline MP3 library"` / `"Thư viện MP3 tích hợp sẵn (Offline)"`; đổi phụ đề thành `"Streamed Lofi library"` (`en`) và `"Thư viện nhạc Lofi trực tuyến"` (`vi`).
3. **Sửa các test kiểm tra file cục bộ & bổ sung test mới (cộng dồn cả LOFI-1 + LOFI-1b):**
   - `__tests__/core/musicCatalog.test.ts`: Thay kiểm thử `MUSIC_CATALOG` / file MP3 cục bộ bằng `parseRemoteCatalog`, `resolveTrackStreamUrl`, `isValidStreamFileOrUrl`, SPDX attribution, TTL 6h, `fetchRemoteMusicCatalog`, chặn `public/` chứa audio, và hardening payload không đáng tin cậy (Mục 3 Phần II).
   - `__tests__/integration/musicPackaging.test.ts`: Thay vòng lặp kiểm tra file MP3 đóng gói bằng quét đệ quy cấm file `.mp3/.ogg/.wav/.m4a/.flac` trong `public/` & `dist/`, đồng thời cập nhật `minimum_chrome_version >= 116`.
   - `__tests__/background/musicCoordinator.test.ts`: Chuyển từ giao thức `LOAD_AND_PLAY`/`OFFSCREEN_*` sang `target: 'offscreen' | 'background'` (`MUSIC_*`), bổ sung kiểm thử `deriveMusicIntent`, 30s Offscreen recovery, Pomodoro Break, TTL 6h, `chrome.runtime.getContexts`, `offscreen.ts` controller, ma trận chuyển trạng thái `SessionCoordinator`, và tách mutex/reward.
   - `__tests__/ui/musicPlayerSheet.test.ts`: Dùng fixture SPDX thay `MUSIC_CATALOG`, kiểm tra `"Streamed Lofi library"` / `"Thư viện nhạc Lofi trực tuyến"`, empty offline state + Retry EN/VI, zero upload UI.
   - `__tests__/background/sessionNotifications.test.ts`: Gỡ import `MUSIC_CATALOG`, dùng fixture 2 bài tại chỗ và `StubOffscreen` chuẩn `MUSIC_PLAY`/`MUSIC_STOP`.
4. **Cập nhật `/CREDITS.md` và `/README.md`:** Bỏ khẳng định nhạc nằm trong `public/assets/music/`, ghi nguồn online (`FocusQuest-LOFI-archive`) và giữ nguyên thông tin giấy phép từng bài.

---

# PHẦN II — BÁO CÁO BẢN BỔ SUNG LOFI-1b

## 1. Phiên bản Chrome tối thiểu (`minimum_chrome_version: "116"`)

- **Phương án đã chọn:** Đặt `"minimum_chrome_version": "116"` trong `public/manifest.json` và cập nhật `__tests__/integration/musicPackaging.test.ts` từ `>= 109` lên `>= 116`.
- **Lý do lựa chọn `"116"` thay vì giữ `"109"` với nhánh bắt chuỗi lỗi:**
  1. `ChromeOffscreenAdapter.hasDocument()` sử dụng trực tiếp API chuẩn `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })` vốn chỉ có từ **Chrome 116**. Nếu để `"minimum_chrome_version": "109"`, extension sẽ cho phép cài trên Chrome 109–115 rồi lỗi khi gọi `getContexts` (hoặc phải dựa vào nhánh fallback `try/catch` thông báo chuỗi `"Only a single offscreen document may be created."` rất dễ vỡ khi Chrome đổi text lỗi hoặc không biết được document đang ở trạng thái mở thực sự trước `MUSIC_GET_STATUS` / `MUSIC_STOP`).
  2. Khả năng đọc chính xác danh sách Offscreen Document đang mở trước khi gọi `MUSIC_GET_STATUS` là điều kiện cần để `MusicCoordinator.ensureInitialized()` và `getState()` đồng bộ vị trí phát thực tế sau khi Service Worker thức dậy mà không tự tạo Offscreen Document thừa khi đang pause/dừng.

---

## 2. Phủ đủ điểm gọi hook đồng bộ nhạc trong `SessionCoordinator` & Kỷ luật Mutex

### 2.1. Bảng kiểm kê mọi hàm / chuyển trạng thái trong `src/background/sessionCoordinator.ts`

| Hàm / Chuyển trạng thái | Thời điểm đổi trạng thái | Trạng thái trước LOFI-1b | Trạng thái sau LOFI-1b | Loại hook & Reason | Ngoài `StorageMutex`? | Xử lý `stopMusicOnSessionEnd` (`true` / `false`) |
|---|---|---|---|---|---|---|
| `startSession` | Bắt đầu phiên (`RUNNING`) | Đã có (nhưng nằm trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionSyncHook(created, 'STARTED')` | **Có** | Độc lập kết thúc: phát nếu `musicEnabled` |
| `pauseSession` | Tạm dừng (`PAUSED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionSyncHook(updated, 'PAUSED')` | **Có** | Pause nhạc (giữ vị trí; tôn trọng pause thủ công) |
| `resumeSession(isAutoResume, fromAlarmName)` | Tiếp tục thủ công / Auto-resume 5m (`RUNNING`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** + bỏ gọi thừa ở no-op guard | `onSessionSyncHook(updated, 'RESUMED')` | **Có** | Phát lại từ `positionSec` nếu trước đó `musicEnabled` |
| `advancePomodoroStage` (`FOCUS -> SHORT/LONG_BREAK`) | Hết pha Focus (`POMODORO_COUNTDOWN` / `POMODORO_STOPWATCH`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionSyncHook(updated, 'PHASE_CHANGED')` | **Có** | Pause khi `playDuringBreak=false`, Play khi `true` |
| `advancePomodoroStage` (`BREAK -> FOCUS`) & `MessageHandler.SKIP_POMODORO_BREAK` | Hết giờ nghỉ hoặc bấm Skip Break | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionSyncHook(updated, 'PHASE_CHANGED')` | **Có** | Tự động Resume khi vào `FOCUS` |
| `advancePomodoroStage` (100% Pomodoro Countdown) | Hoàn thành toàn bộ cycles (`COMPLETED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionEndedHook({ status: 'COMPLETED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `completeCountdown` | Hết giờ Countdown (`COMPLETED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** + skip nếu idempotent | `onSessionEndedHook({ status: 'COMPLETED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `finishStopwatch` (`STOPWATCH` & `POMODORO_STOPWATCH`) | Kết thúc Stopwatch (`COMPLETED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** + skip nếu idempotent | `onSessionEndedHook({ status: 'COMPLETED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `giveUpCountdown` (`COUNTDOWN` / `POMODORO_*`) | Bỏ cuộc (`ABANDONED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionEndedHook({ status: 'ABANDONED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `handleExtensionDisabledRecovery` | Disable / Reload extension (`INTERRUPTED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** + skip nếu inactive | `onSessionEndedHook({ status: 'INTERRUPTED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `handleBrowserStartupRecovery` — Interrupted (`COUNTDOWN >=1s`, `STOPWATCH`, `POMODORO_STOPWATCH`, `POMODORO_COUNTDOWN >=1s`) | Tắt/khởi động lại trình duyệt (`INTERRUPTED`) | Đã có (trong `runExclusive`) | **Đã dời ra ngoài mutex** | `onSessionEndedHook({ status: 'INTERRUPTED' })` | **Có** | `true`: STOP & đóng Offscreen; `false`: tiếp tục phát |
| `handleBrowserStartupRecovery` — Active Countdown (`downtimeMs < 1000 && now < targetFinishTime`) | Khôi phục Countdown đang chạy ngay sau startup | **CHƯA CÓ** | **MỚI BỔ SUNG** | `onSessionSyncHook(current, 'BROWSER_STARTUP_ACTIVE')` | **Có** | Đảm bảo nhạc `musicEnabled=true` tiếp tục phát |
| `handleBrowserStartupRecovery` — Active `PAUSED` / `POMODORO_COUNTDOWN < 1s` | Ủy quyền cho `reconcileActiveSession` | Đã có (qua `reconcileActiveSession`) | **Giữ nguyên ngoài mutex** | `onSessionSyncHook(session, 'RECOVERY')` | **Có** | Đồng bộ Pause/Break/Focus |
| `reconcileActiveSession` | Thức dậy SW (`RUNNING` / `PAUSED` / ủy quyền finish/advance) | Đã có | **Đã đảm bảo hoàn toàn ngoài mutex** | `onSessionSyncHook(session, 'RECOVERY')` | **Có** | Đồng bộ đúng `deriveMusicIntent` |
| `executeLifecycleRecovery` — `!session` (khi `!isStartup`) | SW wake/reload khi không có phiên | **CHƯA CÓ** *(trước chỉ gọi khi `isStartup`)* | **MỚI BỔ SUNG** cho mọi reason | `onSessionSyncHook(null, isStartup ? 'STARTUP_NO_SESSION' : reason)` | **Có** | Startup + `!session`: dọn phát cũ; SW wake: giữ `musicEnabled` |
| `executeLifecycleRecovery` — `isTerminal(session.status)` (khi `!isStartup`) | SW wake/reload trên phiên đã kết thúc | **CHƯA CÓ** *(trước chỉ gọi khi `isStartup`)* | **MỚI BỔ SUNG** cho mọi reason | `onSessionSyncHook(session, reason)` | **Có** | `true`: STOP nhạc tồn dư; `false`: giữ theo `musicEnabled` |
| `resetSession()` | Đưa phiên terminal về `IDLE` (`null`) | **CHƯA CÓ** | **MỚI BỔ SUNG** | `onSessionSyncHook(null, 'RESET')` | **Có** | `true`: đã stopped (`STOP`); `false`: giữ nếu đang bật |
| `processHeartbeat` / `updateHeartbeat` | Tick mỗi 1 phút không đổi trạng thái | Không đổi trạng thái; ủy quyền `completeCountdown` / `resumeSession` / `advancePomodoroStage` khi đổi | Không cần bắn trùng mỗi phút khi cùng pha | Ủy quyền hàm đích khi chuyển | **Có** | Ủy quyền đầy đủ |

### 2.2. Kỷ luật Mutex, `try/catch` & Tính toàn vẹn Phần thưởng
- Toàn bộ hàm trong `SessionCoordinator` đều kết thúc `await this.storage.runExclusive(...)` trước khi gọi `triggerSessionSyncHookInternal` / `triggerSessionEndedHookInternal`.
- Cả hai helper hook đều bọc `try/catch` (chỉ `console.warn`, không rethrow).
- Đã kiểm chứng trong `__tests__/background/musicCoordinator.test.ts`:
  - Test `Session + Music Sync: full SessionCoordinator transition matrix...`: kiểm tra `startSession`, `pauseSession`, `resumeSession(true)`, `completeCountdown` (`stopMusicOnSessionEnd=true/false`), `resetSession`, `finishStopwatch` (`STOPWATCH` & `POMODORO_STOPWATCH`), `giveUpCountdown`, `SKIP_POMODORO_BREAK` qua `MessageHandler`, `handleExtensionDisabledRecovery`, `handleLifecycleEvent('SERVICE_WORKER_WAKE')` terminal, và `handleBrowserStartupRecovery` (<1s active & interrupted).
  - Test `SessionCoordinator Hook Isolation...`: chứng minh hook `async` chậm 80ms không giữ `StorageMutex` (`storage.runExclusive` chạy xong ngay trong <30ms), và ném Exception trong cả `onSessionSyncHook` lẫn `onSessionEndedHook` cho kết quả `focusCoins` và `totalXP` y hệt nhau.

---

## 3. Kiểm tra dữ liệu Catalog không đáng tin cậy (`tracks.json`)

### 3.1. Biện pháp kiểm tra trong `src/data/musicCatalog.ts` & `src/background/musicCoordinator.ts`
| Ràng buộc | Xử lý trong code | Hành vi khi vi phạm |
|---|---|---|
| `schemaVersion !== 1` (ví dụ `0`, `2`, `'1'`, thiếu) | `parseRemoteCatalog` kiểm tra `obj.schemaVersion !== 1` | Ném lỗi từ chối toàn bộ payload, giữ nguyên bản cache cũ hợp lệ |
| Quá 200 bài | `MAX_CATALOG_TRACKS = 200` | Ném lỗi từ chối toàn bộ payload (`exceeds maximum allowed track count (200)`), giữ cache cũ |
| Chuỗi / URL quá dài | `MAX_TRACK_STRING_LENGTH = 200`, `MAX_TRACK_URL_LENGTH = 500`, `MAX_TRACK_DURATION_SEC = 86400` | Bỏ qua bài vi phạm & tăng `skippedCount` (không hiển thị, không phát) |
| `id` sai định dạng `^[a-z0-9-]+$` hoặc trùng | `VALID_TRACK_ID_REGEX = /^[a-z0-9-]+$/` + `seenIds` `Set<string>` | Bỏ qua bài sai định dạng / trùng lặp & tăng `skippedCount` |
| Giấy phép ngoài danh sách cho phép | `ALLOWED_REMOTE_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']` | Bỏ qua (ví dụ `CC-BY-NC-4.0`, `All Rights Reserved`) & tăng `skippedCount` |
| Bài thiếu `title` / `artist` / `license` / `licenseUrl` / `sourceUrl` | `validateRemoteTrackObject` kiểm tra string non-empty bắt buộc cả 5 trường | Bỏ qua (không đưa vào `tracks`) & tăng `skippedCount` + `catalogSkippedCount` |
| `licenseUrl` / `sourceUrl` không phải HTTPS | `isValidHttpsUrl`: parse `new URL(url)` bắt buộc `protocol === 'https:'` | Bỏ qua bài (chặn `http://`, `javascript:`, `data:`) & tăng `skippedCount` |
| `file` chứa `..`, `/` hoặc `\` | `isSafeRemoteTrackFilename`: từ chối `'..'`, `'/'`, `'\\'`, `':'`, `'?'`, `'#'`, bắt buộc đuôi `.mp3` | Bỏ qua bài & tăng `skippedCount` |
| JSON hỏng / HTTP lỗi / Offline | `fetchRemoteMusicCatalog` bọc `response.json()` trong `try/catch` ném `'Malformed JSON in remote music catalog.'`; `MusicCoordinator.ensureCatalogLoaded` kiểm tra `cached.schemaVersion === 1` | Giữ nguyên bản cache cũ hợp lệ và bài đang phát/tạm dừng |
| Bài đang chọn biến mất khỏi catalog mới | `MusicCoordinator.refreshCatalog` + `extensionClient.ts` phát hiện `!catalog.some(t => t.id === prevTrackId)` | Chuyển sạch về bài đầu tiên (`catalog[0]`, `positionSec: 0`); nếu đang `PLAYING` thì phát ngay bài mới trong Offscreen, nếu đang `PAUSED` thì đóng Offscreen cũ |

### 3.2. Danh sách các test catalog & coordinator
- **Các test đã có từ LOFI-1:**
  - `MusicCatalog: online endpoints and remote catalog schema parsing work cleanly for SPDX tracks`
  - `MusicCatalog: validates online stream files/URLs and rejects local asset paths or unsafe schemes`
  - `MusicCatalog: enforces attribution for SPDX CC-BY-4.0 / CC-BY-SA-3.0 while exempting CC0-1.0`
  - `MusicCatalog: dynamically supports arbitrary N tracks, cache TTL checks, and remote fetch`
  - `MusicCatalog: public/ contains zero local audio files and zero public/assets/aistudio directory`
  - `MusicCoordinator: dynamic online catalog cache TTL (6h), new-track auto-discovery, and offline fallback`
- **Các test MỚI BỔ SUNG ở LOFI-1b:**
  - `MusicCatalog: rejects untrusted catalog envelopes (schemaVersion != 1, > 200 tracks, malformed JSON)`
  - `MusicCatalog: skips and counts malformed, duplicate, overlong, unsafe-path, non-HTTPS, and disallowed-license tracks` (kiểm chứng đủ 14 trường hợp xấu gồm `CC-BY-NC-4.0`, thiếu từng trường bắt buộc, `http://`, `javascript:`, `../`, `/`, `\`, quá 200 ký tự, trùng `id`, sai regex `id`)
  - `MusicCoordinator: preserves cache on malformed JSON / invalid schema, handles disappeared track, and supports offline first-open Retry`

---

## 4. Trải nghiệm Lần đầu mở khi Mất mạng & Chưa có Cache

- **Backend (`src/background/musicCoordinator.ts`) & Web Preview (`src/ui/services/extensionClient.ts`):**
  - Khi chưa có cache và fetch thất bại, `ensureInitialized()` / `getState()` / `refreshCatalog()` / `playTrack()` thiết lập trạng thái sạch `{ status: 'ERROR', currentTrackId: null, positionSec: 0, durationSec: null, lastErrorCode: 'network', lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.' }` — **không crash, không treo vô hạn**.
  - Khi người dùng có mạng trở lại và bấm Thử lại (`refreshCatalog(true)`), catalog được tải về, cache được lưu và `status` tự khôi phục từ `'ERROR'`/`'network'` về `'IDLE'`.
- **UI & Song ngữ (`src/ui/components/MusicPlayerSheet.tsx`, `src/i18n/locales/{en,vi}.ts`):**
  - Khi `catalog.length === 0`, khối `data-testid="music-empty-catalog"` hiển thị tiêu đề/mô tả mất mạng rõ ràng (cả EN và VI: `"Không thể tải danh sách nhạc Lofi trực tuyến. Hãy kiểm tra kết nối mạng và bấm Thử lại."`), hộp lỗi `data-testid="music-player-error"`, và nút **`Retry`** / **`Thử lại`** (`data-testid="music-retry-catalog-btn"`) có chống double-click `isRefreshing`.
  - Đã xác minh trong `__tests__/ui/musicPlayerSheet.test.ts` (`MusicPlayerSheet UI: handles empty catalog, dynamic extra tracks, and bilingual playback errors cleanly` kiểm tra cả EN và VI).

---

## 5. CÁC MỤC BỔ SUNG (5a – 5g)

### 5(a). Diff `public/manifest.json` & Xác nhận `host_permissions`
- **Các trường đã thay đổi từ trước LOFI-1 → sau LOFI-1b:**
  - `minimum_chrome_version`: `"102"` *(tiền LOFI)* → `"109"` *(LOFI-1)* → **`"116"`** *(LOFI-1b)*
  - `permissions`: thêm **`"offscreen"`** → `["storage", "alarms", "notifications", "declarativeNetRequest", "offscreen"]`
  - `content_security_policy`: **Không thay đổi / không khai báo thêm** (dùng CSP mặc định nghiêm ngặt MV3: không inline script, không eval).
  - `host_permissions`: Giữ nguyên `["http://*/*", "https://*/*"]` đã có sẵn từ Phase 3 cho `declarativeNetRequest` redirect.
- **Xác nhận dứt khoát:** **KHÔNG thêm bất kỳ `host_permissions` mới nào cho LOFI-1 / LOFI-1b.**

### 5(b). Nơi Fetch Catalog & Phân tích CORS đối với `github.io`
- **Nơi fetch thực tế:**
  - **Trong Chrome Extension (thật):** Catalog `tracks.json` được fetch từ **Background Service Worker** bên trong `MusicCoordinator.ensureCatalogLoaded()` (`src/background/musicCoordinator.ts`). Popup UI **không** trực tiếp gọi `fetch(LOFI_CATALOG_URL)` mà chỉ gửi message `MUSIC_GET_CATALOG` / `MUSIC_REFRESH_CATALOG` sang Service Worker.
  - **Trong Web Preview (ngoài Chrome Extension):** `src/ui/services/extensionClient.ts` tự mô phỏng nên fetch trực tiếp từ tab trình duyệt để dev preview hoạt động.
- **Nhận định CORS với `github.io`:**
  - GitHub Pages (`https://khangbui2010.github.io`) mặc định trả header `Access-Control-Allow-Origin: *` cho các tệp tĩnh (`GET`/`HEAD` đối với `.json` và `.mp3`). Hơn nữa extension MV3 vốn đã khai báo `"https://*/*"` trong `host_permissions`, nên `fetch(LOFI_CATALOG_URL)` từ Service Worker và thẻ `<audio src="https://...mp3">` (chỉ đọc audio, không dùng `crossOrigin="anonymous"` Web Audio analyzer) đều được phép chạy chuẩn.
  - **Ghi chú trung thực về phạm vi kiểm chứng:** Do môi trường hiện tại chạy trên container Linux + Node.js (`MockOffscreenAdapter` & mock `FetchLike`), **việc fetch live tới `https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json` và stream MP3 thật từ `github.io` trong Chrome Extension thật CHƯA được chạy kiểm chứng trực tiếp**; cần nghiệm thu trên Chrome thật ở mục 5(g).

### 5(c). Dung lượng các Bundle trước LOFI-1 → sau LOFI-1 → sau LOFI-1b
| Artifact (`dist/`) | Trước LOFI-1 | Sau LOFI-1 (trước 1b) | Sau LOFI-1b (Hiện tại) | Ghi chú |
|---|---|---|---|---|
| `dist/background.js` | `78.13 kB` *(mốc user cung cấp; bản đóng gói MP3 cũ là `95.90 kB`)* | `86.69 kB` (`86,691 B`) | **`87.89 kB` (`87,897 B`, gzip `18.89 kB`)** | Sạch React/DOM; tăng nhẹ `+1.2 kB` do logic hardening & hook sync ngoài mutex |
| `dist/offscreen.js` | *(không có/2.82 kB bản tiền LOFI-1)* | `3.87 kB` (`3,878 B`) | **`3.87 kB` (`3,878 B`, gzip `1.48 kB`)** | Entrypoint Offscreen thuần DOM `<audio>` |
| `dist/offscreen.html` | `209 B` *(bản cũ)* | `264 B` | **`264 B`** | 0 inline script, tĩnh `<audio id="lofi-audio">` |
| `dist/assets/popup-*.js` | `734.00 kB` *(bản 16/11)* | — | **`740.83 kB` (gzip `196.01 kB`)** | Đã bỏ mọi MP3 cục bộ; thêm Retry/Empty UI |
| `dist/assets/popup-*.css` | `82.07 kB` *(bản 16/11)* | — | **`82.14 kB` (gzip `12.99 kB`)** | Tailwind CSS 4 |
| Tổng `dist/` | `~55.8 MB` *(lúc còn 10 MP3)* | `1,038,979 B` | **`1,047,462 B` (`~1.05 MB`)** | **`0` file audio** trong `public/` & `dist/` |

### 5(d). Xác nhận DNR Blocking không chặn `tracks.json` và luồng MP3 khi Allowlist rỗng
- Kiểm tra trực tiếp `src/background/blockingCoordinator.ts`: mọi rule của `chrome.declarativeNetRequest.updateDynamicRules` đều chỉ đặt:
  - `condition: { urlFilter: '|http*', resourceTypes: ['main_frame'], excludedRequestDomains: ... }`
  - Khi `allowedDomains` rỗng (`[]`), `excludedRequestDomains` là `undefined`, nên **chỉ điều hướng `main_frame` của tab trình duyệt** bị `redirect` về `/blocked.html`.
- `fetch(LOFI_CATALOG_URL)` từ Background Service Worker thuộc `xmlhttprequest` trong ngữ cảnh extension (`chrome-extension://*`), và `<audio src="...">` trong Offscreen Document thuộc `media` trong ngữ cảnh extension (`chrome-extension://*`). Cả hai đều không có `resourceType === 'main_frame'` nên **không bao giờ bị DNR chặn** kể cả khi Allowlist rỗng hoàn toàn và phiên đang `RUNNING`.

### 5(e). Tài liệu Kiến trúc & Trạng thái Dự án
- Đã cập nhật `/PROJECT_STATUS.md`: ghi rõ Milestone LOFI (`LOFI-1` + `LOFI-1b`) là nhánh riêng **KHÔNG thuộc Phase 5 / 5B.5**, cập nhật số liệu build (`87.89 kB` `background.js`, `1,047,462 B` tổng `dist/`, `0` file audio) và bộ test **`520/520 PASS`**.
- Đã cập nhật `/ARCHITECTURE.md` (v1.5.0): cập nhật `minimum_chrome_version: "116"`, 4 entrypoints Vite, biện minh `"offscreen"` + zero new `host_permissions`, giao thức SW ↔ Offscreen `target`, cơ chế khôi phục 30s `AUDIO_PLAYBACK`, hardening catalog, DNR `main_frame` non-interference, và **lưu ý quyền riêng tư** về việc lộ IP / `User-Agent` tới GitHub Pages (`khangbui2010.github.io`) khi tải `tracks.json` / stream MP3.

### 5(f). Sao lưu Báo cáo cũ
- Bản sao y nguyên báo cáo LOFI-1 trước bổ sung 1b đã được lưu tại `/respond_lofi1_prev.md`.

### 5(g). Phạm vi Xác minh & Danh sách Kiểm thử Thủ công trên Chrome Desktop (>= 116)
- **Tuyên bố trung thực về giới hạn môi trường hiện tại:** Toàn bộ 520 bài test tự động vừa chạy trên **Node.js** sử dụng `MemoryStorageAdapter`, `MockOffscreenAdapter`, `MockDNRAdapter` / `MockTabsAdapter`, `MockAlarmsAdapter` / `MockNotificationsAdapter`, mock `FetchLike` và **React SSR (`renderToString`)**. Hiện **chưa chạy extension thật trên Chrome Desktop** nên chưa quan sát trực tiếp HTTP request thật tới `github.io`, `chrome.offscreen.createDocument`, hành vi đóng Offscreen Document sau đúng 30s pause thực của Chromium hay phát loa thật.
- **Danh sách kiểm thử thủ công bắt buộc khi Load unpacked `dist/` trên Chrome >= 116 (`chrome://extensions` → Developer mode → Load unpacked → chọn thư mục `dist/`):**
  1. **Mở Player & Tải Catalog Lần Đầu:** Mở Popup → bấm nút nốt nhạc ở Header → kiểm tra danh sách 11 bài từ `tracks.json` (có badge `CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-3.0`, link tác giả/giấy phép HTTPS) và bấm Play 1 bài.
  2. **Phát Nhạc Xuyên Popup:** Khi nhạc đang phát, bấm ra ngoài để **đóng hẳn Popup** → xác nhận nhạc vẫn tiếp tục phát mượt; mở lại Popup sau 10–15 giây → xác nhận thanh tiến độ (`positionSec`) cập nhật khớp với thời gian đã trôi qua.
  3. **Kiểm tra Mốc 30 giây Tự Đóng của Chrome (`chrome://inspect/#pages` / Extensions Service Worker):** Bấm Pause nhạc → chờ **> 35 giây** để Chrome tự đóng `offscreen.html` → bấm Resume → xác nhận nhạc tự phát tiếp từ đúng giây đã Pause (không nhảy về `0:00`, không dùng silent audio hack).
  4. **Đồng bộ Phiên Focus (Pause / Resume / Give Up / Complete):** Bật nhạc → Start Focus Countdown → bấm Pause Focus (nhạc tự Pause) → bấm Resume Focus (nhạc tự phát lại từ đúng giây) → Give Up hoặc Complete Countdown với `"Stop music when focus session ends"` BẬT (nhạc STOP hẳn) và thử lại khi TẮT (nhạc tiếp tục phát).
  5. **Kiểm tra Pause Thủ Công & Pomodoro Break:** Start Pomodoro → tự bấm Pause nhạc → bấm Pause rồi Resume Focus (nhạc **vẫn phải Pause**, không tự bật lại); bật nhạc lại → chờ tới Break với `"Keep playing music during Pomodoro breaks"` TẮT (nhạc Pause khi vào Break) → gạt toggle Break ON ngay lúc Break (nhạc phát lại ngay) → bấm Skip Break (về Focus nhạc vẫn phát).
  6. **Chặn Web (Allowlist rỗng) & Nhạc Online:** Để Active Profile với `Allowed Domains` **trống hoàn toàn (`[]`)** → Start Focus Countdown → thử mở `https://youtube.com` trong tab mới (bị redirect sang `/blocked.html`) → mở Popup kiểm tra nhạc online và Refresh Catalog vẫn tải và phát bình thường.
  7. **Cache & Mất Mạng (Offline Fallback):** Sau khi đã tải catalog xong, tắt Wi-Fi / Offline trên máy (hoặc DevTools Offline cho Profile) → reload extension / chờ > 6h giả lập → mở Music Player vẫn xem được catalog từ cache cũ không lỗi; thử thêm bài mới rồi bật mạng bấm `Refresh` (`Làm mới`) để xác nhận thấy bài mới ngay.
  8. **Lần Đầu Mở Khi Mất Mạng & Chưa Có Cache:** Cài/Reset Extension Storage sạch (`chrome.storage.local.clear()`) khi máy đang Offline hoàn toàn → mở Music Player → xác nhận **không trắng/không crash**, hiện thông báo lỗi mạng rõ ràng (cả EN & VI) và nút `Retry` / `Thử lại`; bật mạng lại rồi bấm `Retry` → tải danh sách bài thành công.

---

## 6. KẾT QUẢ KIỂM ĐỊNH SAU CÙNG (SAU LOFI-1b)

- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errors, `0` warnings)
- `npm run clean && npm run build`: **PASS** (`686ms`, Vite `v8.3.8`, `1,736 modules`, tổng `dist/` = **`1,047,462 B`**, `0` file audio)
- `npm test` — chạy **3 lần liên tiếp**:
  - **Lần 1:** **520 / 520 tests PASS** (`0` fail, `0` skipped — `12,404.37 ms` / `12.40s`)
  - **Lần 2:** **520 / 520 tests PASS** (`0` fail, `0` skipped — `11,150.23 ms` / `11.15s`)
  - **Lần 3:** **520 / 520 tests PASS** (`0` fail, `0` skipped — `13,138.87 ms` / `13.14s`)
