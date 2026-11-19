# Focus Quest — Product Specification

**Document Version:** 1.4.2-synced  
**Target Release:** MVP v1.0  
**Role:** Senior Product Architect & Product Manager  
**Status:** Formal Product Specification (Synced through Milestone UX-5 & Milestone 5B.5 Stage 2b)  

---

## 1. Product Vision
**Focus Quest** là một Chrome Extension hỗ trợ học tập và làm việc sâu (Deep Work), biến nỗ lực duy trì sự tập trung hằng ngày thành một hành trình phiêu lưu thăng tiến (Gamified Journey).

Sản phẩm áp dụng triết lý **Positive Reinforcement (Khen thưởng tích cực)**:
- Tôn trọng từng phút nỗ lực thực tế của người dùng: Thời gian học thực tế luôn được ghi nhận vào thống kê, không bị xóa sổ.
- Ngăn chặn cám dỗ xao nhãng bằng cơ chế Allowlist nghiêm ngặt, tự động.
- Chuyển hóa thời gian tập trung hợp lệ thành tiền tệ (Focus Coins) và kinh nghiệm (XP) để tăng Level.

---

## 2. Problem Statement
1. **Cám dỗ vô thức (Digital Distraction Loop):** Phản xạ vô thức mở tab sang mạng xã hội, giải trí khi gặp bài khó. Bộ lọc Blacklist không thể ngăn chặn vì danh sách web giải trí là vô hạn.
2. **Cảm giác thất bại và bỏ cuộc (Guilt-driven Disengagement):** Các ứng dụng trừng phạt mất sạch tiến độ khi người dùng buộc phải dừng phiên làm nản lòng người học.
3. **Sự đơn điệu của Timer truyền thống:** Thiếu cảm giác thành tựu hữu hình dài hạn để duy trì thói quen bền vững.

---

## 3. Target Users & User Needs
- **Học sinh / Sinh viên:** Cần ôn thi, làm bài tập; cần môi trường web sạch và động lực tích lũy tiến trình mỗi ngày.
- **Lập trình viên / Tri thức trẻ:** Tự học chuyên ngành, cần làm việc sâu theo phiên 45–90 phút liên tục; cần tùy biến danh sách website tài liệu theo ngữ cảnh.
- **Người có xu hướng trì hoãn nhẹ / ADHD:** Cần cấu trúc rõ ràng, tính kỷ luật cao và dopamine lành mạnh qua thành quả Level/Coins sau mỗi phiên.

---

## 4. Core Gameplay Loop
```
  [BẮT ĐẦU PHIÊN TẬP TRUNG]
            │
            ▼
  [HOÀN THÀNH / TÍCH LŨY THỜI GIAN] 
  (Allowlist bảo vệ tuyệt đối)
            │
            ▼
  [NHẬN THƯỞNG: FOCUS COINS & XP]
  (Dựa trên thời gian hợp lệ + Multiplier)
            │
            ▼
  [THĂNG CẤP (LEVEL UP) & TÍCH LŨY TIỀN TỆ]
            │
            ▼
  [TỰ HÀO VỚI THỐNG KÊ NGÀY & TIẾP TỤC PHIÊN MỚI]
```

---

## 5. Hai Chế độ Tập trung (Official Rules)

### 5.1. Chế độ Countdown (Pomodoro / Target)
- **Thiết lập:** Người dùng chọn thời lượng mục tiêu trước khi bắt đầu (preset 15, 25, 45, 60 phút hoặc tùy chỉnh). Multiplier được xác định trước và khóa cố định trong suốt phiên.
- **Mức thưởng:** Base reward cao hơn Stopwatch (khen thưởng cho sự cam kết mục tiêu).
- **Điều kiện nhận thưởng:** Phải hoàn thành đủ 100% thời lượng mục tiêu đã chọn.
- **Xử lý Give Up & Gián đoạn:** Nếu bấm Give Up giữa chừng hoặc phiên bị gián đoạn, người dùng không nhận Focus Coins và XP của phiên đó. **Tuy nhiên**, thời gian tập trung thực tế đã trải qua vẫn được lưu đầy đủ vào bảng thống kê ngày.
- **Pause/Resume:** Hoàn toàn tách biệt với Give Up.

### 5.2. Chế độ Stopwatch (Open-ended / Flow)
- **Thiết lập:** Bắt đầu tự do không cần chọn trước thời gian kết thúc.
- **Mức thưởng:** Base reward thấp hơn Countdown (do tính linh hoạt cao).
- **Quy tắc ngưỡng 5 phút (Threshold Rule):**
  - **Dưới 5 phút (< 5 phút):** Không nhận Focus Coins và XP. Thời gian tập trung thực tế vẫn được ghi nhận vào thống kê ngày.
  - **Từ 5 phút trở lên (>= 5 phút):** Nhận thưởng cho **toàn bộ số phút tập trung hợp lệ thực tế (`actualFocusMinutes`)**. Multiplier được xác định tại thời điểm kết thúc, dựa trên **bảng Session Multiplier thống nhất** theo tổng thời lượng thực tế (ví dụ: 30 phút nhận ×1.2, 60 phút nhận ×1.4; không làm tròn về mốc 10 phút).
- **Không áp dụng quy tắc Give Up của Countdown cho Stopwatch.** Bấm kết thúc là hoàn thành phiên thành công.

### 5.3. Chế độ Pomodoro (Pomodoro Countdown & Pomodoro Stopwatch)
- **Pomodoro Countdown:** Multiplier được xác định và khóa cố định ngay từ khi bắt đầu dựa trên **tổng thời lượng Focus dự kiến của toàn bộ phiên** (`intervalsPerCycle × cycles × intervalDuration`). Áp dụng **All-or-Nothing**: phần thưởng chỉ được **quyết toán và cộng một lần duy nhất** vào ví/thống kê khi hoàn thành **100% toàn bộ các pha và chu kỳ dự kiến**. Trong lúc phiên đang chạy, con số hiển thị là **Thưởng dự kiến** (`Projected Reward`) kèm ghi chú điều kiện hoàn thành đủ 100%. Nếu **Give Up** hoặc bị **gián đoạn (`INTERRUPTED`)** trước khi hoàn thành hết toàn bộ các pha và chu kỳ, phiên nhận **0 Coins và 0 XP** (dù đã xong một phần số pha); màn hình kết thúc hiển thị `+0` Coin / `+0` XP và giải thích rõ chưa hoàn thành tất cả các pha và chu kỳ, đồng thời vẫn lưu số phút tập trung hợp lệ thực tế vào thống kê ngày (`fq_daily_stats`).
- **Pomodoro Stopwatch:**
  - **Quy tắc Thưởng (Reward Rule):** Thưởng Focus Coins và XP được tính **độc quyền trên các focus intervals đã hoàn thành trọn vẹn 100%** (`T = completedIntervals × intervalDuration`). Nếu người dùng kết thúc khi chưa hoàn thành trọn vẹn interval đầu tiên (`N = 0`), phiên nhận 0 Coins và 0 XP. Khi dừng giữa chừng trong một interval đang diễn ra, interval đó không được tính vào thưởng.
  - **Quy tắc Thống kê Ngày (Daily Stats Rule):** Daily Stats ghi nhận **toàn bộ số phút tập trung thực tế (`actualFocusMinutes`)**, bao gồm cả số phút của focus interval đang dang dở (ví dụ: hoàn thành 1 interval 25 phút và tập trung thêm 15 phút ở interval thứ 2 rồi kết thúc -> nhận thưởng 25 phút, nhưng thống kê ngày ghi nhận 40 phút).

---

## 6. Cấu hình Kinh tế & Quy tắc Multiplier (Canonical Economic Config)

### 6.1. Tham số Cơ sở Ban đầu
- **Countdown & Pomodoro Countdown Base:** 1.5 Coins/phút và 5.0 XP/phút.
- **Stopwatch & Pomodoro Stopwatch Base:** 1.0 Coin/phút và 3.0 XP/phút.
- **Ngưỡng nhận thưởng Stopwatch:** Tối thiểu 5 phút.

### 6.2. Multiplier Tiers (Bảng Session Multiplier Thống nhất)
Áp dụng nhất quán cho cả Countdown, Stopwatch, Pomodoro Countdown và Pomodoro Stopwatch:

| Focus duration | Multiplier |
|---|---:|
| Dưới 30 min (< 30 min) | ×1.0 |
| 30–59 min | ×1.2 |
| 60–89 min | ×1.4 |
| 90–119 min | ×1.6 |
| 120–149 min | ×1.8 |
| 150–179 min | ×2.0 |
| Từ 180 min trở lên (180, 200, 240, 300+ min) | ×2.5 |

*Ghi chú: Mốc 180 phút trở lên có hệ số ×2.5 (không phải ×2.2). Mọi mốc thời lượng từ 180 phút trở lên (180m, 200m, 240m, 300m+) đều được áp dụng mức trần ×2.5.*

### 6.3. Additive CoinBonus & XP Independence
- **CoinBonus Cộng dồn (Additive):** Các hiệu ứng từ công trình Civilization (`ECONOMY_EFFECT`) mang lại bonus cộng dồn dạng tỷ lệ `B = tổng rate` (+2%, +3% mỗi level), nhân vào số tiền thưởng cơ sở sau multiplier:
  `Coins = T × R_c × M(T) × (1 + B)`
  Trong đó:
  - `T`: Thời lượng tập trung hợp lệ tính thưởng (phút).
  - `R_c`: Base rate Coins/phút (1.5 cho Countdown / Pomodoro Countdown, 1.0 cho Stopwatch / Pomodoro Stopwatch).
  - `M(T)`: Session Multiplier theo bảng tiers.
  - `B`: Tổng CoinBonus cộng dồn từ các công trình văn minh đang hoạt động (`B >= 0`).
- **XP Độc lập Tuyệt đối:** XP không chịu bất kỳ ảnh hưởng nào từ CoinBonus của Civilization, bảo đảm thăng cấp Level phản ánh trung thực nỗ lực Focus:
  `XP = T × R_x × M(T)`
  Trong đó `R_x` là Base rate XP/phút (5.0 cho Countdown / Pomodoro Countdown, 3.0 cho Stopwatch / Pomodoro Stopwatch).
- **Độ chính xác Số học (IEEE-754 Precision) & Chuẩn Hiển thị Số (UX-4):**
  - **Trong storage và tính toán lõi (`RewardEngine`, `Economy`, `DailyStats`, `SessionCoordinator`):** Số dư Focus Coins, XP và lịch sử thưởng được tính và lưu theo độ chính xác IEEE-754 đầy đủ (ví dụ `+7.875` Coin từ Countdown 5 phút có công trình `+5%`), **tuyệt đối không** làm tròn non hoặc cắt tỉa trước khi cộng dồn vào ví hay thống kê ngày.
  - **Tại ranh giới hiển thị UI & Thông báo hệ thống (`formatRewardAmount`):** Mọi giá trị số Coin, XP, % bonus và chi phí/số dư hiển thị trên giao diện (Header, Setup, Running/Finish Modal, Outcome, Thông báo Chrome, Stats, Catalog/Expansion/Details) đều dùng helper chuẩn hóa **làm tròn thập phân half-up tối đa 2 chữ số thập phân** (`7.875` → `7.88`, `63.375` → `63.38`, `1.005` → `1.01`), bỏ `.0`/số `0` vô nghĩa ở cuối (`7.50` → `7.5`, `55.00` → `55`), luôn dùng dấu `.` và không bao giờ hiện `-0`, `NaN` hay `Infinity`.
  - **Đồng bộ Một Nguồn Chân Lý (`getSessionRewardPreview`):** Cả 4 màn hình Setup (`IDLE`), Running/Paused, Finish Confirm Modal và Outcome (`COMPLETED` / `ABANDONED` / `INTERRUPTED`) cùng đọc từ hàm preview thuần `getSessionRewardPreview` dùng chung công thức với `RewardEngine` và `SessionCoordinator` (áp dụng đúng `CoinBonus` đang hoạt động, ngưỡng `< 5 phút` của Stopwatch, và quy tắc All-or-Nothing của Pomodoro Countdown). Khi xây hoặc gỡ công trình văn minh trong lúc phiên đang chạy, `CoinBonus` hiển thị ở màn đang chạy đồng bộ theo trạng thái mới nhất khớp với số tiền sẽ quyết toán khi hoàn thành.

### 6.4. Công thức Cấp độ (Level Progression)
- Để thăng từ Level `N` lên Level `N + 1`, người chơi cần `N × 100` XP riêng cho cấp đó:
  - Level 1 → Level 2: Cần 100 XP (Tổng tích lũy: 100 XP).
  - Level 2 → Level 3: Cần 200 XP (Tổng tích lũy: 300 XP).
  - Level 3 → Level 4: Cần 300 XP (Tổng tích lũy: 600 XP).
  - Level 4 → Level 5: Cần 400 XP (Tổng tích lũy: 1000 XP).
  - Tổng XP tích lũy đạt Level `L`: `((L - 1) × L / 2) × 100`.

---

## 7. Civilization Metagame & 8 Kỷ nguyên Lịch sử
- **8 Kỷ nguyên Lịch sử (`CivilizationEra`):**
  1. `STONE_AGE` (Thời tiền sử / Đồ đá)
  2. `BRONZE_AGE` (Thời kỳ đồ đồng)
  3. `IRON_AGE` (Thời kỳ đồ sắt)
  4. `MEDIEVAL` (Thời kỳ trung cổ)
  5. `EARLY_MODERN` (Thời kỳ cận đại)
  6. `MODERN` (Thời kỳ hiện đại)
  7. `FUTURISTIC` (Thời kỳ tương lai)
  8. `INTERPLANETARY` (Liên hành tinh)
- **Nguyên tắc Cốt lõi:**
  - **Zero Passive Income:** Không có sản xuất thụ động, không có idle production. Coins chỉ được tạo ra khi người dùng hoàn thành phiên Focus thực tế.
  - **Lưới bản đồ & Mở rộng đất:** Khởi đầu `8 × 8` ô (`64` ô, gồm 4 chunks `4 × 4`). Người chơi mở rộng từng chunk `4 × 4` (`+16` ô) liền kề biên giới theo danh sách ô khả dụng động (`getAvailableExpansionSlots`), hỗ trợ tọa độ âm. Chi phí chunk mới thứ `k`: `cost(k) = round(60 × prod(i = 1..k-1) min(1.5, 1.25 + 0.01 × (i - 1)))` (`60, 75, 95, ...`) và yêu cầu `Player Level >= k + 2` (`Lv. 3, 4, 5, ...`).
  - **Cảnh quan & Rừng (Lớp hiển thị UI thuần):** Vùng đất đã mở hiển thị cỏ, mảng đất, đá rêu, mầm/nấm và bụi thưa; vùng chưa mở xung quanh hiển thị rừng tối (`40%` lớp phủ tối) với các cụm tán lá `2×2`, chữ thập `3×3`, cây `1×2` và `1×1` sinh xác định theo chunk `4×4`, kèm animation rìu chém rừng + rung nhẹ sau khi commit mở rộng đất. Cảnh quan không lưu dữ liệu game và không chặn đặt công trình.
  - **3 Nhóm công trình:** `DECORATIVE` (thẩm mỹ), `FOCUS_SUPPORT` (mở khóa thống kê/tính năng), `ECONOMY_EFFECT` (thưởng CoinBonus cộng dồn cho phiên Focus). Nút nâng cấp công trình hiện khóa ở `"Milestone 5C"`.

---

## 8. Quy tắc Tạm dừng (Pause Rule)
- **Số lần tối đa:** 2 lần trong một phiên tập trung.
- **Thời lượng tối đa mỗi lần:** 5 phút (300.000 ms).
- **Quy tắc thời gian:** Thời gian Pause **không được tính** vào thời gian tập trung thực tế hay thời gian tính thưởng.
- **Tự động tiếp tục (Auto-Resume):** Khi hết 5 phút Pause, phiên tập trung tự động chuyển về trạng thái tiếp tục chạy (`Running`).

---

## 9. Xử lý Gián đoạn & Tắt Trình duyệt Đột ngột (Approved Decision)
- **Phương án A:** Ghi nhận thời gian tập trung hợp lệ thực tế trước khi tắt dựa trên mốc `startedAt`, thời gian pause và `lastHeartbeatAt` (`lastCheckpointAt`), sau đó đóng phiên bị gián đoạn (`INTERRUPTED`).
- **Countdown & Pomodoro Countdown gián đoạn:** Không tính là hoàn thành, **nhận 0 Coins và 0 XP** (kể cả khi Pomodoro Countdown đã hoàn thành một phần số pha trước khi gián đoạn). Số phút tập trung hợp lệ thực tế đã học vẫn được lưu vào thống kê ngày.
- **Stopwatch gián đoạn:** Khi bị gián đoạn bởi tắt trình duyệt hoặc tắt/tải lại extension, nhận **0 Coins và 0 XP**; số phút tập trung hợp lệ thực tế được ghi nhận vào thống kê ngày (`isAbandoned = true`).
- **Pomodoro Stopwatch gián đoạn:** Khi đóng/mở lại trình duyệt (`BROWSER_CLOSED`), bảo toàn và trao thưởng cho các focus intervals đã hoàn thành trọn vẹn (`completedFocusCount >= 1`), không thưởng cho interval đang dở dang và ghi toàn bộ số phút hợp lệ vào thống kê ngày; nếu bị tắt/tải lại extension (`EXTENSION_DISABLED` / `EXTENSION_RELOADED`), nhận 0 Coins và 0 XP nhưng vẫn ghi nhận số phút tập trung hợp lệ.
- **Chống thưởng trùng:** Đánh dấu `rewardProcessed = true` ngay khi khôi phục để bảo đảm tính idempotency tuyệt đối.

---

## 10. Focus Profiles & Allowlist Management (CRUD Domain Rules)
- Người dùng có toàn quyền:
  1. Tạo Profile mới (tên hợp lệ 1-50 ký tự, không rỗng, không trùng tên).
  2. Đổi tên Profile (giữ nguyên ID ổn định và danh sách domain).
  3. Thêm domain vào allowlist của Profile (chuẩn hóa hostname, chống trùng lặp, từ chối wildcard nguy hiểm).
  4. Xóa domain khỏi allowlist của Profile (chỉ xóa đúng domain của Profile đó, không ảnh hưởng Profile khác).
  5. Cập nhật toàn bộ allowlist của Profile.
  6. Xóa Profile:
     - Nếu xóa Profile đang hoạt động (Active): chuyển sang Profile thay thế được chỉ định, hoặc tự động fallback sang Profile còn lại.
     - Từ chối xóa nếu chỉ còn 1 Profile duy nhất trong hệ thống.
  7. Chọn Active Profile: Chỉ cho phép chọn Profile thực sự tồn tại.
- **Hai Profile mẫu ban đầu:**
  - `Study & Research`
  - `Deep Work / Coding`
  - **Quy tắc bắt buộc:** Hai Profile này được khởi tạo với **Allowlist hoàn toàn rỗng `[]`**.
  - Không tự động kích hoạt bất kỳ domain mặc định nào. Mọi domain đều do người dùng tự nhập và tùy biến.
- **Allowlist-only:** Trong suốt phiên tập trung, chỉ các website nằm trong Allowlist của Profile đang kích hoạt mới được phép truy cập. Mọi website khác mặc định bị chặn.
- **Không có nút mở khóa tùy ý:** Màn hình chặn kiên quyết không cung cấp nút mở khóa tạm thời trong phiên.

---

## 11. Thông báo Khi Hoàn thành & Hiệu ứng Âm thanh (Notification & Sound Rules)
- **Kênh thông báo hệ thống (Bilingual EN/VI):** Sử dụng **Chrome Notification** hệ thống cho mốc hoàn thành Countdown/Pomodoro Countdown, chuyển sang giờ nghỉ (Short/Long Break), và hết giờ nghỉ quay lại Focus; tự động chọn ngôn ngữ theo `settings.language` hoặc locale trình duyệt.
- **Hiệu ứng âm thanh (Web Audio API):**
  - Sử dụng Web Audio API (bộ dao động tổng hợp âm thanh không phụ thuộc file ngoài) để phát tiếng chuông báo khi bắt đầu phiên Focus hoặc khi chuyển sang Break (bật/tắt qua `chimeEnabled`, mặc định bật).
  - Âm thanh chỉ phát khi cửa sổ popup của extension đang mở.
  - **Xử lý lỗi âm thanh:** Nếu AudioContext không khả dụng, bị chặn bởi autoplay policy hoặc gặp lỗi thiết bị, lỗi chỉ được bỏ qua êm (graceful fallback) và **tuyệt đối không làm sai lệch** trạng thái phiên, chu kỳ Pomodoro hay phần thưởng của người dùng.
- **Xử lý sự cố quyền thông báo:** Nếu người dùng từ chối quyền hoặc Chrome Notification bị lỗi, sự cố này chỉ được ghi log và **tuyệt đối không làm sai lệch** trạng thái hoàn thành hay phần thưởng của phiên.

---

## 12. Phong cách & Kiến trúc Giao diện (UI Architecture)
- **Công nghệ UI:** **React 19 + Tailwind CSS 4** cho Popup (`index.html`), Blocked Page (`blocked.html` + module `blocked.js` tuân thủ CSP MV3) và Chrome `_locales` (`en`, `vi`).
- **Điều hướng & Song ngữ:** Thanh điều hướng đáy 5 tab cố định (`Quests | Focus | Map | Awards | Stats`), mặc định mở màn hình bản đồ `Map` ở giữa; song ngữ 100% EN/VI (UI, lỗi từ backend qua `errorTranslator`, thông báo Chrome, trang chặn `blocked.html`). `Quests` và `Awards` hiện ở trạng thái giữ chỗ "Coming soon".
- **Ranh giới:** UI là view/controller mỏng; **tuyệt đối không trực tiếp quyết định thời gian tập trung chính thức hoặc tự trao Coins/XP**.

---

## 13. Hệ thống Nhiệm vụ Hàng ngày & Hàng tuần (Quest Engine & Coordinator — Stage 2b)
> **Trạng thái tích hợp:** Phần domain thuần (`src/core/quests/`), types (`src/types/quests.ts`), Schema v3 (`fq_quests`, `v3_questsSchema.ts`), **quyết toán nguyên tử cùng phiên Focus trong `SessionCoordinator` / `StorageManager`**, `QuestCoordinator` (`GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`), `errorTranslator`, và simulator `extensionClient.ts` đã hoàn tất ở **Giai đoạn 2b**. Phần thưởng khi Claim chỉ cộng phẳng Coins/XP vào `ECONOMY` (dùng đúng `calculatePlayerLevel`, **không ghi vào `fq_daily_stats`**). Giao diện người dùng `QuestView` & `StatsView` nâng cấp giữ nguyên lịch thực hiện ở **Giai đoạn 5c**.

- **Nhiệm vụ Hàng ngày (Daily Quests — Cap: `40 Coins · 100 XP / ngày`):**
  1. `daily_first_spark` (*First Spark*): Hoàn thành `1` phiên Focus hợp lệ → `10 Coins · 25 XP`.
  2. `daily_steady_rhythm` (*Steady Rhythm*): Tích lũy `60` phút Focus từ các phiên hoàn thành hôm nay → `15 Coins · 35 XP`.
  3. `daily_double_tap` (*Double Tap*): Hoàn thành `2` phiên Focus hợp lệ trong ngày → `15 Coins · 40 XP`.
- **Nhiệm vụ Hàng tuần (Weekly Quests — 3 trục độc lập, Cap: `150 Coins · 370 XP / tuần`):**
  1. `weekly_habit_builder` (*Habit Builder*): Hoàn thành phiên trên `4` ngày phân biệt trong tuần (Thứ Hai–Chủ Nhật) → `50 Coins · 120 XP`.
  2. `weekly_deep_diver` (*Deep Diver*): Hoàn thành `3` phiên sâu (`>= 45 phút`) → `60 Coins · 150 XP`.
  3. `weekly_tenacity_10` (*Weekly Tenacity*): Hoàn thành tổng `10` phiên Focus hợp lệ trong tuần → `40 Coins · 100 XP`.
- **Quy tắc Cân bằng & Bảo vệ:**
  - **Thưởng cố định (Flat Rewards) & Manual Claim:** Thưởng Quest không nhân với Session Multiplier hay Civilization `CoinBonus`; người dùng bấm nhận thủ công và phần thưởng chưa nhận sẽ hết hạn khi rollover qua `00:00` (Daily) hoặc `00:00` Thứ Hai (Weekly).
  - **All-or-Nothing Session Eligibility (`toQuestOutcomeDelta`):** Chỉ phiên `COMPLETED` mới cộng tiến độ Quest (Countdown / Pomodoro Countdown Give Up hoặc `INTERRUPTED` = `0`; Stopwatch `< 5 phút` hoặc `INTERRUPTED` = `0`; Pomodoro Stopwatch chỉ tính `completedFocusCount × intervalDuration`, **không** cộng interval đang dở dang).
  - **Streak & Chống tua đồng hồ (Anti-Clock-Rollback):** Chuỗi ngày tập trung (`currentDays`, `longestDays`) chỉ tăng khi hoàn thành phiên ở ngày mới kế tiếp (nhiều phiên cùng ngày giữ nguyên, gián đoạn >= 2 ngày reset về `1`) và **không sinh Coin thụ động**; hệ thống lưu `lastSettledTimestamp`, `processedPeriodKeys` và `recentClaimedKeys` (ring buffer tối đa `14` mục) để chặn reset ngoài ý muốn hoặc claim trùng khi đồng hồ hệ thống lùi lại.
