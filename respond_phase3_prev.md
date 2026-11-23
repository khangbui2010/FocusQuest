# BÁO CÁO NGHIỆM THU — MILESTONE LOFI / GIAI ĐOẠN LOFI-2

**Giai đoạn:** Milestone LOFI — Giai đoạn LOFI-2 *(mini-player chỉ hiện khi đang trong phiên tập trung, playlist trong bảng mở rộng, đổi quy tắc phát/dừng nhạc, dọn Header & nền trời sáng cho cảnh tập trung; KHÔNG thuộc Phase 5 hay Milestone 5B.5)*  
**Ngày hoàn thành:** 2026-11-17  
**File sao lưu báo cáo cũ:** `/respond_lofi2_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`530 / 530` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. PHẠM VI TUÂN THỦ ("KHÔNG LÀM")

- **Không sửa `offscreen`, catalog loader/cache hay nguồn nhạc:** Giữ nguyên hoàn toàn `src/offscreen/*`, `public/offscreen.html`, `src/data/musicCatalog.ts` và các URL archive HTTPS. Không thêm thư viện npm mới và không đóng gói file âm thanh cục bộ (`0` file audio trong `public/` & `dist/`).
- **Không đổi lõi game/kinh tế/schema/blocking:** Giữ nguyên `RewardEngine`, toàn bộ công thức kinh tế/CoinBonus/Multiplier, `CURRENT_SCHEMA_VERSION`, logic chặn web/allowlist (`BlockingCoordinator`, `dnrAdapter`, `ProfileManager`), và không tái cấu trúc `SessionCoordinator` (chỉ giữ nguyên điểm gọi hook đồng bộ để dừng nhạc khi phiên kết thúc).

---

## 2. CHI TIẾT CÁC HẠNG MỤC ĐÃ TRIỂN KHAI (A–G)

### A. Quy tắc hiển thị chỉ trong phiên tập trung (`App.tsx`, `MusicPlayerSheet.tsx`)
- Trong `PopupShell` (`src/App.tsx`): mini-player và bảng mở rộng chỉ render khi `showMusicPlayer` đúng, tức phiên đang ở trạng thái **`RUNNING` hoặc `PAUSED`** (bao gồm focus, `SHORT_BREAK`, `LONG_BREAK`) và `effectiveTab === 'focus'`.
- **Không render** khi ở ngoài phiên (`session === null` hoặc `status === 'IDLE'`), **không render** ở các tab khác, và **không render** trên màn hình kết quả sau khi phiên đã kết thúc (`COMPLETED`, `ABANDONED`, `INTERRUPTED` chờ bấm `Exit`).
- Do thanh tab `<Navbar>` đã bị ẩn hoàn toàn trong phiên (UX-1), mini-player nằm sát đáy màn tập trung (`hasBottomNav={false}`, backdrop dùng `pb-0`).

### B. Đổi quy tắc phát / dừng nhạc (`music.ts`, `messages.ts`, `storageSchema.ts`, `musicCoordinator.ts`, `messageHandler.ts`, `background/index.ts`, `extensionClient.ts`, `MusicPlayerSheet.tsx`)
- **Pause phiên, Resume, nghỉ ngắn, nghỉ dài không tác động lên nhạc:** `deriveMusicIntent(snapshot: SessionSnapshot | null)` rút gọn chỉ còn `'keep' | 'stop'`: trả về `'keep'` cho mọi phiên `'RUNNING'` hoặc `'PAUSED'` (kể cả `SHORT_BREAK` / `LONG_BREAK`). Nhạc đang phát tiếp tục phát, nhạc đang tạm dừng thủ công giữ nguyên tạm dừng.
- **Dừng hẳn khi phiên kết thúc hoặc phát hiện phát mồ côi:** Khi phiên kết thúc vì bất cứ lý do gì (`COMPLETED`, `ABANDONED`, `INTERRUPTED`, `RESET_SESSION`, extension disable, browser startup downtime hoặc recovery không còn phiên đang chạy), hoặc khi `MUSIC_GET_STATE` / sự kiện từ offscreen phát hiện nhạc đang phát mà không có phiên hoạt động (`intent === 'stop'`), `MusicCoordinator` thực hiện `stopInternal()`: chuyển trạng thái về `'STOPPED'`, đóng Offscreen Document, đưa `positionSec` về `0`, đồng thời **giữ nguyên** `currentTrackId`, `volume`, `muted`, `shuffle`, `repeatMode`.
- **Không tự động phát khi bắt đầu phiên:** `START_SESSION` giữ nguyên trạng thái nhạc hiện tại (`IDLE`/`STOPPED`/`PAUSED`), chỉ người dùng tự bấm phát mới phát.
- **Gỡ bỏ tùy chọn & thông điệp cũ + tương thích ngược storage:** Xóa 2 checkbox `"Stop music when focus session ends"` / `"Keep playing music during Pomodoro breaks"` trong `MusicPlayerSheet.tsx`, xóa `MUSIC_SET_SYNC_WITH_SESSION` & `MUSIC_SET_PLAY_DURING_BREAK` (`messages.ts`, `MessageHandler`), xóa `stopMusicOnSessionEnd` & `musicPlayDuringBreak` (`UserSettings`), và xóa `pausedBySession` (`MusicPlayerState`). Khi đọc dữ liệu storage cũ còn chứa các trường này, `normalizeStateAgainstCatalog()` dựng lại state tường minh nên bỏ qua an toàn mà không crash hay cần migration.

### C. Thanh Mini-Player (`MusicPlayerSheet.tsx`)
- Thanh cao `56px` (`h-[56px]`) gắn đường tiến độ mảnh `3px` (`h-[3px]`) ở mép trên; gồm ảnh bìa nhỏ có icon nhạc, tên bài (truncate ellipsis), `tác giả · album`, nút Bài trước, Play/Pause (`40×40px`), Bài tiếp và Chevron-Up mở rộng (tất cả nút đều là `<button type="button">` thật vùng bấm tối thiểu `36×36px` kèm `aria-label` song ngữ).
- Khi catalog rỗng hoặc lỗi mạng lúc mở đầu: hiển thị hàng gọn `"Chưa tải được nhạc"` / `"Music not loaded yet"` kèm nút `Thử lại` / `Retry`. Mọi thao tác trên UI chỉ gửi command tới background, không tự phát `<audio>`.

### D. Bảng mở rộng Bottom Sheet (`MusicPlayerSheet.tsx`, `UserSettings.musicPlayerExpanded`)
- Bấm Chevron-Up mở bottom sheet (`h-[416px] max-h-[72%]`, `rounded-t-[22px]`, nền `bg-slate-950`, backdrop mờ `bg-black/55 backdrop-blur-xs`). Đóng bằng Chevron-Down, bấm nền ngoài hoặc phím `Esc`. Trạng thái mở/đóng được lưu bền vững ở `UserSettings.musicPlayerExpanded` qua `SET_MUSIC_PLAYER_EXPANDED` (không đổi `schemaVersion`).
- Đầy đủ khối `Now Playing` (`56px` cover), thanh tua, cụm Play `52px` / Prev / Next / Stop / Shuffle / Repeat, thanh âm lượng + Mute, dải chip lọc tác giả động (`"Tất cả · N"` + theo từng nghệ sĩ), danh sách bài cuộn dòng `min-h-[46px]` có equalizer khi đang phát + badge ngắn `CC0`/`BY`/`BY-SA` (không sửa dữ liệu SPDX gốc trong catalog), và footer `"Ghi công & giấy phép"` đóng mặc định để mở xem chi tiết bản quyền từng bài.

### E. Dọn Header (`Header.tsx`)
- Không còn nút mở trình phát nhạc (`♪` / `music-player-open-btn`) trên Header; giữ nguyên Brand về trang chủ, Era badge rút gọn (`header.eraShort.*`) chống chồng lấp ở chiều rộng `400px` cả EN & VI, Coins, `Lv. X`, nút `?`, nút `EN|VI`, thanh XP mảnh và huy hiệu khiên khi chạy phiên.

### F. Trời sáng cho cảnh tập trung (`FocusSceneArea.tsx`)
- Loại bỏ hoàn toàn nền trời tối và sao đêm (`fq-scene-star`); cả 3 trạng thái đều dùng trời sáng/hoàng hôn:
  - `working`: nền trời xanh ban ngày `#6ec1f0 → #a9dcf9 → #d4f0ff` kèm mặt trời vàng & mây trắng trôi.
  - `paused`: nền sáng xám xanh dịu `#cbd5e1 → #dbe4ee → #edf2f7`.
  - `resting`: nền hoàng hôn pastel `#fed7aa → #fbcfe8 → #e9d5ff` với ánh nắng chiều ấm.
- Hai chip góc trên (`focus-scene-status-chip` & `chime-toggle-btn`) dùng scrim tối `bg-slate-900/75 text-white border-white/25` bảo đảm độ tương phản rõ trên nền sáng.

### G. Đồng bộ song ngữ EN / VI (`src/i18n/locales/{en,vi}.ts`, `src/i18n/errorTranslator.ts`)
- Xóa các khóa/mapping lỗi thừa (`music.syncWithSessionLabel`, `music.playDuringBreakLabel`, lỗi của 2 action đã xóa); bảo đảm 100% key parity giữa `EN_MESSAGES` và `VI_MESSAGES`.

---

## 3. CÁC TEST ĐÃ CẬP NHẬT & LÝ DO

1. **`__tests__/background/musicCoordinator.test.ts`:**
   - Cập nhật bảng chân lý `deriveMusicIntent(snapshot)` sang chữ ký 1 tham số `'keep' | 'stop'`.
   - Thay thế các test đồng bộ pause/break cũ sang quy tắc LOFI-2: Pause/Resume/Break không tự dừng hay tự phát lại nhạc; `START_SESSION` không tự động phát; mọi nhánh kết thúc phiên (`completeCountdown`, `finishStopwatch`, `giveUpCountdown`, Pomodoro completion, `handleExtensionDisabledRecovery`, browser startup downtime, `resetSession`, `SERVICE_WORKER_WAKE`, `MUSIC_GET_STATE` khi không còn phiên) đều dừng nhạc và giữ lại track/âm lượng/shuffle/repeat; từ chối 2 action cũ; bỏ qua an toàn các key cũ trong storage (`syncWithSession`, `playDuringBreak`, `pausedBySession`, `stopMusicOnSessionEnd`, `musicPlayDuringBreak`).
2. **`__tests__/ui/lofi2MusicUi.test.ts`:**
   - Gỡ các trường/prop cũ (`syncWithSession`, `playDuringBreak`, `pausedBySession`, `onToggleSyncWithSession`, `onTogglePlayDuringBreak`).
   - Cập nhật assertion của `<App />`: ẩn hoàn toàn `music-mini-player` khi rảnh hoặc ở màn kết quả `COMPLETED`, chỉ render ở đáy màn Tập trung khi `RUNNING`/`PAUSED`, và xác nhận 2 toggle cũ không xuất hiện trong sheet.
3. **`__tests__/ui/musicPlayerSheet.test.ts`:**
   - Gỡ các trường/prop cũ và đổi assertion kiểm tra `music-play-during-break-toggle` / `"Tiếp tục phát nhạc trong giờ nghỉ Pomodoro"` thành kiểm tra vắng mặt hoàn toàn.
4. **`__tests__/ui/navigationRedesign.test.ts` (dòng 44) & `__tests__/ui/extensionPopupShell.test.ts` (dòng 39):**
   - Đổi assertion trên `<App />` mặc định ở tab Bản đồ từ `assert.ok(html.includes('data-testid="music-mini-player"'))` sang `assert.ok(!html.includes('data-testid="music-mini-player"'))` để khớp quy tắc A của LOFI-2.
5. **`__tests__/ui/ux1SessionNavigationAndProfile.test.ts`:**
   - Gỡ trường/prop nhạc cũ trong helper `makePopupShellProps`, và tách assertion `music-mini-player` / `music-sheet-backdrop`: chỉ hiện (với `pb-0`) ở `RUNNING`/`PAUSED`/`SHORT_BREAK`/`LONG_BREAK`, không hiện ở màn kết quả (`COMPLETED`/`ABANDONED`/`INTERRUPTED`) hay ngoài phiên (`null`/`IDLE`).

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,737 modules transformed`, `1.02s`):
  - `dist/background.js`: **`87.76 kB`** (gzip: `18.93 kB`) — `0` kết quả `react-dom` trong bundle nền.
  - `dist/assets/popup-DR3j5Xqm.js`: **`750.99 kB`** (gzip: `198.04 kB`)
  - `dist/assets/popup-DgGRUQxi.css`: **`86.84 kB`** (gzip: `13.62 kB`)
  - `dist/assets/translator-CBOM9ACM.js`: **`51.07 kB`** (gzip: `13.74 kB`)
  - `dist/assets/domainNormalizer-LjAHelB6.js`: **`48.55 kB`** (gzip: `13.17 kB`)
  - `dist/assets/storageKeys-BmLuJ1Do.js`: **`0.37 kB`** (gzip: `0.26 kB`)
  - `dist/offscreen.js`: **`3.87 kB`** (gzip: `1.48 kB`)
  - `dist/blocked.js`: **`1.32 kB`** (gzip: `0.60 kB`)
  - `dist/index.html`: **`0.71 kB`** | `dist/blocked.html`: **`1.81 kB`** | `dist/offscreen.html`: **`0.26 kB`**
  - Tổng dung lượng `dist/`: **`1,061,849 B`**; số file âm thanh (`.mp3/.ogg/.wav/.m4a/.flac`) trong `public/` & `dist/`: **`0`**.
- **`npm test` — chạy 3 lần liên tiếp:**
  - **Lần 1:** **530 / 530 tests PASS** (`0` fail, `0` skipped, `0` cancelled — `17,886.16 ms`, `EXIT=0`)
  - **Lần 2:** **530 / 530 tests PASS** (`0` fail, `0` skipped, `0` cancelled — `17,995.11 ms`, `EXIT=0`)
  - **Lần 3:** **530 / 530 tests PASS** (`0` fail, `0` skipped, `0` cancelled — `20,333.90 ms`, `EXIT=0`)

---

## 5. GIỚI HẠN KIỂM CHỨNG & 9 BƯỚC TỰ KIỂM TRA TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Toàn bộ UI test được chạy bằng **React SSR (`renderToString`)** trên Node.js và backend test dùng mock Chrome adapters; tôi **chưa mở trực tiếp trên trình duyệt Chrome thật** để xem giao diện `400×600px`, nghe âm thanh stream qua Offscreen Document, hoặc kiểm tra tương tác chuột/phím thật.
- **9 bước tự kiểm đề xuất trên Chrome (>= 116, `chrome://extensions` → Developer mode → Load unpacked `dist/`):**
  1. **Ngoài phiên & các tab khác:** Mở popup ở trạng thái rảnh (tab `Bản đồ`, `Nhiệm vụ`, `Thành tựu`, `Thống kê` và màn chuẩn bị `Tập trung`) — xác nhận **không có mini-player** ở đáy và **không có nút `♪`** trên Header; kiểm tra Header ở cả EN & VI không bị đè chữ.
  2. **Bắt đầu phiên (không tự phát nhạc):** Bắt đầu một phiên Focus — xác nhận thanh tab dưới cùng biến mất và thanh **mini-player `56px`** xuất hiện sát đáy màn tập trung, hiển thị đúng tên bài mặc định nhưng **không tự phát nhạc**.
  3. **Trời sáng `FocusSceneArea`:** Quan sát khung cảnh trại Thời đại Đồ Đá ở trạng thái đang chạy (`working`), `Pause` (`paused`), và Pomodoro nghỉ (`resting`) — xác nhận nền trời sáng ban ngày / hoàng hôn pastel không có trời tối hay sao đêm, và 2 chip góc trên đọc rõ nét.
  4. **Phát nhạc, mở/đóng bảng playlist (`rounded-t-[22px]`):** Bấm Play rồi bấm chevron-up trên mini-player — xác nhận sheet tối trượt lên từ đáy trên nền mờ, thử lọc chip tác giả, chọn bài khác, tua thanh tiến độ, chỉnh âm lượng/mute, shuffle/repeat, mở `"Ghi công & giấy phép"`, rồi đóng sheet bằng chevron-down / click nền ngoài / phím `Esc`. Đóng và mở lại popup để xác nhận nhớ trạng thái mở/đóng và bài/âm lượng đã chọn.
  5. **Pause phiên & Resume phiên:** Đang phát nhạc, bấm `Pause` phiên rồi `Resume` — xác nhận nhạc **vẫn tiếp tục phát bình thường**; sau đó thử tự bấm Pause trên trình phát nhạc rồi mới Pause/Resume phiên — xác nhận nhạc **giữ nguyên tạm dừng**, không tự phát lại.
  6. **Pomodoro nghỉ ngắn / nghỉ dài:** Chạy Pomodoro sang pha `SHORT_BREAK` / `LONG_BREAK` — xác nhận thanh mini-player vẫn hiện ở đáy và nhạc đang phát/tạm dừng **giữ nguyên trạng thái**, không còn checkbox `"Keep playing music..."` hay `"Stop music when focus session ends"` trong sheet.
  7. **Kết thúc phiên & màn kết quả (`Exit`):** Chờ phiên hoàn thành hoặc bấm `Give Up` — xác nhận nhạc **dừng hẳn tức thì** (hết tiếng phát nền ở Chrome Task Manager), đồng thời trên màn kết quả có nút `Exit` thì mini-player **cũng biến mất**. Bấm `Exit` để về Bản đồ.
  8. **Bắt đầu phiên mới nhớ tùy chọn:** Mở phiên tập trung thứ hai — xác nhận nhạc vẫn giữ đúng bài/âm lượng/shuffle/repeat trước đó, `positionSec` đã reset về `0`, và không tự phát cho tới khi tự bấm Play.
  9. **Kiểm tra offline / lỗi tải catalog:** Tạm ngắt mạng (hoặc chặn request archive trong DevTools) khi cache trống rồi mở phiên — xác nhận mini-player hiển thị gọn `"Chưa tải được nhạc"` kèm nút `Thử lại`; bật lại mạng rồi bấm `Thử lại` để xác nhận tải lại danh sách thành công.
