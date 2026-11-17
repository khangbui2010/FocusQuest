# BÁO CÁO NGHIỆM THU — MILESTONE LOFI / GIAI ĐOẠN LOFI-1

**Giai đoạn:** Milestone LOFI — Giai đoạn LOFI-1 (Nhạc nền chạy qua Offscreen Document, nguồn nhạc online động, đồng bộ Pause/Resume/Break/Session End)  
**Ngày hoàn thành:** 2026-11-17  
**Trạng thái:** Đã hoàn tất kiểm định — **DỪNG chờ duyệt trước khi sang giai đoạn tiếp theo**

---

## 0. BƯỚC 0 — KIỂM TRA HIỆN TRẠNG (TRƯỚC KHI THAY ĐỔI)

### 0.1. Âm thanh đang phát bằng gì, ở đâu & đóng popup có tắt không?
- **Nơi phát nhạc nền:** `public/offscreen.html` kết hợp `src/offscreen/offscreen.ts` dùng thẻ HTML `<audio>` thuần (không dùng `AudioContext` cho nhạc nền) chạy bên trong **Chrome MV3 Offscreen Document** tạo qua `chrome.offscreen.createDocument` (`reasons: ['AUDIO_PLAYBACK']`).
- **Khi đóng popup:** Nhạc **tiếp tục phát** trong Offscreen Document vì Service Worker + Offscreen Document sống độc lập với popup DOM. Tuy nhiên kiến trúc tiền LOFI-1 đang nạp file từ `chrome.runtime.getURL('assets/music/...')`, dùng giao thức `scope: 'FQ_OFFSCREEN_MUSIC'` (`LOAD_AND_PLAY`, `PAUSE`, `RESUME`, `GET_AUDIO_STATUS`), chưa xử lý đồng bộ Pause/Resume/Break từ `SessionCoordinator`, và phụ thuộc danh sách hard-code cục bộ.
- **Các nguồn âm thanh khác trong repo (giữ nguyên ngoài phạm vi LOFI-1):**
  - `src/ui/services/soundEffects.ts`: phát chuông chuyển pha Pomodoro (`AudioContext` + `OscillatorNode`, không phải nhạc nền).
  - `src/ui/services/extensionClient.ts`: giả lập `HTMLAudioElement` cho chế độ **Web Preview** (khi chạy ngoài Chrome Extension).

### 0.2. Vị trí file audio trong repo & dung lượng `dist/`
- **File audio trong repo:** Theo xác nhận ở Đính chính, toàn bộ file audio cục bộ đã được xóa khỏi repo trước khi triển khai LOFI-1 (`0` file `.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac` trong `public/` hay toàn bộ repo; tổng dung lượng audio đóng gói = `0 B`).
- **Dung lượng build `dist/` sau LOFI-1 (`npm run clean && npm run build`):**
  - Tổng dung lượng toàn thư mục `dist/`: **`1,038,979 bytes`** (`~1,021 KiB`)
  - `dist/offscreen.html`: **`264 bytes`**
  - `dist/offscreen.js`: **`3,878 bytes`** (`3.87 kB`)
  - `dist/background.js`: **`86,691 bytes`** (`86.69 kB`)

### 0.3. Catalog cũ hard-code ở đâu & hiển thị bản quyền ra sao?
- **Vị trí hard-code trước LOFI-1:** Mảng `MUSIC_CATALOG: readonly MusicTrack[]` (11 bài) trong `src/data/musicCatalog.ts`, trỏ tới `file: 'assets/music/...'`.
- **Hiển thị nhãn giấy phép:**
  - `src/data/musicCatalog.ts` khai báo `'CC BY'`, `'CC0'`, `'CC BY-SA'`.
  - `src/ui/components/MusicPlayerSheet.tsx` hiển thị mục **License & Attribution** (`Bản quyền & Ghi công`): tên giấy phép, tên tác giả (`creator`), trạng thái chỉnh sửa (`Modified` / `Unmodified original`), link `Artist Site` (`sourceUrl`), link `License Terms` (`licenseUrl`), và huy hiệu `Attribution Required` khi `isAttributionRequired(license) === true` (bật cho `CC BY*`, tắt cho `CC0*`).

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
- Khi `Pause` kéo dài và Chrome tự đóng Offscreen Document sau 30 giây, lần `Resume` hoặc `Sync` tiếp theo trong `MusicCoordinator` sẽ kiểm tra `hasDocument()`, tự gọi `ensureDocument()`, gửi `MUSIC_PLAY` với `startAtSec = positionSec` đã lưu; `offscreen.ts` giữ `pendingStartAtSec` và tự tua ngay tại sự kiện `loadedmetadata` sau `audio.load()`.

### 1.3. `src/background/musicCoordinator.ts` & `src/chrome/offscreenAdapter.ts`
- **Single-flight Offscreen Guard:** `ChromeOffscreenAdapter` là nơi duy nhất gọi `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })` và `chrome.offscreen.createDocument`, dùng `creatingPromise` chống tạo trùng 2 document khi gọi đồng thời.
- **Catalog online động & Cache TTL 6 giờ (`src/data/musicCatalog.ts`, `src/storage/`):**
  - Đọc động từ `LOFI_CATALOG_URL` và dựng URL phát nhạc HTTPS từ `LOFI_BASE_URL` (không hard-code danh sách bài hay số lượng bài).
  - Cache vào `STORAGE_KEYS.MUSIC_CATALOG_CACHE` (`fq_music_catalog_cache`) với TTL **6 giờ**; khi mạng lỗi vẫn fallback về cache cũ thay vì crash; hỗ trợ `MUSIC_REFRESH_CATALOG` để người dùng làm mới thủ công.
- **Đồng bộ Phiên Tập trung (`deriveMusicIntent` & `SessionCoordinator`):**
  - Pure helper `deriveMusicIntent(snapshot, settings)` xác định ý định `'play' | 'pause' | 'stop'` theo trạng thái phiên (`RUNNING`, `PAUSED`, `SHORT_BREAK` / `LONG_BREAK`, terminal `COMPLETED`/`ABANDONED`/`INTERRUPTED`), kết hợp `musicEnabled`, `playDuringBreak` (`UserSettings.musicPlayDuringBreak` / `MUSIC_SET_PLAY_DURING_BREAK`), và `stopMusicOnSessionEnd`.
  - `SessionCoordinator` bổ sung tham số tùy chọn thứ 9 `onSessionSyncHook` gọi khi Start, Pause, Resume, chuyển pha Pomodoro, Startup/Recovery (tách biệt với đọc storage không khóa mutex, cô lập lỗi 2 chiều).
  - Tôn trọng Pause thủ công của người dùng: nếu người dùng tự bấm Pause nhạc trước khi phiên Pause, khi Resume phiên hệ thống không tự ép nhạc phát lại.

### 1.4. Giao diện & Song ngữ EN/VI (`MusicPlayerSheet.tsx`, `App.tsx`, `extensionClient.ts`, `en.ts`, `vi.ts`, `errorTranslator.ts`)
- Giữ nguyên toàn bộ bố cục & tính năng của trình phát, gỡ bỏ hoàn toàn `MUSIC_CATALOG` hard-code.
- Thêm toggle `Keep playing music during Pomodoro breaks` / `Tiếp tục phát nhạc trong giờ nghỉ Pomodoro` (`data-testid="music-play-during-break-toggle"`) và nút `Refresh` / `Làm mới` (`data-testid="music-refresh-catalog-btn"`).
- Hỗ trợ dịch lỗi `'autoplay_blocked'`, `'network'`, `'decode'`, `'unknown'` và thông báo lỗi tải catalog sang tiếng Việt qua `localizeErrorMessage`.

---

## 2. PHẦN ĐÍNH CHÍNH ĐÃ THỰC HIỆN & XÁC MINH

Thực hiện đầy đủ theo yêu cầu Đính chính (không sang giai đoạn mới):

1. **Không giữ / không tạo file audio hay thư mục tạm:**
   - Không tạo `_music_source/`, không tạo file âm thanh giả/placeholder.
   - Đã quét xác minh đệ quy: `public/` và `dist/` chứa **`0` file audio** (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`), thư mục `public/assets/music/` và `dist/assets/music/` đều không tồn tại.
2. **Gỡ bỏ mọi tham chiếu tới thư viện nhạc cục bộ:**
   - Gỡ `MUSIC_CATALOG`, `isBundledMp3Path`, `resolveTrackAssetUrl`, mọi đường dẫn `assets/music/...`, và chuỗi UI `"Bundled offline MP3 library"` / `"Thư viện MP3 tích hợp sẵn (Offline)"`.
   - Đổi phụ đề UI thành `"Streamed Lofi library"` (`en`) và `"Thư viện nhạc Lofi trực tuyến"` (`vi`).
3. **Danh sách từng file test đã cập nhật / bổ sung & lý do:**
   - `__tests__/core/musicCatalog.test.ts`: Gỡ kiểm thử `MUSIC_CATALOG`, `isBundledMp3Path`, `resolveTrackAssetUrl`, và kiểm thử file MP3 trong `public/assets/music/`. Thay bằng kiểm thử `parseRemoteCatalog` (11 bài chuẩn SPDX), `resolveTrackStreamUrl`, `isValidStreamFileOrUrl` (chặn `assets/music/`, `http://`, `data:`, `../`), `isAttributionRequired` cho `CC-BY-4.0`/`CC-BY-SA-3.0`/`CC0-1.0`, `isCatalogCacheFresh` (TTL 6h), `fetchRemoteMusicCatalog`, và xác nhận `public/` không chứa file audio.
   - `__tests__/integration/musicPackaging.test.ts`: Gỡ vòng lặp kiểm tra từng file MP3 trong `public/` & `dist/`. Giữ kiểm tra `dist/manifest.json` (`offscreen`, Chrome >= 109), `dist/offscreen.html` (static `<audio>`, `./offscreen.js`, 0 inline script), `dist/offscreen.js`, `dist/background.js` sạch `react-dom`. **Bổ sung test mới** quét đệ quy cả `public/` và `dist/` khẳng định **0** file audio (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`).
   - `__tests__/background/musicCoordinator.test.ts`: Gỡ `MUSIC_CATALOG` và giao thức cũ `LOAD_AND_PLAY`/`OFFSCREEN_*`; viết lại theo giao thức `target: 'offscreen' | 'background'` (`MUSIC_PLAY`, `MUSIC_PAUSE`, `MUSIC_STOP`, `MUSIC_SEEK`, `MUSIC_SET_VOLUME`, `MUSIC_GET_STATUS`, `MUSIC_POSITION`, `MUSIC_ENDED`, `MUSIC_ERROR`). Bổ sung kiểm thử cho `deriveMusicIntent`, đồng bộ Pause/Resume qua mốc Offscreen 30s, tôn trọng Pause thủ công, Pomodoro Break + `setPlayDuringBreak`, cache TTL 6h + tự phát hiện bài mới + fallback offline, single-flight `chrome.runtime.getContexts`, và controller `offscreen.ts`.
   - `__tests__/ui/musicPlayerSheet.test.ts`: Gỡ `MUSIC_CATALOG`; dùng fixture SPDX từ `parseRemoteCatalog`; kiểm tra `"Streamed Lofi library"` / `"Thư viện nhạc Lofi trực tuyến"` (không còn `"Bundled offline MP3 library"`), `Tracks (N)`, empty state mới, nút Refresh, toggle Break, song ngữ lỗi `autoplay_blocked`/`network`, và xác nhận zero upload UI.
   - `__tests__/background/sessionNotifications.test.ts`: Gỡ import `MUSIC_CATALOG`, thay bằng fixture 2 bài tại chỗ và cập nhật `StubOffscreen` dùng `MUSIC_PLAY` / `MUSIC_STOP`.
4. **Cập nhật `CREDITS.md` và `README.md`:**
   - Tạo `/CREDITS.md` ở gốc repo: bỏ khẳng định nhạc nằm trong `public/assets/music/`, ghi rõ nguồn online (`FocusQuest-LOFI-archive/tracks/` và `tracks.json`) làm nguồn dữ liệu động, giữ nguyên đầy đủ tên bài, tác giả, `sourceUrl`, `license` (`CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-3.0`), `licenseUrl`, và trạng thái `modified`.
   - Cập nhật liên kết trong `/README.md` trỏ tới `./CREDITS.md`.

---

## 3. RANH GIỚI KHÔNG THAY ĐỔI

- **Không sửa** Reward Engine, công thức tính Coin/XP, hệ số multiplier, schema Economy (`CURRENT_SCHEMA_VERSION = 2`), Civilization/Quest schema, hay bất kỳ kết quả thưởng nào của các phiên tập trung.
- **Không đụng** vào các mục chưa hoàn tất của Milestone 5B.5 hay giai đoạn LOFI-2.

---

## 4. KẾT QUẢ KIỂM ĐỊNH SAU ĐÍNH CHÍNH

- `npm run lint` (`tsc --noEmit`): **PASS** (`0` lỗi)
- `npm run clean && npm run build`: **PASS** (`573ms`, tổng `dist/` = `1,038,979 B`, `0` file audio)
- `npm test` — chạy **3 lần liên tiếp**:
  - **Lần 1:** **515 / 515 tests PASS** (`0` fail, `0` skipped — `15.72s`)
  - **Lần 2:** **515 / 515 tests PASS** (`0` fail, `0` skipped — `11.23s`)
  - **Lần 3:** **515 / 515 tests PASS** (`0` fail, `0` skipped — `11.81s`)
