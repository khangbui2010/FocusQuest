# BÁO CÁO NGHIỆM THU — MILESTONE LOFI / GIAI ĐOẠN LOFI-2

**Giai đoạn:** Milestone LOFI — Giai đoạn LOFI-2 *(giao diện & dữ liệu hiển thị trình phát nhạc + trời sáng cho cảnh tập trung; KHÔNG thuộc Phase 5 / Milestone 5B.5)*  
**Ngày hoàn thành:** 2026-11-17  
**File sao lưu báo cáo cũ:** `/respond_lofi2_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`527 / 527` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. PHẠM VI TUÂN THỦ ("KHÔNG LÀM")

- **Không sửa lõi phát nhạc & sync (`LOFI-1`):** Giữ nguyên hoàn toàn `MusicCoordinator` (`src/background/musicCoordinator.ts`), `src/offscreen/offscreen.ts`, `public/offscreen.html`, cơ chế tải/kiểm tra/cache `tracks.json` (`src/data/musicCatalog.ts`), và toàn bộ giao thức `MUSIC_*`.
- **Không chạm hệ thống phiên & kinh tế:** Giữ nguyên hoàn toàn `SessionCoordinator`, `RewardEngine`, công thức Coin/XP/Multiplier/CoinBonus, schema civilization/quest (`CURRENT_SCHEMA_VERSION` không đổi).
- **Không cài thêm thư viện npm mới và không thêm file audio cục bộ** (`0` file `.mp3/.ogg/.wav/.m4a/.flac` trong `public/` & `dist/`).

---

## 2. CHI TIẾT CÁC HẠNG MỤC ĐÃ TRIỂN KHAI

### 2.1. Mini-Player luôn hiện (`56px`) ngay trên `<Navbar>` trên mọi tab (`MusicPlayerSheet.tsx` & `App.tsx`)
- Hợp nhất thành **một component duy nhất** (`MusicPlayerSheet`) đặt ngay phía trên `<Navbar>` trong `App.tsx`, hiển thị ổn định trên tất cả 5 tab (`Nhiệm vụ`, `Tập trung`, `Bản đồ`, `Thành tựu`, `Thống kê`), tuyệt đối không tạo hai trình phát trùng lặp.
- **Nội dung mini-player (`data-testid="music-mini-player"`, cao `56px`):**
  - Đường tiến độ mảnh **`3px`** ở mép trên (`data-testid="music-mini-progress-track"` / `"music-mini-progress"`) theo tỷ lệ `positionSec / durationSec`. Bổ sung polling mỗi `1s` trong `App.tsx` bất cứ khi nào `musicState.status === 'PLAYING'` (kể cả khi trình phát đang thu gọn).
  - Ảnh bìa vuông bo góc chứa icon đĩa/nốt nhạc, tên bài (`truncate`), `tác giả · album` (`truncate`).
  - 4 `<button>` thật có `aria-label` song ngữ EN/VI và vùng chạm chuẩn tối thiểu **`36px`** (nút Play/Pause **`40px`**): Bài trước (`music-mini-prev-btn`), Play/Pause (`music-mini-play-pause-btn`), Bài kế tiếp (`music-mini-next-btn`), và Chevron-up (`music-mini-expand-btn`).
  - **Trạng thái rỗng / lỗi mạng:** Giữ nguyên thanh `56px` một hàng gọn hiển thị `"Chưa tải được nhạc"` / `"Music not loaded yet"` (`music-mini-empty-label`) kèm nút `Thử lại` / `Retry` (`music-mini-retry-btn`, `min-h-[36px]`) — không tự biến mất.
  - Mini-player và sheet chỉ gửi lệnh message lên Service Worker như cũ (UI không tự phát `<audio>`).

### 2.2. Bảng mở rộng Bottom Sheet (`~2/3` chiều cao popup) & Lưu trạng thái Mở/Thu
- Bấm chevron-up sẽ trượt lên sheet (`h-[416px] max-h-[72%]`, ngay trên thanh tab nhờ `pb-[64px]`), bo góc trên `22px` (`rounded-t-[22px]`), nền tối `bg-slate-950`, lớp nền phía sau làm tối & mờ (`bg-black/55 backdrop-blur-xs`).
- Thu gọn bằng nút chevron-down (`music-sheet-close-btn`), bấm vào backdrop, hoặc nhấn phím **`Escape`**.
- **Lưu trạng thái mở/thu (`UserSettings.musicPlayerExpanded?: boolean`, mặc định `false`):**
  - Thêm trường optional `musicPlayerExpanded?: boolean` vào `UserSettings` (`src/types/storageSchema.ts`), không đổi `schemaVersion`.
  - Thêm message `SET_MUSIC_PLAYER_EXPANDED` (`src/types/messages.ts`), xử lý tại `MessageHandler` (`src/background/messageHandler.ts`) và bộ mô phỏng Web Preview `extensionClient.ts`.
- **Bố cục từ trên xuống trong sheet:**
  - **a.** Tiêu đề `"Nhạc Lofi tập trung"` / `"Focus Lofi Music"` + nút `Refresh` (`music-refresh-catalog-btn`) + Chevron-down (`music-sheet-close-btn`).
  - **b.** Khối `Đang phát` / `Now Playing`: ảnh bìa vuông **`56px`** (`w-14 h-14`), tên bài, `tác giả · album`.
  - **c.** Thanh tua (`music-seek-slider`) + thời gian hiện tại/tổng dạng `tabular-nums`.
  - **d.** Bộ nút điều khiển: Shuffle, Bài trước, nút Play/Pause tròn lớn **`52px`** (`w-[52px] h-[52px]`), Bài kế tiếp, Repeat (`off`/`all`/`one`), Stop, kèm 2 ô tùy chọn đồng bộ phiên (`Stop music when focus session ends`, `Keep playing music during Pomodoro breaks`).
  - **e.** Hàng âm lượng: nút Tắt/Bật tiếng, thanh kéo volume, chỉ số `%`.
  - **f.** Thanh chip lọc tác giả cuộn ngang (`music-artist-filters`), **sinh động 100%** từ `catalog`: `"Tất cả · N"` (`"All · N"`) và từng tác giả duy nhất `"<Tác giả> · K"` (`aria-pressed` nổi bật chip đang chọn; tự quay về `"Tất cả"` nếu tác giả biến mất sau khi refresh catalog).
  - **g.** Danh sách bài cuộn dọc (`flex-1 min-h-0 overflow-y-auto`, mỗi hàng `min-h-[46px]`): hiển thị số thứ tự hoặc equalizer 3 vạch (`music-playing-equalizer`, `fq-music-eq-bar` tôn trọng `prefers-reduced-motion`) khi bài đang phát, tên bài, `tác giả · album`, badge giấy phép ngắn gọn (`CC0` / `BY` / `BY-SA` qua `formatShortLicenseBadge(track.license)` — chỉ rút gọn lúc hiển thị, giữ nguyên chuỗi SPDX gốc trong catalog), thời lượng; bấm để phát bài đó.
  - **h.** Footer sheet: nút `"Ghi công & giấy phép"` / `"License & Attribution"` (`music-credits-toggle-btn`) bật/tắt bảng thông tin đầy đủ License & Attribution của bài đang phát (hiển thị nguyên SPDX `entry.license`, `attribution`, `creator`, trạng thái chỉnh sửa, liên kết HTTPS `sourceUrl` & `licenseUrl`).

### 2.3. Dọn `Header.tsx` & Chống chồng lấp ở chiều rộng `400px`
- Gỡ bỏ hoàn toàn nút nốt nhạc `♪` (`music-player-open-btn`, `onOpenMusic`, `isMusicPlaying`) khỏi `Header.tsx` và `App.tsx`.
- Sửa tràn/chồng lấp giữa `"FOCUS QUEST"` và badge Thời đại ở chiều rộng `400px` cả EN lẫn VI: sử dụng nhóm trái `flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden`, rút gọn nhãn chip thời đại (`header.eraShort.*`, ví dụ `'Đồ Đá'`, `'Đồ Đồng'`, đồng thời giữ tên đầy đủ trong `title`), và giữ nguyên toàn bộ Coins, `Lv. X`, nút `?`, công tắc `EN|VI`, và khiên profile khi phiên chạy.

### 2.4. Trời sáng cho cảnh tập trung (`FocusSceneArea.tsx` & `src/index.css`)
- Gỡ bỏ hoàn toàn gradient trời đêm (`dark:from-slate-900`, `dark:via-slate-800`, `dark:via-indigo-950/70`) và sao đêm (`fq-scene-star`) trên cả 3 trạng thái:
  - **Đang tập trung (`working`):** Trời xanh sáng (`#6ec1f0` → `#a9dcf9` → `#d4f0ff`), mặt trời vàng rực (`#fde047` + hào quang `#fef9c3`), mây trắng trôi (`fq-scene-cloud`), đồi cỏ xanh tươi (`#86efac` / `#34d399`).
  - **Tạm dừng (`paused`):** Trời xám xanh nhạt u ám dịu (`#cbd5e1` → `#dbe4ee` → `#edf2f7`), mây đứng yên, đồi xanh dịu, nhân vật đứng tĩnh.
  - **Nghỉ (`resting`):** Hoàng hôn pastel dịu sáng (`#fed7aa` cam đào → `#fbcfe8` hồng → `#e9d5ff` tím nhạt, **không tối**), mặt trời hoàng hôn ấm, mây nhẹ, nhấp nháy lửa ấm và `zZ`.
- Nâng tương phản cho `focus-scene-status-chip` (`"ĐANG TẬP TRUNG"` / `"FOCUSING"`) và nút chuông `chime-toggle-btn` bằng nền scrim tối trong mờ `bg-slate-900/75 text-white border-white/25` để đọc rõ trên nền trời sáng ở mọi chế độ hệ điều hành.

### 2.5. Song ngữ 100% EN / VI (`src/i18n/locales/{en,vi}.ts`)
- Bổ sung đầy đủ các khóa dịch mới (`header.eraShort.*`, `music.lofiSheetTitle`, `music.miniNotLoaded`, `music.expandAria`, `music.collapseAria`, `music.miniPlayerAria`, `music.nowPlayingLabel`, `music.filterAll`, `music.filterArtistAria`, `music.playingEqualizerAria`, `music.creditsFooterBtn`) và đảm bảo parity 100% giữa `EN_MESSAGES` và `VI_MESSAGES`.

---

## 3. CÁC TEST CŨ ĐÃ CẬP NHẬT & LÝ DO

1. **`__tests__/ui/focusSceneArea.test.ts` (dòng 78–80, 142, 159):**
   - *Lý do:* Trước LOFI-2 trạng thái `resting` dùng lớp `fq-scene-star` (sao đêm) và nền `dark:from-slate-900`. Nay LOFI-2 chuyển sang hoàng hôn sáng pastel không có sao đêm và thay `.fq-scene-star` bằng `.fq-music-eq-bar` trong `prefers-reduced-motion`. Test được cập nhật để kiểm tra chắc chắn `resting` dùng mây dịu (`fq-scene-cloud`), không còn `fq-scene-star` hay `dark:from-slate-900`, và `.fq-music-eq-bar` được vô hiệu hóa trong `prefers-reduced-motion`.
2. **`__tests__/ui/musicPlayerSheet.test.ts` (dòng 81–145):**
   - *Lý do:* Sheet LOFI-2 đổi tiêu đề thành `"Nhạc Lofi tập trung"` / `"Focus Lofi Music"`, dùng props `isExpanded`/`onToggleExpand`, đồng thời đưa bảng `License & Attribution` vào sau nút footer `"Ghi công & giấy phép"` (mặc định đóng). Helper `renderSheet` được cập nhật để truyền `isExpanded: true`, `defaultCreditsOpen: true` cho các case kiểm tra bảng ghi công và xác nhận mini-player cùng nút footer mới.
3. **`__tests__/ui/navigationRedesign.test.ts` (dòng 44–45, 172–173):**
   - *Lý do:* Xác nhận Header không còn `music-player-open-btn`, nhãn chip Era tiếng Việt rút gọn thành `'Đồ Đá'` (giữ `'Thời đại Đồ Đá'` trong `title`), và `App` luôn render `music-mini-player` ngay trên thanh tab dưới cùng.
4. **`__tests__/ui/extensionPopupShell.test.ts` (dòng 39–40):**
   - *Lý do:* Xác nhận popup Extension thật luôn có `music-mini-player` và không còn nút nhạc ở Header.
5. **Bộ test mới bổ sung (`__tests__/ui/lofi2MusicUi.test.ts`):**
   - Kiểm tra 7 kịch bản toàn diện: mini-player `56px` + progress `3px` + nút thật `>=36px`/`40px` + không trùng trình phát; trạng thái rỗng/mất mạng hiện `"Chưa tải được nhạc"` / `"Music not loaded yet"` + nút Retry; Bottom Sheet `rounded-t-[22px]` + `56px` cover + `52px` play + chip tác giả động + equalizer + badge ngắn `CC0`/`BY`/`BY-SA` giữ nguyên SPDX + footer toggle; Header chống chồng lấp ở `400px` EN/VI; `FocusSceneArea` trời sáng 3 trạng thái + scrim tương phản; persistence `SET_MUSIC_PLAYER_EXPANDED` trên cả `MessageHandler` lẫn simulator `extensionClient.ts`; và parity 100% EN/VI.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors, `0` warnings).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,736 modules transformed`, `731ms`):
  - `dist/background.js`: **`88.18 kB`** (gzip: `18.93 kB`)
  - `dist/assets/popup-*.js`: **`750.76 kB`** (gzip: `197.72 kB`)
  - `dist/assets/popup-*.css`: **`84.85 kB`** (gzip: `13.48 kB`)
  - `dist/offscreen.js`: **`3.87 kB`** (gzip: `1.48 kB`)
  - `dist/blocked.js`: **`1.32 kB`** (gzip: `0.60 kB`)
  - Tổng dung lượng `dist/`: **`1,062,023 B`**, tổng số file audio trong `public/` & `dist/`: **`0`**.
- **`npm test` — chạy 3 lần liên tiếp:**
  - **Lần 1:** **527 / 527 tests PASS** (`0` fail, `0` skipped — `13.91s` / `13,914.88 ms`)
  - **Lần 2:** **527 / 527 tests PASS** (`0` fail, `0` skipped — `13.94s` / `13,941.44 ms`)
  - **Lần 3:** **527 / 527 tests PASS** (`0` fail, `0` skipped — `14.19s` / `14,188.88 ms`)

---

## 5. PHẠM VI KIỂM CHỨNG & DANH SÁCH KIỂM THỬ THỦ CÔNG TRÊN CHROME (>= 116)

- **Tuyên bố trung thực:** Mọi bài test UI chạy qua **React SSR (`renderToString`)** trên Node.js và backend chạy bằng mock Chrome adapters / `MemoryStorageAdapter`. Các hành vi tương tác trình duyệt thực tế (animation, thanh cuộn ngang/dọc, click ngoài để thu sheet, phím `Esc`, bố cục pixel `400×600px`, phát nhạc thật qua Offscreen trên Chrome >= 116) **chưa được kiểm tra trực quan bằng mắt trên Chrome thật**.
- **7 bước kiểm thử thủ công đề xuất khi Load unpacked `dist/` (`chrome://extensions`):**
  1. **Mini-player xuyên suốt 5 tab:** Chuyển qua lại cả 5 tab (`Nhiệm vụ`, `Tập trung`, `Bản đồ`, `Thành tựu`, `Thống kê`), xác nhận thanh mini-player `56px` luôn nằm ngay trên thanh tab, không biến mất và Header không còn nút `♪`.
  2. **Kiểm tra nút điều khiển & thanh progress `3px`:** Bấm Play/Pause, Next/Previous trên mini-player; xác nhận nhạc phát qua Offscreen, đường progress `3px` mép trên chạy đều theo thời gian kể cả khi không mở sheet.
  3. **Mở/Thu sheet & lưu trạng thái:** Bấm chevron-up để mở sheet `~2/3` chiều cao, kiểm tra bo góc `22px` và nền mờ phía sau; đóng popup rồi mở lại xác nhận sheet vẫn giữ đúng trạng thái mở; thử thu lại bằng 3 cách (chevron-down, bấm vùng mờ ngoài sheet, nhấn phím `Esc`).
  4. **Lọc tác giả động & Equalizer & License:** Chọn từng chip tác giả (`Tất cả · N`, `Purrple Cat · ...`, `HoliznaCC0 · ...`), kiểm tra danh sách lọc đúng và cuộn dọc mượt; phát 1 bài để xem equalizer chạy và bấm `"Ghi công & giấy phép"` ở footer để xem thông tin SPDX đầy đủ.
  5. **Kiểm tra Header & Cảnh trời sáng `400×600`:** Đổi ngôn ngữ `EN | VI`, kiểm tra `"FOCUS QUEST"` và chip `"Đồ Đá"` không chồng lấp; bắt đầu một phiên Focus → chuyển qua Pause → Break (Pomodoro) để xác nhận cả 3 trạng thái đều giữ nền trời sáng/hoàng hôn dịu và chip `"ĐANG TẬP TRUNG"` đọc rõ nét.
  6. **Kiểm tra vừa khít `400×600px` không cắt nút:** Mở cả trạng thái Timer đang chạy (có mini-player ở dưới) và Map có toolbar Expand/Build để chắc chắn không bị khuất nút `Pause`/`Give Up`/`Skip Break`.
  7. **Mất mạng khi chưa có cache:** Xóa storage extension rồi tắt mạng và mở popup, kiểm tra mini-player vẫn hiển thị gọn `"Chưa tải được nhạc"` + nút `Thử lại`, sau đó bật mạng bấm `Thử lại` để tải bài thành công.
