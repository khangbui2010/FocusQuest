# BÁO CÁO NGHIỆM THU — MILESTONE UX / GIAI ĐOẠN UX-4

**Giai đoạn:** Milestone UX — Giai đoạn UX-4 *(Đồng bộ hiển thị phần thưởng giữa các màn hình qua Một Nguồn Chân Lý và chuẩn hóa định dạng số Coin/XP tối đa 2 chữ số thập phân — KHÔNG thuộc Phase 5, 5B.5 hay Milestone LOFI)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_ux4_prev.md`  
**Trạng thái:** Đã hoàn tất kiểm định (`561 / 561` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt**

---

## 1. BẤT BIẾN & PHẠM VI ĐƯỢC BẢO TOÀN

- **Không sửa công thức & thời điểm quyết toán thưởng:** Giữ nguyên hoàn toàn `RewardEngine`, `MultiplierRules`, `coinBonus.ts`, cách tính và thời điểm cộng thưởng trên `SessionCoordinator` (`completeCountdown`, `finishStopwatch`, `advancePomodoroStage`), hệ thống XP/Level và storage schema (`schemaVersion`).
- **Bảo toàn độ chính xác IEEE-754 trong storage:** Ví người chơi (`fq_economy.focusCoins`) và thống kê ngày (`fq_daily_stats.coinsEarned`) lưu nguyên giá trị thập phân thực (`7.875`, `55.5 + 7.875 = 63.375`, `8 × 7.875 = 63`), **không** làm tròn non ở lõi.
- **Ranh giới hiển thị sạch sẽ:** Không có file nào trong `src/core/reward/*`, `src/core/economy/*`, `src/storage/*` hoặc `src/background/sessionCoordinator.ts` import helper định dạng UI (`formatters.ts`). Định dạng số chỉ nằm ở ranh giới UI và `src/background/notificationFormatter.ts`.

---

## 2. ĐỐI SOÁT HIỆN TRẠNG & NGUYÊN NHÂN GỐC (TRƯỚC → SAU UX-4)

| Màn hình / Thành phần | Trước UX-4 (Lỗi quan sát) | Nguyên nhân gốc | Sau UX-4 (Đã sửa) |
|---|---|---|---|
| **Màn Setup (`TimerView` STATE 3)** | Hiển thị đúng `+7.88 [+5%], +25 XP` nhưng tự nhân lại công thức tách rời + dùng `Math.round(bonus * 100)`. | Tính tay trong `TimerView.tsx` (không dùng chung nguồn với Running/Outcome). | Gọi `getSessionRewardPreview` (`src/core/reward/rewardPreview.ts`) & `formatRewardAmount` cho cả Coins, XP và `% bonus`. |
| **Màn đang chạy (`TimerView` STATE 2)** | Countdown 5m với công trình `+5%` hiện sai `Reward: 7.5 Coin, 25 XP ×1.0` (thiếu `+5%`). | `App.tsx` không truyền `civBonusRate` xuống `TimerView`; `TimerView` tính thiếu `(1 + activeBonusRate)` và không gắn chip `+%`. | `App.tsx` tính `civBonusRate` từ `aggregateCoinBonus(extractBuildingCoinBonuses(...))` trong `refreshState()` và truyền vào `PopupShell`/`TimerView`; `TimerView` dùng `getSessionRewardPreviewFromSnapshot` và render chip `live-coin-bonus-chip` (`+5%`). |
| **Màn hoàn thành (`TimerView` STATE 1)** | Countdown 5m với `+5%` hiện sai `+7.5 Coin, +25 XP` (lệch với ví cộng thật `+7.875`); Stopwatch `< 5m` completed không kiểm ngưỡng 5 phút. | `TimerView` tự tính `1.5 * target * mult` bỏ qua `activeBonusRate`, và tính `sw` không check `>= 5m`. | Dùng chung `getSessionRewardPreviewFromSnapshot` và render `outcome-coin-bonus-chip` (`+5%`), hiện `+7.88` / `+25`; Stopwatch `< 5m` hiển thị `+0` / `+0` khớp `RewardEngine`. |
| **Header & Catalog / Civilization** | `Header` hiển thị `63.38`, nhưng `BuildingCatalogPanel` hiện raw float `playerCoins` chưa định dạng (`63.375`). | `BuildingCatalogPanel.tsx` truyền trực tiếp `playerCoins`, `eff.rate * 100`, `def.baseCost` chưa qua `formatRewardAmount`. | Chuẩn hóa `BuildingCatalogPanel.tsx` (d.83, 137, 197, 258), `BuildingDetailsModal.tsx` (d.188) và `LandExpansionModal.tsx` (d.56, 127, 173) dùng `formatRewardAmount`. |
| **Bộ định dạng `formatRewardAmount` (`src/ui/utils/formatters.ts`)** | Dùng `Math.round((amount + Number.EPSILON) * 100) / 100`: sai số half-up nhị phân ở các mốc `.005` (`1.005`, `10.005`) và không chặn `Infinity`/`-Infinity`. | Phép nhân float `* 100` mất chính xác trước khi làm tròn. | Viết lại thuần bằng phân tích chuỗi thập phân `parsePositiveDecimalString` + `addOneToDigits` (hỗ trợ cả ký hiệu khoa học `e/E`), làm tròn half-up đúng chuẩn, bỏ `.0`/`0` thừa cuối, luôn dùng `.`, chặn `-0`/`NaN`/`Infinity`. |
| **Ranh giới `SessionCoordinator`** | `sessionCoordinator.ts` import trực tiếp `formatRewardAmount` từ `src/ui/utils/formatters.ts` và `translator.ts`. | Pha trộn tầng giao diện vào logic nghiệp vụ nền. | Tách `src/background/notificationFormatter.ts` (`formatSessionNotificationContent`); `SessionCoordinator` chỉ truyền `coins` và `xp` dạng `number` thuần ra ranh giới thông báo. |

---

## 3. CÁC TỆP ĐÃ THAY ĐỔI & TẠO MỚI

- **Tạo mới:**
  - `src/core/reward/rewardPreview.ts` — Hàm thuần `getSessionRewardPreview` & `getSessionRewardPreviewFromSnapshot` làm Một Nguồn Chân Lý cho Setup, Running/Paused, Finish Confirm Modal và Terminal Outcomes (bảo toàn IEEE-754 thô).
  - `src/background/notificationFormatter.ts` — Adapter biên hiển thị Chrome Notification, định dạng số `coins`/`xp` và dịch i18n bên ngoài `SessionCoordinator`.
  - `__tests__/ui/ux4RewardDisplayAndFormatting.test.ts` — Bộ 7 test kiểm chứng toàn diện UX-4.
- **Cập nhật mã nguồn:**
  - `src/ui/utils/formatters.ts` — Thuật toán định dạng thập phân half-up max 2 chữ số + alias `formatCoinAmount`, `formatXpAmount`, `formatDecimalMax2`.
  - `src/background/sessionCoordinator.ts` — Gỡ import `ui/utils/formatters` & `translator`, truyền số thô qua `formatSessionNotificationContent`.
  - `src/App.tsx` — Đồng bộ `civBonusRate` trực tiếp từ snapshot Civilization (tự cập nhật khi xây/gỡ công trình giữa phiên) và truyền xuống `PopupShell` → `TimerView`.
  - `src/ui/components/TimerView.tsx` — Dùng `getSessionRewardPreview` / `getSessionRewardPreviewFromSnapshot` cho cả 3 STATE + Finish Confirm Modal + chip `+%` + chuẩn hóa `multiplier.toFixed(1)`.
  - `src/ui/components/civilization/BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, `LandExpansionModal.tsx` — Áp dụng `formatRewardAmount` đồng nhất cho ví, chi phí và `% bonus`.
- **Cập nhật tài liệu:**
  - `PRODUCT_SPEC.md` (đồng bộ Status UX-4 và mục `§6.3`), `PROJECT_STATUS.md`, `respond_ux4_prev.md` (sao lưu báo cáo UX-3).

---

## 4. KIỂM THỬ MỚI (`__tests__/ui/ux4RewardDisplayAndFormatting.test.ts` — 7 TESTS)

1. **Formatter Edge Cases:** `7.875 -> "7.88"`, `7.5 -> "7.5"`, `34.5 -> "34.5"`, `55 -> "55"`, `63.375 -> "63.38"`, `1.005 -> "1.01"`, `10.005 -> "10.01"`, `0.004 -> "0"`, `0.005 -> "0.01"`, `-0`/`-0.004 -> "0"`, `-1.005 -> "-1.01"`, `NaN`/`Infinity`/`-Infinity -> "0"`, `1234567.891 -> "1234567.89"`, `7.7250000000000005 -> "7.73"`, ký hiệu `e/E`, dấu chấm `.`.
2. **Kịch bản lỗi thực tế (`55.5` + Countdown 5m @ `+5%`):** Xác nhận ví lưu chính xác `63.375`, `Header` và `BuildingCatalogPanel` cùng hiện `63.38`, Notification hiện `7.88` / `25`, Setup/Running/Completed đều hiện `7.88` + `+5%` + `25` XP (không còn `7.5`).
3. **Bảng đối chiếu 4 chế độ (`0%` & `+5%`):** Kiểm tra `COUNTDOWN`, `STOPWATCH` (`30m ×1.2`), `POMODORO_COUNTDOWN` (`300m ×2.5`), `POMODORO_STOPWATCH` (`50m ×1.2`) có Setup == Running == Completed == số cộng thật ở `SessionCoordinator`.
4. **Stopwatch `< 5m` khi Completed:** Xác nhận phiên `3m` trả `0` Coin / `0` XP cả ở màn đang chạy lẫn màn hoàn thành.
5. **Đồng bộ `CoinBonus` giữa phiên:** `PopupShell` truyền `civBonusRate` thay đổi từ `0%` → `+5%` cập nhật ngay màn Running và khớp quyết toán cuối phiên.
6. **Bảo toàn tích lũy IEEE-754 trong storage:** Hoàn thành 8 phiên Countdown 5m liên tiếp (`+7.875` mỗi phiên) tích lũy thành **chính xác `63`** Coins trong ví và `fq_daily_stats` (không sai số cộng dồn).
7. **Kiểm tra tĩnh biên kiến trúc:** Quét toàn bộ `.ts` trong `src/core/reward/`, `src/core/economy/`, `src/storage/` và `src/background/sessionCoordinator.ts` bảo đảm 0 import tới `ui/utils/formatters` hay hàm format.

---

## 5. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,741 modules transformed`, `652ms`, tổng dung lượng `dist/`: `1,084,217 B`):
  - `dist/index.html`: `716 B` | `dist/assets/popup-D9z-9pA-.css`: `88.29 kB`
  - `dist/assets/popup-xM55En9Z.js`: `765.03 kB` (gzip: `201.49 kB`)
  - `dist/assets/translator-B5-w4v6G.js`: `52.47 kB` | `dist/assets/statsAggregator-DUdjfgHP.js`: `55.13 kB` | `dist/assets/storageKeys-BmLuJ1Do.js`: `0.37 kB`
  - `dist/background.js`: `87.71 kB` | `dist/offscreen.js`: `3.87 kB` | `dist/blocked.js`: `1.32 kB`
- **`npm test` — chạy 3 lần liên tiếp (sau lần sửa code & test cuối cùng):**
  - **Lần 1:** `561 / 561 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,420.17 ms`, Exit `0`).
  - **Lần 2:** `561 / 561 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,492.74 ms`, Exit `0`).
  - **Lần 3:** `561 / 561 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,342.93 ms`, Exit `0`).

---

## 6. GIỚI HẠN KIỂM CHỨNG & HƯỚNG DẪN TỰ KIỂM TRÊN CHROME THẬT

- **Giới hạn kiểm chứng:** Chưa chạy mở trực tiếp popup Chrome `400×600px`; toàn bộ test UI chạy qua React SSR (`renderToString`) và test background chạy qua mock Chrome adapters.
- **Các bước để bạn tự kiểm trên Chrome (`chrome://extensions` → Load unpacked `dist/`):**
  1. **Tái hiện kịch bản `55.5 -> 63.375`:** Đặt 1 công trình `+5%` Coin, chạy thử Countdown 5 phút. Kiểm tra màn Running hiện `7.88 Coin`, chip `+5%`, `25 XP ×1.0` (không còn `7.5`).
  2. **Khi Countdown 5 phút hoàn thành:** Xác nhận màn Completed hiện `+7.88`, chip `+5%`, `+25` XP; đồng thời số dư Header và trong Catalog công trình tăng từ `55.5` lên `63.38` (và trong `chrome.storage.local` là đúng `63.375`).
  3. **Kiểm tra Stopwatch `< 5 phút` & `>= 5 phút`:** Chạy thử Stopwatch kết thúc ở `2m–3m` để xác nhận màn Completed hiện `+0` Coin / `+0` XP; chạy `>= 5m` xác nhận chip `+5%` khớp ví.
  4. **Thử thay đổi bonus giữa phiên:** Mở một phiên Countdown (để popup không đóng) hoặc mở bản đồ trước khi xong phiên để đặt/gỡ công trình `+CoinBonus`, kiểm tra số thưởng hiển thị trên màn Running đồng bộ theo mức bonus mới.
