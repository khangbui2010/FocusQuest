# Focus Quest — Product Specification

**Document Version:** 1.13.0-synced  
**Target Release:** MVP v1.0  
**Role:** Senior Product Architect & Product Manager  
**Status:** Formal Product Specification (Synced through Milestone 5B.5 Closed, UX-1..UX-6 Approved, Milestone 5C Stage 5C-1, Milestone Villager V1–V5.2, CLEANUP-1, Milestone 5D-1, Milestone 5E-1/1b/1c/2/2b & **Milestone 5D-2 + 5E-3**)  

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
- **CoinBonus Cộng dồn (Additive):** Các hiệu ứng từ công trình Civilization (`ECONOMY_EFFECT`: *Foraging Post* `+2%/lv`, *Primitive Granary* `+3%/lv`) cùng buff dân làng **Thợ thủ công (`Crafter`)** (`+5%/người`, trần `+40%` tại `8` người) và **Đủ bộ 3 vai trò (`Complete Tribe`: Elder + Crafter + Woodworker)** (`+10%`) mang lại bonus cộng dồn dạng tỷ lệ `B = tổng rate` (trần lý thuyết Thời đại Đồ Đá `+150%`), nhân vào số tiền thưởng cơ sở sau multiplier:
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
  - **Lưới bản đồ & Mở rộng đất (`Milestone 5E-1`):** Khởi đầu `8 × 8` ô (`64` ô, gồm 4 chunks `4 × 4`). Người chơi mở rộng từng chunk `4 × 4` (`+16` ô) liền kề biên giới theo danh sách ô khả dụng động (`getAvailableExpansionSlots`), hỗ trợ tọa độ âm. Từ **Milestone 5E-1**, chi phí mở rộng đất chuyển sang **cấp số cộng bậc thang**: `cost(1) = 30`, `cost(k) = 30 + Σ_{j=1}^{k-1} (10 + 5 × ⌊(j - 1) / 5⌋)` (`30, 40, 50, 60, 70, 80, 95, 110, ...`; `k = 20` là `355`), yêu cầu `Player Level >= k + 2` (`Lv. 3, 4, 5, ...`) và cần đội **`2` dân làng + `60` phút Focus** dọn rừng (`EXPAND_LAND` tạo job `expand` tại ô `origin` cho tới khi hoàn thành).
  - **Cảnh quan & Rừng (Lớp hiển thị UI thuần):** Vùng đất đã mở hiển thị cỏ, mảng đất, đá rêu, mầm/nấm và bụi thưa; vùng chưa mở xung quanh hiển thị rừng tối (`40%` lớp phủ tối) với các cụm tán lá `2×2`, chữ thập `3×3`, cây `1×2` và `1×1` sinh xác định theo chunk `4×4`, kèm animation rìu chém rừng + rung nhẹ sau khi job mở đất hoàn thành. Cảnh quan không lưu dữ liệu game và không chặn đặt công trình.
  - **3 Nhóm công trình & Quy tắc Nâng cấp (`Milestone 5C-1` + `Villager V5.2` + `5E-1`):**
    - `DECORATIVE` (*Campfire* `baseCost = 4` xây tức thì `0` dân / `0` phút; *Ancient Totem* `baseCost = 8` cần `1` dân / `60` phút) và *Elder's Hut* (`stone_age_elder_hut`, `baseCost = 20` cần `2` dân / `120` phút): giữ nguyên hiệu ứng cố định, **không nâng cấp**.
    - *Rock Shelter* (`stone_age_study_cave`, tiếng Việt *Hang trú ẩn* — `FOCUS_SUPPORT`, **`Villager V2 & V5.2` + `5E-1`**): kích thước **`3 × 3`** (sprite `48 × 48`), giới hạn tối đa **`1` hang trên bản đồ** (`MAX_VILLAGE_CAVES = 1`), xây `1` dân / `60` phút, hỗ trợ nâng cấp **`Lv. 1 → Lv. 5`** (`baseCost = 12`, `upgradeCostMultiplier = 1.75`, cổng `Player Level >= 1 + currentLevel`) để mở rộng sức chứa dân làng **`2 × level`** (`Lv.1: 2` → `Lv.5: 10` dân). Không cộng `CoinBonus`.
    - `ECONOMY_EFFECT` (*Foraging Post* `baseCost = 15`, `mult = 1.6`, `+2%/cấp`, xây `1` dân / `60` phút; *Primitive Granary* `baseCost = 30`, `mult = 1.8`, `+3%/cấp`, xây `2` dân / `120` phút): hỗ trợ nâng cấp tới `maxLevel = 5` thông qua `UPGRADE_BUILDING`, nhân tỷ lệ `CoinBonus = rate × level` (chỉ tính sau khi job đặt/nâng hoàn tất; XP và Quests hoàn toàn không bị ảnh hưởng). Tổng chi phí xây + nâng cấp tối đa toàn bộ công trình Stone Age là **`3,907` Coins**.
    - **Công thức phí & Level gate nâng cấp (`L → L+1`, với `L = currentLevel`):** Chi phí gốc `round(baseCost × upgradeCostMultiplier^L)`; sau khi áp dụng giảm giá của **Trưởng lão (Elder)** (`-6%/người`, trần `-30%` tại `5` người, làm tròn `Math.round`, tối thiểu `1` Coin); yêu cầu `Player Level >= unlockRequirements.minPlayerLevel + L`. Việc nâng cấp tạo job cần `1` dân nếu `L <= 2`, `2` dân nếu `L >= 3`, thời lượng `5 × L` phút Focus (`5, 10, 15, 20` phút), cho phép xếp hàng trước nhiều cấp liên tiếp trên cùng công trình (chạy tuần tự `L -> L+1`).
    - **Công trình Xây dựng, Đội dân làng FIFO & Đếm ngược đến giây (`Milestone 5E-1`):**
      - 3 loại việc cần Focus & dân làng: Đặt mới (`place`), Nâng cấp (`upgrade`), Mở đất (`expand`). Tuyển dân vẫn tức thì.
      - **Hàng đợi FIFO, Giao việc Trước phiên & Đếm ngược đến giây (`Milestone 5E-1` + `5E-2`):** Các việc mới trả Coin ngay khi xếp hàng (`PENDING` → tự động cấp `ACTIVE` theo FIFO khi còn slot `< 4` và đủ dân rảnh). Trước khi bấm Bắt đầu trên tab Focus (`TimerView` IDLE), thẻ **Giao việc (`FocusJobAssignmentCard`)** cho phép chọn **Tự động** (mặc định FIFO) hoặc chọn thủ công tối đa `4` việc không vượt quá tổng dân và tuân thủ nâng cấp tuần tự cùng công trình, kèm tùy chọn *Tự động tiếp tục việc chờ* (`assignedJobIds`, `autoContinueJobs` trên `START_SESSION` / `SessionSnapshot`, kiểm tra nguyên tử qua `validateSessionJobAssignment`). Trên bản đồ (`MapGridView`), các việc hiển thị `ConstructionFence` 4 cọc gỗ + vải viền rìa trong suốt (`place`/`expand`), giàn gỗ `.fq-construction-scaffold` (`upgrade`), nhãn `"Đang đào"`/`"Đang dọn rừng"`, và đồng hồ pixel + đếm ngược `1s` thuần UI (**không còn biểu tượng dụng cụ lơ lửng trên Bản đồ**). Khi phiên Focus chạy (`FocusSceneArea`), `0` việc giữ cảnh trại nguyên bản, còn `1..4` việc `ACTIVE` chia thành `1..4` khung làm việc đều nhau hiển thị đúng số thợ thật không trùng lặp giữa các khung, sprite dựng khung/giàn gỗ/rừng, đồng hồ đếm ngược `1s`, và búa/rìu/cuốc chim **chỉ vung khi đang Focus (`working`) và không bật `prefers-reduced-motion`** (đứng yên khi `paused`, `resting` Pomodoro break hoặc `reducedMotion`). Dữ liệu `jobs` và `founderRole` backfill qua `v6_constructionJobsSchema.ts` (`CURRENT_SCHEMA_VERSION = 6`, `fq_civilization` giữ `schemaVersion = 2`). Công trình đang xây lần đầu không cho `CoinBonus`, không tính sức chứa tuyển dân, không mở `Focus Streak`, và không cho xếp hàng nâng cấp cho tới khi xây xong.
      - **Quyết toán theo giây Focus hợp lệ (`advanceJobs` / `assignJobsWithSchedule`):** Thời gian xây/nâng/mở đất lưu **số nguyên giây Focus**. Chỉ phiên Focus `COMPLETED` hợp lệ mới đẩy tiến độ `remainingSeconds` theo thứ tự ưu tiên `assignedJobIds` + `autoContinueJobs` (mang phần giây thừa sang job kế tiếp nếu `autoContinueJobs !== false`, bỏ qua an toàn việc đã hủy giữa phiên); `Give Up`, `INTERRUPTED` hay thời gian Break không đẩy tiến độ, đồng hồ hệ thống không bao giờ tạo tiến độ nền. Giao diện dùng `projectJobs` / `jobProjection.ts` chiếu đồng hồ `1s` thuần UI đồng bộ cùng lịch phiên đang chạy.
      - **Hủy việc (`CANCEL_CONSTRUCTION_JOB`):** Hoàn **`100%`** Coin nếu chưa tốn giây nào (`remainingSeconds === totalSeconds`), hoàn **`50%`** nếu đã làm `> 0s` (hủy nâng cấp bậc thấp kéo theo hủy nối tầng mọi nâng cấp bậc cao hơn đang chờ của cùng công trình).
    - **Giới hạn xây dựng — Build Limit:** Tối đa **`4`** công trình cho **mỗi loại** thuộc nhóm `ECONOMY_EFFECT` (`MAX_ECONOMY_EFFECT_BUILDINGS = 4`; trần `CoinBonus` công trình Thời đại Đồ Đá `+100%`, cộng với `+40%` từ 8 Crafter và `+10%` Đủ bộ 3 vai trò = **`+150%` trần lý thuyết**) và tối đa **`1`** *Rock Shelter* (`MAX_VILLAGE_CAVES = 1`); phá dỡ công trình giải phóng ngay slot của loại đó. Không giới hạn số công trình `DECORATIVE` hay *Elder's Hut*.
    - **Dân làng Khởi đầu (`Founder Villager`), Tuyển dân, Hoạt ảnh vào Hang (`5E-3`) & Buff Vai trò (`V2–V5.2` + `5E-1` + `5E-3`):** Ngay lần đầu mở Bản đồ khi chưa có dân sáng lập (`founderRole == null`), người chơi chọn **1 Dân làng khởi đầu miễn phí** (`SELECT_FOUNDER` via `FounderPickerModal`: `'crafter' | 'elder' | 'woodworker'`). Dân khởi đầu không tốn Coin, không chiếm sức chứa *Rock Shelter*, giúp có sẵn `1` thợ ngay từ đầu để mở khóa các công trình `1`-thợ đầu tiên, được tính vào số lượng dân của công thức chi phí tuyển thêm `Math.round(25 × 1.35^totalCount)` và xuất hiện trực tiếp trên bản đồ + `FocusSceneArea`. Tuyển dân thêm tại *Rock Shelter* (`RECRUIT_VILLAGER`, công thức `25 × 1.35^n`, trần tối đa `10` dân tuyển trong Hang Lv.5 + `1` Dân khởi đầu = `11` thợ tối đa) kích hoạt hoạt ảnh thuần UI đưa dân làng mới từ rìa rừng/đất mở (`walk-from-edge` hoặc `fade-in-settlement`/`doorway-settle` `<= 3000ms`, tối đa `3` luồng đồng thời, `0` ghi storage, tắt khi `prefers-reduced-motion`, không chạy với `SELECT_FOUNDER`) đi vào cửa Hang `(cave.x+1, cave.y+2)`. **Không có Passive Income, không nhân XP hay Quest**. Buff vai trò: **Crafter (`Thợ thủ công`)** `+5% CoinBonus/người` (trần `+40%` ở 8 người), **Woodworker (`Tiều phu`)** `-5% chi phí mở rộng đất/người` (trần `-40%` ở 8 người, giữ nguyên cổng Level `k+2`), **Elder (`Trưởng lão`)** `-6% chi phí nâng cấp công trình/người` (trần `-30%` ở 5 người, chỉ áp dụng khi nâng cấp — không giảm giá xây mới), và **Complete Tribe (`Đủ bộ 3 vai trò`)** `+10% CoinBonus` khi có tối thiểu 1 người mỗi vai trò.
    - **Hoàn tiền khi Phá dỡ (`50%`) & Chặn phá Hang còn dân:** Phá dỡ công trình hoàn trả nguyên tử **`50%`** (`BUILDING_DEMOLISH_REFUND_RATE = 0.5`) tổng số Focus Coins đã đầu tư thực tế (`baseCost + tổng phí nâng cấp 1..level-1` + các job chưa hoàn thành gắn với công trình) theo độ chính xác IEEE-754 đầy đủ. Riêng *Rock Shelter* bị **chặn phá dỡ (`CIV_CAVE_HAS_VILLAGERS`)** khi vẫn còn dân làng tuyển (`villagers.length > 0`).
    - **Luật Era thuần & Mục tiêu Stone → Bronze (`V5.2` + `5E-1` — CHƯA kích hoạt chuyển Era):** Bảng `ERA_LEVEL_RULES` định nghĩa trần nâng cấp theo kỷ nguyên (`5, 10, 15, 20, 30, 40, 50, 60`; 6 kỷ nguyên `IRON_AGE..INTERPLANETARY` mang cờ `provisional: true`), `entryFloor` của `BRONZE_AGE` là `5`, và bộ kiểm tra thuần `evaluateEraAdvance` đối chiếu đủ: tổng phút Focus `>= 500`, `Player Level >= 9`, phí `500` Coins (`feeCoins`), mở rộng đất hoàn thành `>= 3` chunk (`minLandExpansions = 3`), đủ cả 3 vai trò dân làng gồm cả Dân khởi đầu (`>= 1` Crafter, `>= 1` Elder, `>= 1` Woodworker), và mọi loại công trình Stone Age hoàn thành đạt mức sàn (`Campfire 1×L1`, `Totem 1×L1`, `Elder's Hut 1×L1`, `Rock Shelter 1×L5`, `Foraging Post 4×L5`, `Granary 4×L5` — tổng chi xây+nâng sàn `3,907 + 500 = 4,407` Coins; mô phỏng 5E-1 tính cả giây Focus thi công: 3h/ngày `6–8` ngày, 2h/ngày `9–10` ngày, 1,5h/ngày `14` ngày, 1h/ngày `18` ngày). Logic chuyển đổi kỷ nguyên (`era` chuyển sang `BRONZE_AGE`, trừ `500` Coins, UI nâng Era) **chưa kích hoạt** và thuộc **Giai đoạn 5C-2**.

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
- **Pomodoro Stopwatch gián đoạn:** Khi đóng/mở lại trình duyệt (`BROWSER_CLOSED`), bảo toàn và trao thưởng cho các focus intervals đã hoàn thành trọn vẹn (`completedFocusCount >= 1`), không thưởng cho interval đang dở dang và ghi toàn bộ số phút hợp lệ vào thống kê ngày; nếu bị tắt/tải lại extension (`EXTENSION_DISABLED` / `EXTENSION_RELOADED`), nhận 0 Coins và 0 XP (khớp đồng bộ với màn hình kết thúc trên `TimerView` via `getSessionRewardPreview` hiển thị `+0` và thông báo hủy thưởng) nhưng vẫn ghi nhận số phút tập trung hợp lệ.
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
- **Kênh thông báo hệ thống (Bilingual EN/VI — 7 nhánh):** Sử dụng **Chrome Notification** hệ thống cho mốc hoàn thành `COUNTDOWN`, `STOPWATCH` (`>= 5` phút), `POMODORO_COUNTDOWN` 100%, chuyển sang `SHORT_BREAK` / `LONG_BREAK`, hết giờ nghỉ quay lại Focus (`BREAK_ENDED`), và nghỉ/kết thúc `POMODORO_STOPWATCH`; định dạng số Coin/XP qua `formatSessionNotificationContent` (half-up tối đa 2 chữ số thập phân), tự động chọn ngôn ngữ theo `settings.language` hoặc locale trình duyệt và tôn trọng `settings.notificationsEnabled`.
- **Hiệu ứng âm thanh (Web Audio API):**
  - Sử dụng Web Audio API (bộ dao động tổng hợp âm thanh không phụ thuộc file ngoài) để phát tiếng chuông báo khi bắt đầu phiên Focus hoặc khi chuyển sang Break (bật/tắt qua `chimeEnabled`, mặc định bật).
  - Âm thanh chỉ phát khi cửa sổ popup của extension đang mở.
  - **Xử lý lỗi âm thanh:** Nếu AudioContext không khả dụng, bị chặn bởi autoplay policy hoặc gặp lỗi thiết bị, lỗi chỉ được bỏ qua êm (graceful fallback) và **tuyệt đối không làm sai lệch** trạng thái phiên, chu kỳ Pomodoro hay phần thưởng của người dùng.
- **Xử lý sự cố quyền thông báo:** Nếu người dùng từ chối quyền hoặc Chrome Notification bị lỗi, sự cố này chỉ được ghi log và **tuyệt đối không làm sai lệch** trạng thái hoàn thành hay phần thưởng của phiên.

---

## 12. Phong cách & Kiến trúc Giao diện (UI Architecture)
- **Công nghệ UI:** **React 19 + Tailwind CSS 4** cho Popup (`index.html`), Blocked Page (`blocked.html` + module `blocked.js` tuân thủ CSP MV3) và Chrome `_locales` (`en`, `vi`).
- **Điều hướng & Song ngữ:** Thanh điều hướng đáy 5 tab cố định (`Quests | Focus | Map | Awards | Stats`), mặc định mở màn hình bản đồ `Map` ở giữa; song ngữ 100% EN/VI trên UI (`753` khóa parity), `130` mã lỗi có cấu trúc (`AppError` / `errorTranslator.ts`), `RewardHelpModal` đọc động công thức/`CoinBonus`/buff dân làng/settlement/precision, thông báo Chrome, và trang chặn `blocked.html`. Toàn bộ 5 tab (`Quests` ở 5c/5D-1, `Stats` ở 5c, `Focus` & `Map` ở 5E-1/5E-2/5E-3, và **`Awards` ở 5D-2**) đã hoạt động đầy đủ không còn màn giữ chỗ `"Coming soon"`.
- **Ranh giới:** UI là view/controller mỏng; **tuyệt đối không trực tiếp quyết định thời gian tập trung chính thức hoặc tự trao Coins/XP**.

---

## 13. Hệ thống Nhiệm vụ Hàng ngày & Hàng tuần (Quest Pool — Stages 2b, 5c, 6–7 & Milestone 5D-1)
> **Trạng thái tích hợp:** Nền tảng **Milestone 5B.5** (domain thuần `src/core/quests/`, `QuestCoordinator`, `QuestView`, badge `Navbar`) đã được nâng cấp ở **Milestone 5D-1 (`Quest Pool`, `CURRENT_QUEST_STATE_VERSION = 2` tại schema v5; hiện repo dùng `CURRENT_SCHEMA_VERSION = 7` với `v7_awardsSchema.ts` cho 5D-2)** để mỗi kỳ (`00:00` Daily / `00:00` Thứ Hai Weekly) chọn ngẫu nhiên xác định 1 nhiệm vụ mỗi khe từ pool `19` nhiệm vụ trong khi **giữ nguyên bất biến 100% trần thưởng (`40C·100XP` Daily / `150C·370XP` Weekly)**. Phần thưởng khi Claim chỉ cộng phẳng Coins/XP vào `ECONOMY` (dùng đúng `calculatePlayerLevel`, **không ghi vào `fq_daily_stats`**). **Giai đoạn `5C-2` (Bronze Age)** tạm hoãn chờ asset.

- **Cơ chế 3 Khe & Quest Pool Hàng ngày (Daily Pool — `9` nhiệm vụ, Cap cố định `40 Coins · 100 XP / ngày`):**
  - **Khe A — Khởi động (`10 Coins · 25 XP`):**
    1. `daily_first_spark` (*First Spark*): Hoàn thành `1` phiên Focus hợp lệ (giữ legacy).
    2. `daily_warm_up` (*Warm Up*): Hoàn thành `1` phiên Focus `>= 25` phút.
    3. `daily_quick_start` (*Quick Start*): Tích lũy `25` phút Focus trong ngày.
  - **Khe B — Nhịp độ (`15 Coins · 35 XP`):**
    1. `daily_steady_rhythm` (*Steady Rhythm*): Tích lũy `60` phút Focus trong ngày (giữ legacy).
    2. `daily_forty_five` (*Solid Block*): Tích lũy `45` phút Focus trong ngày.
    3. `daily_deep_hour` (*Full Hour*): Hoàn thành `1` phiên Focus `>= 60` phút *(thay cho đề xuất `2×30m` để bảo đảm hồ sơ `1×60m`/ngày hoàn thành được 100% Khe A & B)*.
  - **Khe C — Thử thách (`15 Coins · 40 XP`):**
    1. `daily_double_tap` (*Double Tap*): Hoàn thành `2` phiên Focus hợp lệ trong ngày (giữ legacy).
    2. `daily_deep_dive` (*Deep Dive*): Hoàn thành `1` phiên Focus `>= 45` phút.
    3. `daily_pomodoro_pair` (*Pomodoro Pair*): Hoàn thành `>= 2` chu kỳ Focus của chế độ Pomodoro trong ngày (`POMODORO_FOCUS_INTERVALS`; **không** đếm interval dở dang của Pomodoro Stopwatch).
- **Cơ chế 3 Khe & Quest Pool Hàng tuần (Weekly Pool — `10` nhiệm vụ, Cap cố định `150 Coins · 370 XP / tuần`):**
  - **Khe A — Đều đặn (`50 Coins · 120 XP`):**
    1. `weekly_habit_builder` (*Habit Builder*): Tập trung trên `4` ngày phân biệt trong tuần (giữ legacy).
    2. `weekly_five_days` (*Five-Day Streak*): Tập trung trên `5` ngày phân biệt trong tuần.
    3. `weekly_three_days` (*Steady Trio*): Đạt tối thiểu `25` phút Focus mỗi ngày trên `3` ngày phân biệt trong tuần (`minDailyMinutes: 25`, theo dõi qua `weeklyDailyMinutes`).
  - **Khe B — Chiều sâu (`60 Coins · 150 XP`):**
    1. `weekly_deep_diver` (*Deep Diver*): Hoàn thành `3` phiên sâu `>= 45` phút (giữ legacy).
    2. `weekly_two_long_60` (*Long-Form Pairs*): Hoàn thành `2` phiên dài `>= 60` phút.
    3. `weekly_five_half_hour` (*Five Blocks*): Hoàn thành `5` phiên `>= 30` phút.
  - **Khe C — Khối lượng (`40 Coins · 100 XP`):**
    1. `weekly_tenacity_10` (*Weekly Tenacity*): Hoàn thành `10` phiên Focus hợp lệ (giữ legacy; gắn nhãn `difficulty: 'hard'` — hồ sơ `1×60m/ngày` đạt tối đa 7 phiên/tuần).
    2. `weekly_six_sessions` (*Steady Six*): Hoàn thành `6` phiên Focus hợp lệ (`standard`).
    3. `weekly_seven_sessions` (*Full-Week Seven*): Hoàn thành `7` phiên Focus hợp lệ (`standard`).
    4. `weekly_three_hundred_minutes` (*300-Minute Mark*): Tích lũy `300` phút Focus trong tuần (`standard`).
- **Quy tắc Chọn ngẫu nhiên, Chống Reroll & Bảo vệ Kinh tế (`5D-1`):**
  - **Xác định theo Seed & Chống lặp liên tiếp:** `selectQuestsForPeriod(period, periodKey, salt, previousSelection)` dùng hàm băm FNV-1a + Murmur3 thuần (`hashQuestSeed`, `0` lời gọi `Date.now()` / `Math.random()`) trên `(salt, period, periodKey, slot)` để chọn đúng 1 nhiệm vụ mỗi khe và loại nhiệm vụ kỳ trước nếu khe có `>= 2` lựa chọn. Không đổi/reroll giữa kỳ khi Service Worker khởi động lại hoặc đồng hồ lùi, **không có nút Reroll cho người dùng**, và không dùng nhiệm vụ theo khung giờ trong ngày hay lịch sử web.
  - **Migration Schema v4 → v5 (`v5_questPoolSchema.ts`):** Sinh `salt` cho người dùng nâng cấp, giữ nguyên nguyên vẹn bộ 3+3 nhiệm vụ legacy đang chạy dở giữa ngày/tuần (tiến độ, claim, ledger, streak) và bắt đầu xoay sang Quest Pool ở lần rollover `00:00` / Thứ Hai tiếp theo.
  - **Thưởng cố định (Flat Rewards) & Manual Claim:** Thưởng Quest không nhân với Session Multiplier hay Civilization `CoinBonus`; người dùng bấm nhận thủ công và phần thưởng chưa nhận sẽ hết hạn khi rollover qua `00:00` (Daily) hoặc `00:00` Thứ Hai (Weekly).
  - **All-or-Nothing Session Eligibility (`toQuestOutcomeDelta`):** Chỉ phiên `COMPLETED` mới cộng tiến độ Quest (Countdown / Pomodoro Countdown Give Up hoặc `INTERRUPTED` = `0`; Stopwatch `< 5 phút` hoặc `INTERRUPTED` = `0`; Pomodoro Stopwatch chỉ tính `completedFocusCount` đã xong trọn vẹn và `completedFocusCount × intervalDuration`, **không** cộng interval đang dở dang).
  - **Streak & Chống tua đồng hồ (Anti-Clock-Rollback):** Chuỗi ngày tập trung (`currentDays`, `longestDays`) chỉ tăng khi hoàn thành phiên ở ngày mới kế tiếp (nhiều phiên cùng ngày giữ nguyên, gián đoạn >= 2 ngày reset về `1`) và **không sinh Coin thụ động**; hệ thống lưu `lastSettledTimestamp`, `processedPeriodKeys` và `recentClaimedKeys` (ring buffer tối đa `14` mục) để chặn reset ngoài ý muốn hoặc claim trùng khi đồng hồ hệ thống lùi lại.

---

## 14. Hệ thống Thành tựu (`Awards` — Milestone 5D-2)
- **Mục tiêu & Quy tắc Kinh tế:** Tab `Awards` ghi nhận vĩnh viễn các cột mốc nỗ lực thực tế của người chơi thông qua **`13` thành tựu Thời đại Đồ Đá** (`STONE_AGE_AWARDS_CATALOG`: 3 nhóm `focus` [4 mục], `quests` [2 mục], `civilization` [7 mục]; `11` thành tựu 5 bậc `I–V` + `2` thành tựu 1 bậc `tribe_complete` & `era_ready`). Hệ thống Awards trao **`0` Coins, `0` XP, `0` thu nhập thụ động**, không lore/chữ kể chuyện và không tạo file ảnh nhị phân mới (dùng lại sprite sheets CC0 & `clock_tiles_16.png`).
- **Mở khóa Vĩnh viễn một chiều & Đồng bộ Lịch sử (`fq_awards`, Schema v7):** Bậc thành tựu đã mở (`unlockedAt`, `seen`) được bảo toàn vĩnh viễn ngay cả khi người chơi phá hủy công trình về sau. Migration `v7_awardsSchema.ts` tự động đánh giá lại lịch sử `Economy`, `DailyStats`, `Quests`, `Civilization` và gắn `seen: true` cho các bậc sẵn có; mọi bậc mới mở trong phiên chạy về sau hiện huy hiệu chưa xem trên `Navbar` (`awards-unseen-badge`), toast thông báo nhẹ trong popup và tự đánh dấu đã xem (`MARK_AWARDS_SEEN`) khi mở tab `Awards` (`AwardsView.tsx` + `AwardDetailsModal.tsx`).
