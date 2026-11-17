# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-1

**Giai đoạn:** Milestone UX — Giai đoạn UX-1 *(điều hướng trong phiên, mở lại popup giữa phiên, nút `Exit`/`Thoát` ở màn kết quả & chọn hồ sơ một chạm; KHÔNG thuộc Phase 5 / Milestone 5B.5 / Milestone LOFI)*  
**Ngày hoàn thành:** 2026-11-17  
**File sao lưu báo cáo cũ:** `/respond_ux1_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`531 / 531` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. PHẠM VI TUÂN THỦ ("KHÔNG LÀM")

- **Không sửa logic lõi ngoài UI/điều hướng:** Giữ nguyên hoàn toàn `RewardEngine`, kinh tế Coins/XP/Multiplier/CoinBonus, storage schema (`CURRENT_SCHEMA_VERSION`), logic chặn web/allowlist (`BlockingCoordinator`, `dnrAdapter`, `ProfileManager`), `SessionCoordinator` (bao gồm `resetSession()`), `MusicCoordinator` và `offscreen`.
- Chỉ cập nhật tầng giao diện, điều hướng popup, helper UI, bộ từ điển song ngữ EN/VI, bộ kiểm thử UI và tài liệu báo cáo/trạng thái.

---

## 2. CHI TIẾT CÁC HẠNG MỤC ĐÃ TRIỂN KHAI

### 2.1. Định nghĩa "Ở trong phiên tập trung" thuần từ snapshot background (`src/ui/utils/sessionNavigation.ts`)
- Triển khai `isInFocusSession(session?: SessionSnapshot | null): boolean` suy ra **trực tiếp từ snapshot phiên do background trả về** (không dùng state giao diện cục bộ): trả về `true` cho mọi phiên khác `'IDLE'`, gồm `'RUNNING'` (focus, `SHORT_BREAK`, `LONG_BREAK`), `'PAUSED'`, và các phiên kết thúc `'COMPLETED'` / `'ABANDONED'` / `'INTERRUPTED'` nhưng người dùng **chưa bấm Exit** (`currentSession !== null`).
- Triển khai `resolveEffectiveTab(requestedTab, session)` buộc trả về `'focus'` khi `isInFocusSession(session)` đúng, bất kể tab được yêu cầu hay modal/sheet đang mở.

### 2.2. Ẩn hoàn toàn thanh tab dưới cùng trong phiên & tận dụng chiều cao (`App.tsx`, `MusicPlayerSheet.tsx`, `TimerView.tsx`)
- Trong `PopupShell` (`src/App.tsx`): khi `isInFocusSession(session)` là `true`, `<Navbar>` **không được render vào DOM** (`{!inFocusSession && <Navbar ... />}` — không phải ẩn bằng CSS), tab hiệu lực khóa cứng về `'focus'`, và tắt nút quay về Bản đồ trên `<Header>` (`onNavigateHome={inFocusSession ? undefined : ...}`).
- Giải phóng `64px` chiều cao cho khung cảnh / timer: `MusicPlayerSheet` nhận `hasBottomNav={!inFocusSession}` (dùng `pb-0` thay vì `pb-[64px]` khi sheet mở rộng trong phiên); màn kết quả `STATE 1` và màn chạy `STATE 2` trong `TimerView.tsx` dùng `min-h-0 overflow-y-auto` để không cắt đồng hồ hay nút ở kích thước popup `400×600px`.
- Khi ở ngoài phiên (`session === null` hoặc `status === 'IDLE'`), `<Navbar>` và đủ 5 tab hiển thị bình thường như cũ.

### 2.3. Mở lại extension giữa phiên hoặc khi phiên đã xong lúc popup đóng (`src/App.tsx`)
- Bổ sung cờ `hasResolvedInitialSession` (trên trình duyệt thực `typeof document !== 'undefined'`, khởi tạo `false` trừ khi test truyền `initialSession`). Khi popup vừa khởi động, `App` chờ kết quả `GET_SESSION_STATE` đầu tiên rồi mới render `PopupShell` và đồng bộ `if (isInFocusSession(nextSession)) setActiveTab('focus')`.
- Nhờ cơ chế đồng bộ trực tiếp từ snapshot background (`SessionCoordinator.getFullState()` + `reconcileActiveSession`), cả trường hợp phiên còn chạy/nghỉ/tạm dừng lẫn trường hợp phiên đã `COMPLETED` / `ABANDONED` / `INTERRUPTED` khi popup đóng đều mở thẳng vào màn Tập trung hoặc màn kết quả có nút `Exit` mà không nháy qua tab Bản đồ mặc định.

### 2.4. Nút `Exit` / `Thoát` thay thế `"Start New Session"` (`TimerView.tsx`, `App.tsx`, `sessionNavigation.ts`, `en.ts`, `vi.ts`, `errorTranslator.ts`)
- Trên **mọi** màn hình kết thúc (`COMPLETED` Countdown/Stopwatch/Pomodoro, Give Up `ABANDONED`, `INTERRUPTED`), thay hoàn toàn `"Start New Session"` / `"Bắt đầu Phiên Mới"` bằng **`Exit`** (`vi`: **`Thoát`**, `data-testid="outcome-exit-btn"`), hỗ trợ hiển thị đầy đủ trạng thái `INTERRUPTED` (kèm `lastKnownValidFocusMinutes` và mô tả `endedInterruptedDesc`).
- Bấm `Exit`: chạy qua `executeExitSessionAction` và `handleResetSession` với cơ chế **chống bấm đôi** (`exitingRef` + `isResettingRef`), gọi nguyên trạng `RESET_SESSION` (`SessionCoordinator.resetSession()` không sửa đổi), làm mới snapshot rồi mới chuyển sang tab `'map'` (nơi thanh tab hiện lại bình thường).
- Nếu `RESET_SESSION` thất bại: giữ nguyên người dùng ở màn kết quả (không điều hướng), hiển thị thông báo lỗi gọn song ngữ (`data-testid="outcome-exit-error"`, `role="alert"`, dịch qua `localizeErrorMessage`), và mở khóa lại nút `Exit` để thử lại được.

### 2.5. Chọn hồ sơ một chạm trong `ProfileBottomSheet.tsx`
- **Gỡ bỏ hoàn toàn nút `"Use"` / `"Dùng"`** (`profiles.useBtn`).
- Chuyển vùng chọn hồ sơ thành một **`<button type="button">` độc lập** (`data-testid="switch-profile-${profile.id}"`) có `aria-label` song ngữ (`"Select profile {name}"` / `"Chọn hồ sơ {name}"`), `aria-pressed={isActive}`, hỗ trợ phím `Enter` và `Space` tự nhiên; hồ sơ đang dùng giữ nguyên chấm xanh `bg-emerald-500`, nhãn `"Active"` / `"Đang dùng"` và viền nổi bật.
- Đặt hai nút **Sửa tên** (`rename-profile-${id}`) và **Xóa** (`delete-profile-${id}`) làm các `<button>` anh em nằm ngoài nút chọn (tuyệt đối không lồng `<button>` trong `<button>`), mỗi nút có khung bo góc `36×36px` (`w-9 h-9 rounded-[10px] border`), gọi `e.stopPropagation()` để bấm chúng không kích hoạt chọn hồ sơ.
- Giữ nguyên mọi ràng buộc hiện tại (khóa cứng khi `isSessionActive` kèm banner `profile-sheet-lock-banner`, không xóa hồ sơ cuối cùng, xác nhận xóa 2 bước), đồng thời cập nhật dòng mẹo `profiles.subdomainTip` không còn nhắc tới nút Dùng/Use.

### 2.6. Đồng bộ i18n EN / VI (`src/i18n/locales/{en,vi}.ts` & `src/i18n/errorTranslator.ts`)
- Xóa sạch hai khóa cũ `timer.outcome.startNewSession` và `profiles.useBtn` (bảo đảm 0 chuỗi `"Start New Session"` / `"Bắt đầu Phiên Mới"` còn sót trong toàn codebase).
- Thêm mới `profiles.selectAria`, `timer.outcome.endedInterruptedDesc`, `timer.outcome.exitSession`, `timer.outcome.exitFailed`, cập nhật `profiles.subdomainTip` và bản dịch lỗi thoát phiên trong `errorTranslator.ts`. Kiểm tra parity 100% giữa `EN_MESSAGES` và `VI_MESSAGES`.

---

## 3. TEST MỚI & TEST CŨ ĐÃ SỬA

- **Test mới bổ sung (`__tests__/ui/ux1SessionNavigationAndProfile.test.ts` — 6 test cases):**
  1. `isInFocusSession` & `resolveEffectiveTab`: kiểm tra ngoài phiên (`null`, `'IDLE'`) và mọi trạng thái trong phiên (`RUNNING`, `PAUSED`, `SHORT_BREAK`, `LONG_BREAK`, `COMPLETED`, `ABANDONED`, `INTERRUPTED`).
  2. `PopupShell` SSR trong phiên: xác nhận không có `bottom-navbar` trong DOM, khóa sang Tập trung kể cả khi mở sheet/modal/nhạc, và `MusicPlayerSheet` chuyển sang `pb-0`.
  3. `PopupShell` SSR ngoài phiên: xác nhận thanh tab hiển thị lại bình thường và điều hướng Bản đồ hoạt động.
  4. Khởi động `App` với snapshot đang trong phiên (đang chạy / `COMPLETED` / `INTERRUPTED` khi popup đóng): vào thẳng giao diện tập trung / màn kết quả với nút `Exit`/`Thoát` mà không qua Bản đồ.
  5. Nút `Exit`/`Thoát` trên mọi trạng thái kết thúc EN/VI + parity từ điển không còn `"Start New Session"` / `"Bắt đầu Phiên Mới"` + luồng `executeExitSessionAction` thành công/thất bại (không điều hướng khi lỗi, hiển thị lỗi tiếng Việt, nút Exit vẫn bấm lại được).
  6. Chọn hồ sơ một chạm (bỏ nút `Use`/`Dùng`, kiểm tra không lồng `<button>`, `aria-label` song ngữ, nút Sửa/Xóa `w-9 h-9 rounded-[10px] border`, khóa trong phiên, cập nhật mẹo, và luồng message backend `SWITCH_PROFILE` bị chặn khi có phiên + `RESET_SESSION` trả phiên về rảnh).
- **Test cũ buộc sửa (1 file duy nhất):**
  - **`__tests__/ui/startFocusView.test.ts` (dòng 146–148):**
    - *Lý do:* Test 5b cũ kiểm tra `assert.ok(completedHtml.includes('Start New Session'))` trên màn kết quả hoàn thành Countdown. Theo yêu cầu UX-1, nút này được đổi thành `Exit` (`data-testid="outcome-exit-btn"`). Đã cập nhật để kiểm tra có `data-testid="outcome-exit-btn"`, có `>Exit<`, và không còn `'Start New Session'`.
  - Tất cả test cũ còn lại (bao gồm `profileBottomSheet.test.ts`, `navigationRedesign.test.ts`, `extensionPopupShell.test.ts`, `focusRunningView.test.ts`, `spriteRegistry.test.ts`, v.v.) **đều PASS nguyên bản**.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors, `0` warnings).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,737 modules transformed`, `1.06s`):
  - `dist/background.js`: **`88.18 kB`** (gzip: `18.93 kB`)
  - `dist/assets/popup-*.js`: **`753.86 kB`** (gzip: `198.52 kB`)
  - `dist/assets/popup-*.css`: **`86.90 kB`** (gzip: `13.63 kB`)
  - `dist/offscreen.js`: **`3.87 kB`** (gzip: `1.48 kB`)
  - `dist/blocked.js`: **`1.32 kB`** (gzip: `0.60 kB`)
  - Tổng dung lượng `dist/`: **`1,067,773 B`**.
- **`npm test` — chạy 3 lần liên tiếp:**
  - **Lần 1:** **531 / 531 tests PASS** (`0` fail, `0` skipped — `22,006.19 ms`, `EXIT=0`)
  - **Lần 2:** **531 / 531 tests PASS** (`0` fail, `0` skipped — `21,487.36 ms`, `EXIT=0`)
  - **Lần 3:** **531 / 531 tests PASS** (`0` fail, `0` skipped — `22,985.47 ms`, `EXIT=0`)

---

## 5. GIỚI HẠN KIỂM CHỨNG & CÁC BƯỚC TỰ KIỂM TRA TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Tôi **chưa xem trực tiếp bằng mắt trên Chrome thật**. Toàn bộ test UI chạy bằng **React SSR (`renderToString`)** trên Node.js và phần background dùng mock Chrome adapters; cảm giác cuộn trong popup `400×600px`, thao tác chuột/bàn phím thật và vòng đời đóng/mở popup của Chrome cần được bạn tự kiểm khi Load unpacked thư mục `dist/`.
- **6 bước tự kiểm đề xuất trên Chrome:**
  1. **Bắt đầu phiên:** Chọn chế độ Focus và bấm Start — xác nhận thanh tab dưới cùng biến mất hoàn toàn và không còn bấm sang Bản đồ/tab khác được; khung cảnh & đồng hồ hiển thị thoáng, không bị cắt ở `400×600px`.
  2. **Pause, nghỉ ngắn/dài:** Bấm `Pause` rồi `Resume`, và thử Pomodoro sang giai đoạn nghỉ ngắn / nghỉ dài — xác nhận thanh tab vẫn ẩn suốt quá trình đó.
  3. **Đóng popup rồi mở lại giữa phiên:** Đang chạy (hoặc đang Pause/Break), đóng popup extension rồi bấm icon mở lại — xác nhận popup vào thẳng giao diện Tập trung (không chớp về Bản đồ).
  4. **Kết thúc phiên (hoàn thành và Give Up):** Đợi một phiên hoàn thành hoặc bấm `Give Up` — xác nhận nút **`Exit`** (`vi`: **`Thoát`**) xuất hiện thay cho chữ cũ; bấm `Exit` thì phiên được reset, điều hướng về tab **Bản đồ** và thanh tab dưới cùng hiện lại.
  5. **Để phiên tự kết thúc khi popup đang đóng (và thử tình huống lỗi reset):** Bắt đầu phiên ngắn rồi đóng popup; chờ phiên hết giờ hoặc ngắt phiên xong mới mở lại popup — xác nhận vào thẳng màn kết quả có nút `Exit`. Nếu background lỗi khi reset, màn kết quả hiển thị lỗi song ngữ, không rời màn và nút `Exit` vẫn bấm lại được.
  6. **Màn "Hồ sơ Tập trung & Danh sách Cho phép":** Mở danh sách hồ sơ — xác nhận không còn nút **`Dùng`** / **`Use`**; chạm thẳng vào vùng tên hồ sơ (hoặc focus bằng `Tab` rồi nhấn `Enter`/`Space`) sẽ chọn & kích hoạt ngay; hai nút Sửa tên và Xóa nằm trong ô chữ nhật bo góc viền mảnh `36×36px` khi bấm không làm đổi hồ sơ; khi đang chạy phiên thì mọi nút đổi/sửa/xóa đều bị vô hiệu hóa kèm lý do khóa.
