# BÁO CÁO NGHIỆM THU — MILESTONE 5B.5 / GIAI ĐOẠN 3

**Giai đoạn:** Milestone 5B.5 — Giai đoạn 3 *(Stats Engine `statsAggregator.ts` & Biểu đồ SVG thuần `StatsBarChart.tsx`, không nâng cấp `StatsView.tsx`)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_phase3_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`545 / 545` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. PHẠM VI TUÂN THỦ ("KHÔNG LÀM")

- **Không làm Giai đoạn 5c:** Chưa nâng cấp `src/ui/components/StatsView.tsx` (giữ nguyên nguyên bản 4,571 bytes), chưa thêm tab Day/Month/Year vào giao diện popup `Stats`.
- **Không đổi lõi dữ liệu & nghiệp vụ:** Không sửa `DailyStatRecord`, không sửa cách ghi/không prune `fq_daily_stats`, không sửa `RewardEngine`, economy, `SessionCoordinator`, `MusicCoordinator`, hay `schemaVersion`.
- **Bảo toàn bất biến:** Giữ nguyên hàm `calculateLifetimeFocusMinutes(dailyStats)` (đúng chữ ký và kết quả). Mọi hàm mới đều thuần: không `Date.now()`, không `new Date()`, không `Math.random()`, không phụ thuộc múi giờ máy.

---

## 2. CHI TIẾT CÁC HẠNG MỤC ĐÃ TRIỂN KHAI

### 2.1. Stats Engine (`src/core/stats/statsTypes.ts` & `src/core/stats/statsAggregator.ts`)
- **Số học lịch Gregory thuần trên Y/M/D (thuật toán epoch-day nguyên):** Xử lý đúng năm nhuận (`2024`, `2000` có 29/02; `1900`, `2025` không có), số ngày của từng tháng (`28/29/30/31`), bước ngày qua ranh giới tháng/năm (`addDaysToDateKey`), hàm kiểm tra hợp lệ `isValidDateKey` / `isValidMonthKey` / `isValidYearKey`.
- **Chống dữ liệu bẩn:** Bỏ qua các bản ghi có khóa ngày không hợp lệ hoặc giá trị `null`/không phải object; các số âm, `NaN`, `Infinity` được quy về `0`; bảo toàn độ chính xác thập phân cho Coins/XP. Định nghĩa "ngày có hoạt động" = `totalFocusMinutes > 0`.
- **`aggregateDayStats(dailyStats, dateISO)`:** Trả về số liệu ngày (`focusMinutes`, `completed`, `abandoned`, `sessions`, `coins`, `xp`) + mảng `trend7Days` đúng 7 điểm kết thúc tại `dateISO` (điền `0` cho ngày thiếu dữ liệu; trả về `[]` an toàn nếu `dateISO` không hợp lệ).
- **`aggregateMonthStats(dailyStats, 'YYYY-MM')`:** Tính tổng focus, trung bình/ngày theo **cả hai cách** (`averageFocusPerCalendarDay` và `averageFocusPerActiveDay`, trả `0` nếu mẫu số `0`), `activeDays`, `completionRate = completed / (completed + abandoned)` (`null` nếu mẫu số `0`), `peakDay` (hòa thì lấy ngày sớm hơn; `null` nếu tháng không có phút tập trung), kèm mảng `days` đúng `28–31` phần tử theo thứ tự thời gian.
- **`aggregateYearStats(dailyStats, 'YYYY')`:** Tính tổng năm, `activeDays`, `completionRate`, `coins`, `xp`, `bestMonth` (hòa thì lấy tháng sớm hơn; `null` nếu không có focus), kèm mảng `months` đủ 12 tháng `'YYYY-01'..'YYYY-12'`.
- **`calculateFocusStreak(dailyStats, todayISO)`:** Tính `{ current, longest }`. Chuỗi hiện tại tính lùi từ `todayISO`, hoặc từ `todayISO - 1` nếu hôm nay chưa có dữ liệu (không rớt về `0` ngay đầu ngày), bỏ qua mọi bản ghi có ngày `> todayISO`; `longest` quét toàn bộ dữ liệu hợp lệ qua ranh giới tháng/năm/29-02, luôn bảo đảm `current <= longest`.

### 2.2. Biểu đồ SVG thuần (`src/ui/components/StatsBarChart.tsx`)
- **0 thư viện chart ngoài:** Tự dựng hoàn toàn bằng SVG + Tailwind CSS (`266` dòng), nền card tối navy (`bg-slate-900 border-slate-800`), cột indigo (`#6366f1`) & cột nổi bật (`#a5b4fc`, `data-highlighted="true"`), chữ trục tương phản `#cbd5e1` / `#f1f5f9` (> 11:1 trên `#0f172a`).
- **Trục & Bố cục `368px`:** Đường lưới ngang, trục Y tự chia mốc tròn từ `0`, nhãn trục X tự giảm thưa không đè chữ khi hiển thị `28–31` cột (vẫn hiển thị đủ nhãn với `7` hoặc `12` cột), mốc vạch đáy `2px` (`data-zero-bar="true"`) cho giá trị `0`, và trạng thái rỗng theo prop `emptyLabel` khi không có dữ liệu.
- **Trợ năng & Tooltip an toàn mép:** `<svg role="img" aria-label={ariaLabel}>`, từng cột dùng `<g tabIndex={0} role="button" aria-label="...">` có vùng bấm/hover suốt chiều cao cột; tooltip hiển thị khi hover hoặc focus và tự căn trái/giữa/phải theo vị trí cột (`data-tooltip-align`) để không tràn ra ngoài khung `368px`; tôn trọng `prefers-reduced-motion` (`motion-reduce:transition-none`); không hardcode chuỗi hiển thị trong component.

### 2.3. Client & Simulator (`src/ui/services/extensionClient.ts`), i18n (`en.ts`, `vi.ts`) & Preview (`SpriteGallery.tsx`)
- **`GET_DAILY_STATS`:** Bổ sung `getDailyStatsClient()`, `buildSimulatedDailyStats()` thuần xác định (~405 ngày, không `Math.random()`, gồm tuần nghỉ, ngày nghỉ, streak quá khứ 16 ngày & streak hiện tại 5 ngày, hòa dữ liệu `mockState.todayStats` dùng `getLocalDateKey()`) và nhánh `case 'GET_DAILY_STATS'` trong `simulateMessageResponse`.
- **i18n EN/VI (426/426 khóa cân đối 100%):** Thêm bộ khóa `stats.chart.*` (`ariaLabel`, `tooltip`, `empty`, tiêu đề preview `#sprites`).
- **Web Preview `#sprites` (`src/ui/components/civilization/SpriteGallery.tsx`):** Bổ sung khối `gallery-stats-bar-chart-preview` trình diễn 3 biểu đồ mẫu `StatsBarChart` (`7` cột, `30` cột, `12` cột) trong khung đúng `368px` chỉ ở Web Preview độc lập.

---

## 3. KIỂM THỬ MỚI & ĐỘ BAO PHỦ

- **Không sửa test nghiệp vụ cũ** (bộ 530 test trước Giai đoạn 3 giữ nguyên 100%).
- **`__tests__/core/statsAggregator.test.ts` (10 tests):** Kiểm tra tĩnh không dùng `Date`/`Date.now()`/`Math.random()`, năm nhuận 29/02 & `getDaysInMonth`, bảo toàn `calculateLifetimeFocusMinutes`, xu hướng 7 ngày qua ranh giới tháng/năm/nhuận, `aggregateMonthStats` (28/29/30/31 ngày, 2 trung bình, `completionRate`, hòa `peakDay`), `aggregateYearStats` (12 tháng, hòa `bestMonth`, năm rỗng), `calculateFocusStreak` (neo hôm nay/hôm qua, bỏ ngày tương lai, `current <= longest`), dữ liệu bẩn (key sai/`-`/NaN/Infinity), **độc lập múi giờ (`TZ=America/Los_Angeles` vs `TZ=Asia/Ho_Chi_Minh`)**, và hiệu năng 3,660 bản ghi (10 năm) chạy `< 150ms`.
- **`__tests__/ui/statsBarChart.test.ts` (4 tests):** Kiểm tra 0 phụ thuộc chart, `motion-reduce:transition-none`, không hardcode chuỗi UI, render 7/12/30 cột với nhãn X thưa ở 30 cột, mốc 0, cột highlight, `tabindex="0"` + `aria-label` song ngữ EN/VI, trạng thái rỗng EN/VI, và preview 3 biểu đồ trong `SpriteGallery` (`#sprites`).
- **`__tests__/ui/extensionClient.test.ts` (+1 test):** Xác minh `getDailyStatsClient()` / `GET_DAILY_STATS` trả kết quả xác định giống hệt qua các lần gọi, bao phủ > 1 năm có tuần nghỉ/ngày nghỉ và streak hợp lệ.

---

## 4. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,738 modules transformed`, `683ms`):
  - `dist/assets/popup-v67toHlJ.js`: **`760.20 kB`** (gzip: `200.62 kB`) — tăng **`+9.21 kB`** so với baseline `750.99 kB` (dưới ngưỡng ~10 kB).
  - `dist/assets/statsAggregator-DM7wxVkB.js`: **`53.96 kB`** (gzip: `14.86 kB`) *(shared domain chunk thay `domainNormalizer-*.js` `48.55 kB`, tăng `+5.41 kB`)*.
  - `dist/assets/popup-CcbP-iLS.css`: **`87.72 kB`** (gzip: `13.73 kB`).
  - `dist/background.js`: **`87.39 kB`** (gzip: `18.86 kB`) — `0` kết quả `react-dom` trong bundle nền.
  - `dist/assets/translator-CNup_GSb.js`: **`51.90 kB`** | `dist/assets/storageKeys-BmLuJ1Do.js`: **`0.37 kB`**.
  - `dist/offscreen.js`: **`3.87 kB`** | `dist/blocked.js`: **`1.32 kB`**.
  - Tổng dung lượng `dist/`: **`1,076,744 B`**; số file âm thanh trong `public/` & `dist/`: **`0`**.
- **Kiểm tra lệch múi giờ riêng cho `statsAggregator.test.ts` (`TZ=America/Los_Angeles` & `TZ=Asia/Ho_Chi_Minh`):** **10 / 10 tests PASS** ở cả 2 múi giờ.
- **`npm test` — chạy 3 lần liên tiếp:**
  - **Lần 1 → 3:** Đều đạt **545 / 545 tests PASS** (`0` fail, `0` skipped, `0` cancelled; lần 3 hoàn tất trong `14,326.02 ms`, `EXIT=0`).

---

## 5. GIỚI HẠN KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRÊN TRÌNH DUYỆT THẬT

- **Giới hạn kiểm chứng:** Toàn bộ UI test chạy bằng **React SSR (`renderToString`)** trên Node.js; tôi **chưa mở trực tiếp trên trình duyệt thật** để xem hiển thị CSS của `#sprites`, kiểm tra thao tác di chuột / nhấn phím `Tab` mở tooltip ở mép trái/phải, hoặc nạp `dist/` trong Chrome.
- **5 bước tự kiểm đề xuất cho bạn:**
  1. **Mở Web Preview `#sprites`:** Chạy `npm run dev` và truy cập `http://localhost:3000/#sprites`, cuộn xuống cuối trang tới mục **"Stage 3 · Pure SVG Chart Preview (368px)"**.
  2. **Kiểm tra hiển thị 3 khung `368px`:** Xác nhận 3 biểu đồ mẫu (`7` cột, `30` cột, `12` cột) vừa khít `368px`, nhãn trục X ở biểu đồ `30` cột thưa gọn không dính chữ, cột nổi bật sáng màu hơn, và các ngày `0` phút có vạch mốc đáy rõ ràng.
  3. **Kiểm tra Tooltip chuột & bàn phím (`Tab`):** Rê chuột lên cột đầu tiên, cột giữa, cột cuối cùng của từng biểu đồ — và nhấn phím `Tab` đi qua các cột rồi nhấn `Enter`/`Esc` — xác nhận tooltip hiển thị đúng số phút & số phiên mà không bị cắt xén ở hai mép.
  4. **Kiểm tra `prefers-reduced-motion`:** Bật Reduced Motion trong DevTools / hệ điều hành và di chuột lại để xác nhận chuyển màu không bị giật/nhảy animation.
  5. **Kiểm tra không ảnh hưởng Popup hiện có:** Mở `http://localhost:3000` (hoặc Load unpacked `dist/` trên Chrome) và bấm sang tab `Stats` — xác nhận giao diện `Today's Focus Summary` và các màn hình Timer / Civilization vẫn giữ nguyên trạng thái trước đó (chưa gắn biểu đồ vào `StatsView` tới Giai đoạn 5c).
