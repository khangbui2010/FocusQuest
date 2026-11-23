# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 5b: START FOCUS & PROFILE BOTTOM SHEET

**Ngày hoàn thành:** 14/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 5b** theo thứ tự lộ trình cập nhật (`1a → 5a → 5b → 4 → 1b → 3 → 2a → 2b → 5c → 6 → 7`) và điều chỉnh bổ sung **ĐC-7** trong `respond_plan_5B.5.md`.

---

## 1. Tóm tắt
- Đã sao lưu báo cáo Giai đoạn 5a sang `respond_phase5a_report.md` và bổ sung **ĐC-7** vào `respond_plan_5B.5.md` (`RewardHelpModal` chuyển sang Giai đoạn 6; script `"test"` trong `package.json` dùng glob `__tests__/ui/*.test.ts`).
- **Làm mới màn Start Focus (`TimerView.tsx` + `DurationPresetChips.tsx`):**
  - Thực hiện chỉnh sửa cục bộ bằng `multi_replace_file_content` (từ `1,499` → `1,596` dòng, giữ nguyên 100% logic đếm ngược, stopwatch, Pomodoro state machine, pause 2×5m, auto-resume, crash recovery, công thức Coins/XP, polling và chuông Web Audio `chimeEnabled`).
  - Giữ đúng 3 tab chế độ `Countdown | Stopwatch | Pomodoro`; ở Countdown bổ sung hàng chip chọn nhanh `15m / 25m / 45m / 60m` (`DurationPresetChips.tsx`) đồng bộ hai chiều với cụm stepper `HH:MM` (5m–180m) và khối `"Target Rewards"`.
  - Đồng bộ hóa i18n toàn bộ nhãn Setup / Active / Modal / Outcome qua `t()` với 100% parity `EN`/`VI` (`178/178` keys), riêng `"Total Reward:"` và `"Accumulated Reward:"` giữ nguyên chuỗi tiếng Anh ở bản `en`.
  - Đổi thuật ngữ phiên tập trung từ `"Quest"` sang `"Focus Session"` / `"Session"` (`START FOCUS SESSION`, `START POMODORO SESSION`, `Focus Session Completed!`, `Session Ended`, `Finish Session & Claim Reward`, `Give Up Session`, `Give up this focus session?`, `Start New Session`), đồng thời giữ nguyên tên sản phẩm `"Focus Quest"` và toàn bộ định danh/key nội bộ.
  - Thẻ Active Profile hiển thị gọn số domain cho phép (`N domains allowed` / `0 domains allowed (Strict block)`) cùng nút `"Edit Profiles"` mở `ProfileBottomSheet`; khi phiên `RUNNING` hoặc `PAUSED`, nút `"Edit Profiles"` bị vô hiệu hóa (`disabled`) kèm giải thích khóa rõ ràng (`"Locked during an active focus session."`) và **không có nút mở khóa vượt rào**.
- **Tạo `ProfileBottomSheet.tsx` & bỏ lối vào tạm `ProfileAllowlistView.tsx`:**
  - Bottom sheet (~85% popup, `max-w-[400px]`, đóng bằng `✕`, click nền mờ, hoặc phím `Esc`) hỗ trợ đầy đủ **Switch / Create / Inline Rename / Delete có xác nhận 2 bước / Add & Remove Allowed Domains**, tái sử dụng `DomainNormalizer.validateAllowlistPattern`, hiển thị lỗi backend nguyên văn và tự động dọn form nháp khi phiên kích hoạt.
  - Gỡ bỏ sub-view `'profiles'` và import `ProfileAllowlistView` khỏi `App.tsx`, xóa `src/ui/components/ProfileAllowlistView.tsx`; huy hiệu khiên trên Header điều hướng về tab `'focus'`, nút `"Edit Profiles"` mở `ProfileBottomSheet` đè trên popup; các handler profile trong `App.tsx` ném lỗi khi `!res.success` để `ProfileBottomSheet` hiển thị đúng lỗi backend.
- **Đồng bộ Simulator (`src/ui/services/extensionClient.ts`):**
  - Bổ sung 3 cases còn thiếu cho Stage 5b: `GET_ACTIVE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE`, đồng thời chuẩn hóa lại rule validation/allowlist của `CREATE_PROFILE`, `ADD_DOMAIN`, `REMOVE_DOMAIN` khớp với `ProfileManager` & `DomainNormalizer`.

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (5 files)
1. `respond_phase5a_report.md` — Bản lưu giữ báo cáo Giai đoạn 5a trước khi triển khai 5b.
2. `src/ui/components/DurationPresetChips.tsx` — Component chip chọn nhanh thời lượng (`15m`, `25m`, `45m`, `60m`) có `aria-pressed` và i18n.
3. `src/ui/components/ProfileBottomSheet.tsx` — Bottom sheet quản lý Focus Profiles (CRUD đầy đủ + 2-step delete + Allowed Domains + strict session lock).
4. `__tests__/ui/profileBottomSheet.test.ts` — 8 unit tests kiểm tra render đóng/mở, strict lock, chặn xóa profile cuối cùng, trạng thái rỗng/đang tải, lỗi backend/wildcard, tiếng Việt `VI`, và đối chiếu rule `ProfileManager`.
5. `__tests__/ui/startFocusView.test.ts` — 6 unit tests kiểm tra 3 tab chế độ + preset chips `15m/25m/45m/60m` + stepper, Active Profile + `Edit Profiles`, sạch thuật ngữ `Quest` trong các màn timer, khóa `Edit Profiles` khi `RUNNING`/`PAUSED`, giữ chuẩn tiếng Anh `"Total Reward:"`/`"Accumulated Reward:"` và dịch `VI`.

### File chỉnh sửa (8 files)
1. `respond_plan_5B.5.md` — Bổ sung **ĐC-7** (dời i18n `RewardHelpModal` sang Giai đoạn 6; glob `__tests__/ui/*.test.ts` trong `package.json`).
2. `package.json` — Đổi danh sách file test UI rời rạc sang glob `__tests__/ui/*.test.ts` trong script `"test"`.
3. `src/i18n/locales/en.ts` — Bổ sung toàn bộ khóa `profiles.*` và `timer.*` (178 keys).
4. `src/i18n/locales/vi.ts` — Bổ sung bản dịch tiếng Việt tương ứng, khớp 100% 178 keys với `en.ts`.
5. `src/ui/services/extensionClient.ts` — Bổ sung `GET_ACTIVE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE` và đồng bộ rule `ProfileManager`/`DomainNormalizer` cho `CREATE_PROFILE`/`ADD_DOMAIN`/`REMOVE_DOMAIN`.
6. `src/ui/components/TimerView.tsx` — Chỉnh sửa cục bộ (từ `1,499` → `1,596` dòng, `+97` dòng ròng) để gắn `DurationPresetChips`, đồng bộ `t()` i18n, đổi `"Quest"` → `"Focus Session"`, đổi `"Change"` → `"Edit Profiles"`, và thêm dải khóa `Edit Profiles` ở `STATE 2` (`RUNNING`/`PAUSED`).
7. `src/App.tsx` — Bỏ `ProfileAllowlistView` & sub-view `'profiles'`, nối `ProfileBottomSheet`, nối `handleRenameProfile`/`handleDeleteProfile` và truyền lỗi `!res.success` ra UI, trỏ Header shield sang `'focus'`.
8. `__tests__/ui/extensionClient.test.ts` — Bổ sung 1 test toàn diện cho `GET_ACTIVE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE` (bao gồm validation lỗi và khóa active session).

### File xóa (1 file)
1. `src/ui/components/ProfileAllowlistView.tsx` — Đã gỡ bỏ hoàn toàn lối vào tạm sau khi `ProfileBottomSheet` thay thế trực tiếp (đã xác minh bằng `grep` không còn import nào tồn tại).

---

## 3. Bảng So sánh Baseline vs Sau Giai đoạn 5b

| Hạng mục | Baseline (sau 5a) | Sau Giai đoạn 5b | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **396 / 396 PASS** (`0` fail) | **411 / 411 PASS** (`0` fail, `0` cancelled, `0` skipped, ~22.87s) | **+15 tests mới** (`+8` `profileBottomSheet`, `+6` `startFocusView`, `+1` `extensionClient`), **0 test cũ bị sửa assertion** |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Không lỗi TypeScript |
| `npm run clean && npm run build` | **PASS** (`955ms`) | **PASS** (`995ms`, 1,715 modules) | Build sạch sẽ |
| `dist/background.js` | `77.67 kB` (gzip `16.84 kB`) | `77.67 kB` (gzip `16.83 kB`) | Không thay đổi logic background |
| `dist/assets/popup-*.js` | `608.59 kB` (gzip `163.60 kB`) | `625.30 kB` (gzip `165.89 kB`) | `+16.71 kB` (`+2.29 kB` gzip) từ `ProfileBottomSheet`, `DurationPresetChips` và từ điển i18n `TimerView`/`Profiles` |
| `dist/assets/popup-*.css` | `58.70 kB` (gzip `9.52 kB`) | `60.71 kB` (gzip `9.75 kB`) | `+2.01 kB` (`+0.23 kB` gzip) |
| `dist/assets/domainNormalizer-*.js` | `26.25 kB` (gzip `8.42 kB`) | `43.85 kB` (gzip `12.98 kB`) | Chunk chia sẻ tăng do gom phần tham chiếu chung giữa `ProfileBottomSheet` và build graph |
| `dist/index.html` | `0.63 kB` | `0.63 kB` (gzip `0.38 kB`) | Không đổi |

---

## 4. Wireframe ASCII Thực tế Đã Triển khai

### 4.1. `Start Focus` — Trạng thái Idle (`Countdown`)
```text
┌────────────────────────────────────────────────────────┐
│ [  Countdown  |  Stopwatch  |  Pomodoro  ]        [🔔] │
│ Duration                                  Reward: 1.2x │
│ Quick Presets                                          │
│ [ 15m ]    [ 25m * ]    [ 45m ]    [ 60m ]             │
│ ┌────────────────────────────────────────────────────┐ │
│ │       [ ^ ]              [ ^ ]                     │ │
│ │        00        :        25                       │ │
│ │       [ v ]              [ v ]                     │ │
│ │ HOURS: ±1h · MINUTES: ±5m (Min: 00:05 · Max: 03:00)│ │
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Target Rewards      🪙 +37.5 (+N%)   🏅 +125       │ │
│ └────────────────────────────────────────────────────┘ │
│ Active Profile                         [Edit Profiles] │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🛡 Study & Research               2 domains allowed│ │
│ └────────────────────────────────────────────────────┘ │
│ [               ▶ START FOCUS SESSION                ] │
└────────────────────────────────────────────────────────┘
```

### 4.2. `Start Focus` — Trạng thái Đang chạy / Tạm dừng (`RUNNING` / `PAUSED`)
```text
┌────────────────────────────────────────────────────────┐
│            ● FOCUSING / PAUSED · COUNTDOWN             │
│                       24 : 58                          │
│         Total Reward: / Accumulated Reward: ...        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🛡 Study & Research        Edit Profiles (disabled)│ │
│ └────────────────────────────────────────────────────┘ │
│       Locked during an active focus session.           │
│ [    ⏸ Pause (2 left) / ▶ Resume Focus               ] │
│ [                 Give Up Session                    ] │
└────────────────────────────────────────────────────────┘
```

### 4.3. `ProfileBottomSheet` (Đè 85% Popup, `Esc` / click backdrop / `[✕]` để đóng)
```text
┌────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░ (Backdrop mờ) ░░░░░░░░░░░░░░░░░░░░░░ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🛡 Focus Profiles & Allowlist                  [✕] │ │
│ │ [Banner Amber khóa cứng nếu isSessionActive]       │ │
│ │ [Alert Rose hiển thị nguyên văn lỗi backend]       │ │
│ │ Focus Profiles & Allowlist          [+ New Profile]│ │
│ │ ● Study & Research [Active]      [✎] [🗑(disabled)]│ │
│ │ ○ Deep Work / Coding        [Use] [✎] [🗑 -> 2-step]│ │
│ │ ────────────────────────────────────────────────── │ │
│ │ ✓ Allowed Domains · Study & Research (2)           │ │
│ │ [ e.g. wikipedia.org, *.github.com       ] [ + Add]│ │
│ │ ┌────────────────────────────────────────────────┐ │ │
│ │ │ github.com                                 [🗑]│ │ │
│ │ │ wikipedia.org                              [🗑]│ │ │
│ │ └────────────────────────────────────────────────┘ │ │
│ │ ℹ Tip: Subdomains allowed; *.com rejected.         │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 5. Bảng Luật Profile Backend (`ProfileManager` / `MessageHandler`) mà UI + Simulator Phản ánh

| Luật / Ràng buộc | `ProfileManager` / `MessageHandler` (Backend thật) | `extensionClient` (Simulator) & `ProfileBottomSheet` (UI) |
|---|---|---|
| Khóa khi chạy phiên (`RUNNING` / `PAUSED`) | Từ chối `SWITCH_PROFILE`, `CREATE_PROFILE`, `RENAME_PROFILE`, `DELETE_PROFILE`, `ADD_DOMAIN`, `REMOVE_DOMAIN` với thông báo lỗi chuẩn | Simulator trả đúng chuỗi lỗi; `TimerView` & `ProfileBottomSheet` `disabled` toàn bộ nút/input, dọn nháp (`showCreateForm`, `renamingId`, `confirmDeleteId`), không có nút bypass |
| Tên Profile hợp lệ | `trim()`, không rỗng (`"Profile name cannot be empty or whitespace."`), tối đa `50` ký tự (`"Profile name cannot exceed 50 characters."`) | `ProfileBottomSheet` giới hạn `maxLength={50}` + chặn rỗng; simulator kiểm tra đúng 2 ngưỡng & error message |
| Tên Profile duy nhất | So khớp không phân biệt hoa/thường (`p.name.trim().toLowerCase()`), loại trừ chính `profileId` khi rename | Simulator kiểm tra trùng `toLowerCase()` cho cả `CREATE_PROFILE` & `RENAME_PROFILE` và trả lỗi `"A profile with the name '...' already exists."` |
| Xóa Profile cuối cùng | Từ chối nếu `profiles.length <= 1` (`"Cannot delete the only remaining profile in the system."`) | UI disable nút Delete kèm nhãn/tooltip giải thích; simulator trả đúng chuỗi lỗi |
| Xóa Profile đang Active | Dùng `replacementActiveProfileId` (nếu hợp lệ) hoặc tự chuyển `activeProfileId` sang profile còn lại đầu tiên (`remainingProfiles[0]`), trả `{ deletedProfile, newActiveProfileId }` | Simulator thực hiện fallback y hệt và trả đúng `{ deletedProfile, newActiveProfileId }`; UI hiển thị ghi chú ở bước xác nhận 2 bước |
| Chuẩn hóa & chặn wildcard Allowlist | Dùng `DomainNormalizer.validateAllowlistPattern` (bóc `https://`, path, port, chặn `*` / `*.com`, chống trùng lowercase) | `ProfileBottomSheet` gọi trực tiếp `DomainNormalizer.validateAllowlistPattern`; simulator gọi trực tiếp `DomainNormalizer.validateAllowlistPattern` & `normalizeHostname` |

---

## 6. Xác nhận Ràng buộc & Những gì Cố ý Không Làm trong 5b
- **Không** sửa assertion của bất kỳ test nào trong 396 test sẵn có.
- **Không** bắt đầu **Giai đoạn 4** (`spriteRegistry` / pixel-art SVG), **Giai đoạn 1b** (`blocked.ts`, `public/_locales`, `public/manifest.json`, `vite.config.ts`), **Giai đoạn 3** (`statsAggregator`, `GET_DAILY_STATS`), **Giai đoạn 2a/2b** (Quest schema v3/engine), **Giai đoạn 5c** (`QuestView`/`StatsView`), hoặc **Giai đoạn 6** (`RewardHelpModal` i18n, Chrome Notification i18n).
- **Không** cài thêm bất kỳ dependency nào và **không** viết lại `TimerView.tsx` từ đầu.

---

## 7. Phát hiện thêm hoặc Mâu thuẫn
1. **`ActiveTab` union trong `Navbar.tsx` vs `navigationRedesign.test.ts:191`:** Đã giữ nguyên giá trị `'profiles'` trong kiểu `export type ActiveTab = 'home' | 'quest' | 'focus' | 'stats' | 'profiles'` ở `Navbar.tsx` (dù `App.tsx` không còn render màn `'profiles'`) để không phải chạm tới `__tests__/ui/navigationRedesign.test.ts:191` đang pass. Có thể thu gọn thành `'home' | 'quest' | 'focus' | 'stats'` ở đợt dọn test Giai đoạn 6 nếu người dùng cho phép.
2. **Shape trả về của `DELETE_PROFILE`:** `MessageHandler` + `ProfileManager` trả `{ deletedProfile, newActiveProfileId }`. Simulator `extensionClient.ts` đã bám sát 100% shape này, và `App.tsx` gọi `await refreshState()` ngay sau mỗi mutation để đồng bộ lại toàn bộ danh sách `profiles` và `activeProfile`.

---

## 8. Hạn chế
- Bộ test UI mới (`profileBottomSheet.test.ts`, `startFocusView.test.ts`) chạy qua React SSR (`renderToString`) và kiểm thử handler trong `Node.js` — chưa kiểm tra thao tác bấm chuột/gõ bàn phím/`Esc`/scroll trực tiếp trong Chrome Extension unpacked thật.
- Cảnh báo Vite chunk `popup-*.js > 500 kB` vẫn giữ nguyên theo quyết định hoãn `manualChunks` trong kế hoạch.

---

## 9. Đề xuất Bước Kế tiếp
- Thực hiện **Giai đoạn 4** theo lộ trình ĐC-5: xây dựng `src/ui/components/civilization/spriteRegistry.ts` (pixel-art SVG tự sở hữu cho 6 công trình Stone Age + tile nền) và tích hợp vào `MapGridView.tsx`, `BuildingCatalogPanel.tsx`, `BuildingDetailsModal.tsx`, giữ nguyên 100% logic placement/pan/zoom/demolish/khóa `"Milestone 5C"`.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 4
