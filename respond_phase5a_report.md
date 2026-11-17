# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 5a: ĐIỀU HƯỚNG 3 TAB ĐÁY, HEADER GỌN & HOME BẢN ĐỒ

**Ngày hoàn thành:** 14/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 5a** theo thứ tự lộ trình cập nhật (`1a → 5a → 5b → 4 → 1b → 3 → 2a → 2b → 5c → 6 → 7`) và các điều chỉnh bổ sung **ĐC-5, ĐC-6** trong `respond_plan_5B.5.md`.

---

## 1. Tóm tắt
- Đã sao lưu báo cáo Giai đoạn 1a sang `respond_phase1a_report.md` và cập nhật `respond_plan_5B.5.md` với mục **ĐIỀU CHỈNH BỔ SUNG (ĐC-5 & ĐC-6)** và lộ trình mới trong Mục J.
- Đã chuyển **Home mặc định** (`activeTab = 'home'`) trong `App.tsx` sang **Your Civilization**, hiển thị ngay tiêu đề tĩnh `"Your Civilization"` (độc lập khỏi trạng thái tải async của `CivilizationScreen`) cùng đầy đủ bản đồ `CivilizationScreen` giữ nguyên (`Build`, `Expand`, đặt/xóa công trình, pan/zoom/`Recenter`, nút Upgrade khóa `"Milestone 5C"`).
- Đã tái cấu trúc `Navbar.tsx` thành **thanh điều hướng đáy 3 tab** (`Quest | Start Focus | Stats`, chiều cao cố định `58px`):
  - Tab giữa `Start Focus` là nút CTA nổi bật; khi phiên đang chạy (`RUNNING`/`PAUSED`/break) hiển thị chấm trạng thái (`bg-emerald-400` / `bg-amber-400` / `bg-cyan-300`) + nhãn ngắn i18n (`Focus` / `Paused` / `Rest`).
  - Chạm lại đúng tab đáy đang active sẽ quay về `'home'`. Tab `Quest` ở 5a chưa gắn huy hiệu `"chưa nhận"` (dành cho 5c).
- Đã làm gọn `Header.tsx` (~56px, 2 hàng, **không có icon bánh răng**):
  - Hàng 1: `[FQ] FOCUS QUEST` (nhấn để về `'home'`) + badge Era lấy từ `CivilizationState` (mặc định `Stone Age`) | Coins | `Lv. X` | `?` (giữ `data-testid="help-btn"`) | nút chuyển ngôn ngữ 1-chạm `EN | VI` (gọi `SET_LANGUAGE` qua `I18nProvider`).
  - Hàng 2: nút `← Map` khi đang ở tab con (`quest`, `focus`, `stats`, `profiles`), thanh XP mảnh, và huy hiệu khiên gọn + tên Profile chỉ hiện khi phiên/chặn web đang chạy (`isSessionActive || isBlockingActive`). Khi idle, nút Active Profile đã được rút khỏi Header; `HeaderProps` giữ nguyên các prop cũ ở mức optional để tương thích ngược hoàn toàn với `rewardHelpModal.test.ts`.
- Đã giữ lối vào tạm thời cho:
  - Tab `Quest`: khung tạm có tiêu đề `Daily & Weekly Quests` + `Coming soon` qua `t()`.
  - Tab `Start Focus`: giữ nguyên `TimerView` cũ; bấm `Change` (hoặc huy hiệu khiên trên Header khi đang chạy) mở `ProfileAllowlistView` ở sub-view `'profiles'` (không nằm trên bottom nav) kèm thanh `← Back to Focus` để toàn bộ tính năng Profile/Allowlist hiện có vẫn truy cập được trước Giai đoạn 5b.
  - Tab `Stats`: giữ nguyên `StatsView` cũ.

---

## 2. Sơ đồ Khung Popup & Phân bổ Chiều cao (400×580..600px)

```text
┌────────────────────────────────────────────────────────┐ 400px width
│ [FQ] FOCUS QUEST [Stone Age]   🪙120 Lv.3 [?] [EN|VI]  │ ← Compact Header (~56px)
│ (← Map nếu off-home)  XP ████████░░░░ 150/300 (🛡Pro) │
├────────────────────────────────────────────────────────┤
│ Your Civilization                                      │ ← Home Static Header (~29px)
│ Stone Age · +0% · 0m                  [Expand] [Build] │ ← CivilizationHeader (~52px)
│ ┌────────────────────────────────────────────────────┐ │
│ │  4 Chunks · 0 Buildings                            │ │
│ │                  (Interactive Grid Map)            │ │ ← MapGridView (~385px–405px)
│ │                                 [-][100%][+][Rec.] │ │   (Bottom Nav nằm dưới flex,
│ └────────────────────────────────────────────────────┘ │    không che mất control zoom)
├────────────────────────────────────────────────────────┤
│  [📜 Quest]       [ ▶ Start Focus ]       [📊 Stats]   │ ← Bottom Navbar (58px, shrink-0)
└────────────────────────────────────────────────────────┘ 580–600px height
```

- **Kiểm tra tràn khung:** Popup `w-[400px] min-h-[580px] max-h-[600px] flex flex-col overflow-hidden`. Tổng phần cố định khi ở Home = `56px` (Header) + `29px` (Home title) + `58px` (Bottom Navbar) = `143px`; phần bản đồ (`CivilizationScreen` `flex-1 min-h-0`) nhận `437px–457px`. Vì `Navbar` đặt trong cột flex `shrink-0` ở đáy (không `position: fixed` đè lên map), cụm zoom/`Recenter` ở `bottom-2.5 right-2.5` của `MapGridView` luôn nằm hoàn toàn phía trên thanh điều hướng. Ở các sub-view (`quest`, `focus`, `stats`, `profiles`), vùng `main` dùng `overflow-y-auto` để cuộn mượt trong giới hạn `466px–486px`.
- **Web Preview ngoài Chrome Extension (`!isChromeExtension()`):** Vẫn giữ khung demo preview và cửa sổ Chrome giả lập bọc quanh `popupContent`.

---

## 3. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (2 files)
1. `respond_phase1a_report.md` — Bản lưu giữ báo cáo Giai đoạn 1a trước khi triển khai 5a.
2. `__tests__/ui/navigationRedesign.test.ts` — 6 tests mới cho Home mặc định `Your Civilization`, bottom nav 3 tab, Compact Header (`EN|VI`, `help-btn`, `← Map`, huy hiệu khiên khi active, ẩn profile chip khi idle), nhãn trạng thái `Focus`/`Paused`/`Rest`, i18n VI & parity 100% EN/VI, `aria-current`, không có unclaimed badge ở 5a.

### File chỉnh sửa (7 files)
1. `respond_plan_5B.5.md` — Thêm mục **ĐIỀU CHỈNH BỔ SUNG (ĐC-5 & ĐC-6)** và cập nhật thứ tự lộ trình Mục J.
2. `src/i18n/locales/en.ts` — Bổ sung các khóa i18n cho Giai đoạn 5a (`nav.*`, `header.*`, `eras.*`, `home.title`, `quest.placeholder.*`, `profiles.subviewTitle`).
3. `src/i18n/locales/vi.ts` — Bổ sung bản dịch tiếng Việt tương ứng, khớp 100% danh sách key với `en.ts`.
4. `src/ui/components/Navbar.tsx` — Đổi `ActiveTab` sang `'home' | 'quest' | 'focus' | 'stats' | 'profiles'`, tái cấu trúc thành bottom nav 3 tab (`Quest | Start Focus | Stats`) với CTA giữa + chấm/nhãn trạng thái phiên (`Focus`/`Paused`/`Rest`) + toggle về `'home'`.
5. `src/ui/components/Header.tsx` — Thiết kế Compact Header (~56px) có Brand về Home, Era badge (từ `CivilizationState`, mặc định `Stone Age`), Coins, `Lv. X`, `?` (`data-testid="help-btn"`), nút `EN | VI`, XP mảnh, `← Map` khi rời Home, huy hiệu khiên chỉ hiện khi chạy phiên; giữ toàn bộ props cũ ở mức optional.
6. `src/App.tsx` — Tách `PopupShell` bên trong `I18nProvider`, đặt `'home'` làm màn hình mặc định, đồng bộ `civEra` qua `getCivilizationStateClient()` trong `refreshState()`, ghép `Header` + `main` (`Your Civilization` + `CivilizationScreen`, khung tạm `Quest`, `TimerView`, sub-view `'profiles'` cho `ProfileAllowlistView`, `StatsView`) + bottom `Navbar`.
7. `__tests__/ui/extensionPopupShell.test.ts` — Cập nhật dòng 31–35 (theo ĐC-2) từ `Allowlist`/`Daily Stats` sang assert `Your Civilization`, `Quest`, `Start Focus`, `Stats` (giữ nguyên toàn bộ assert chống demo-shell và `Focus Quest`, `data-testid="help-btn"`).
8. `package.json` — Bổ sung `__tests__/ui/navigationRedesign.test.ts` vào script `"test"` (chỉ thêm file test mới, không sửa glob hay loại trừ bất kỳ test nào).

### File giữ nguyên không sửa
- `TimerView.tsx`, `StatsView.tsx`, `ProfileAllowlistView.tsx`, `RewardHelpModal.tsx`, `CivilizationScreen.tsx`, `MapGridView.tsx`, `CivilizationHeader.tsx` — giữ nguyên nội dung/hành vi cũ theo đúng ranh giới 5a.
- `__tests__/ui/civilizationView.test.ts` (kể cả dòng 238) — **không sửa**.

### File xóa
- Không có (`0` file bị xóa).

---

## 4. Kết quả Kiểm chứng: Baseline (sau 1a) vs Sau Giai đoạn 5a

| Hạng mục | Baseline (sau 1a) | Sau Giai đoạn 5a | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **390 / 390 PASS** (`0` fail) | **396 / 396 PASS** (`0` fail, `0` cancelled, `0` skipped, ~19.32s) | **+6 tests mới** (`navigationRedesign.test.ts`), 1 test sửa có chủ đích (`extensionPopupShell.test.ts:32-35`), 389 test cũ còn lại pass nguyên vẹn |
| `__tests__/ui/civilizationView.test.ts:238` | PASS | **PASS nguyên trạng** (`ok 379`) | Không cần sửa vì Home mặc định render `"Your Civilization"` (chứa chuỗi con `'Civ'`) |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Không lỗi TypeScript |
| `npm run clean && npm run build` | **PASS** (`vite build` 908ms) | **PASS** (`vite build` 964ms) | Tạo đủ 1,714 modules sạch sẽ |
| `dist/background.js` | `77.67 kB` (gzip `16.89 kB`) | `77.67 kB` (gzip `16.84 kB`) | Không đổi logic background |
| `dist/assets/popup-*.js` | `600.47 kB` (gzip `161.97 kB`) | `608.59 kB` (gzip `163.60 kB`) | **+8.12 kB** (+1.63 kB gzip) |
| `dist/assets/popup-*.css` | `56.54 kB` (gzip `9.28 kB`) | `58.70 kB` (gzip `9.52 kB`) | `+2.16 kB` (classes layout bottom nav & header mới) |
| `dist/assets/domainNormalizer-*.js` | `23.37 kB` (gzip `7.35 kB`) | `26.25 kB` (gzip `8.42 kB`) | `+2.88 kB` |
| `dist/index.html` | `0.63 kB` (gzip `0.38 kB`) | `0.63 kB` (gzip `0.38 kB`) | `0.00 kB` |

---

## 5. Xác nhận Ràng buộc & Những gì Cố ý Không Làm trong 5a
- **Đúng 1 test cũ được sửa:** Chỉ sửa `__tests__/ui/extensionPopupShell.test.ts` (dòng 32–35) theo ĐC-2; `__tests__/ui/civilizationView.test.ts:238` và mọi test cũ khác giữ nguyên 100%.
- **Không bắt đầu Giai đoạn 5b trở đi:** Chưa làm `ProfileBottomSheet`, chưa refactor `TimerView` hoặc thuật ngữ `Focus Session`, chưa thêm `RENAME_PROFILE` / `DELETE_PROFILE` / `GET_ACTIVE_PROFILE` vào `extensionClient.ts`.
- **Không làm Stage 4 / 1b / 3 / 2a / 2b / 5c:** Chưa làm `spriteRegistry`, chưa đụng `vite.config.ts` / `manifest.json` / `blocked.html` / `_locales`, chưa làm `statsAggregator` hay `GET_DAILY_STATS`, chưa đụng Quest Schema v3 hay Quest unclaimed badge thật, chưa dịch lại nội dung cũ của `TimerView`, `StatsView`, `ProfileAllowlistView`, `RewardHelpModal`.
- **Không dùng icon bánh răng** trên Header; không cài dependency mới.

---

## 6. Phát hiện thêm hoặc Mâu thuẫn
1. **`Package.json` `scripts.test`:** Script `test` liệt kê tường minh từng file trong `__tests__/ui/` thay vì dùng glob `__tests__/ui/*.test.ts`. Khi tạo `__tests__/ui/navigationRedesign.test.ts`, ở lần chạy đầu test runner bỏ qua file mới cho tới khi thêm tường minh vào `package.json` (`test` script).
2. **`Focus Quest` trong `Header` vs `extensionPopupShell.test.ts:31`:** Giao diện wireframe đặt brand dạng chữ hoa `FOCUS QUEST`, trong khi `extensionPopupShell.test.ts:31` kiểm tra `html.includes('Focus Quest')`. Việc giữ nội dung text `'Focus Quest'` kèm class Tailwind `uppercase` giúp HTML SSR vẫn khớp `'Focus Quest'` đồng thời hiển thị đúng kiểu `FOCUS QUEST`.
3. **`civilizationView.test.ts:238`:** Theo kiểm chứng thực tế trên `App`, `ok 379` pass hoàn toàn mà không cần chỉnh sửa nhờ chuỗi `"Your Civilization"` xuất hiện tĩnh ngay trên Home mặc định.

---

## 7. Hạn chế
- Bộ kiểm thử UI thực hiện qua React SSR (`renderToString`) và `tsc --noEmit` trên Node.js — chưa kiểm tra tương tác chuột/viewport thực tế (bấm chuyển tab, pan/zoom sau bố cục mới, chuyển `EN | VI` và kiểm tra overflow pixel `400×580..600px`) bên trong Chrome Extension unpacked thật.
- Cảnh báo Vite chunk `popup-*.js > 500 kB` vẫn giữ nguyên theo quyết định hoãn `manualChunks` trong kế hoạch.

---

## 8. Đề xuất Bước Kế tiếp
- Thực hiện **Giai đoạn 5b** (theo lộ trình ĐC-5): làm mới `TimerView` (`Start Focus`), tạo `ProfileBottomSheet` (Switch/Create/Rename/Delete/Allowlist + khóa cứng khi chạy phiên) thay cho sub-view tạm `ProfileAllowlistView`, đồng bộ thuật ngữ `Focus Session` và bổ sung `RENAME_PROFILE`, `DELETE_PROFILE`, `GET_ACTIVE_PROFILE` vào simulator `extensionClient.ts`.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 5b
