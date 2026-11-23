# FOCUS QUEST — BÁO CÁO ĐỒNG BỘ TÀI LIỆU & GIẢI QUYẾT MÂU THUẪN MÃ NGUỒN
## POST-MILESTONE 5B.4.3C DOCUMENTATION & SPECIFICATION AUDIT

**Ngày thực hiện:** 12/11/2026  
**Vai trò:** Senior Technical Writer & Extension Architect  
**Trạng thái nhiệm vụ:** **HOÀN THÀNH (FULL PASS)**  
**Cam kết:** Chỉ chỉnh sửa các tệp tài liệu `.md`, tuyệt đối không thay đổi mã nguồn, test suites hoặc cấu hình hệ thống trong đợt này.

---

## 1. TỔNG QUAN & TÓM TẮT THỰC HIỆN

Nhiệm vụ rà soát, đối chiếu và giải quyết toàn bộ các mâu thuẫn giữa tài liệu đặc tả và mã nguồn thực tế của dự án Focus Quest đã được thực hiện trọn vẹn $100\%$:
- **Bảo lưu tài liệu lịch sử:** Đã sao chép `respond.md` sang `respond_5B.4.3C_report.md` và giữ nguyên vẹn `respond_plan_5B.4.3C.md`.
- **4 Quyết định chốt (D1–D4):** Đã được phản ánh chính xác vào toàn bộ các tài liệu liên quan (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `README.md`, `PROJECT_STATUS.md`).
- **Sửa lỗi tài liệu rõ ràng (B1–B4):** Đã chuẩn hóa manifest mẫu trong kiến trúc, nâng cấp nhãn TypeScript 7, đánh số lại các mục trùng lặp trong spec và đồng bộ tham chiếu chéo.
- **Viết lại `PROJECT_STATUS.md` (Nhóm C):** Đã tái cấu trúc toàn diện dựa trên **trạng thái code thực tế đã xác minh trực tiếp**, xóa bỏ các tuyên bố hoàn thành sớm không có căn cứ, thống kê số liệu test thật (371 tests PASS).

---

## 2. TRẠNG THÁI CODE THỰC TẾ ĐÃ XÁC MINH TRỰC TIẾP

Trước khi chỉnh sửa tài liệu, kiến trúc sư đã trực tiếp kiểm tra mã nguồn và chạy các lệnh kiểm định hệ thống:

1. **Thư mục `src/ui/components/civilization/`:** **CHƯA TỒN TẠI** trong source code. Chưa có 6 UI components của Civilization.
2. **Tab `Civ` trong `src/App.tsx`:** **VẪN LÀ PLACEHOLDER**, đang render khối thông báo tĩnh `"Milestone 5B.4.3C UI"`.
3. **Trạng thái bài test `civilizationView.test.ts`:** **ĐANG BỊ EXCLUDE** trong `tsconfig.json` và script `test` của `package.json`.
4. **Tên gói trong `package.json`:** Đã là `"name": "focus-quest"` (đồng bộ với `package-lock.json`).
5. **Production Build (`npm run build`):** **PASS (Exit code 0, ~872ms)**.
   - `dist/background.js`: **CÓ (76.96 kB, gzip: 16.71 kB)** — Được Vite đóng gói độc lập thành công từ `src/background/index.ts`.
   - `dist/index.html`: **CÓ (0.94 kB)**.
   - `dist/manifest.json`, `dist/blocked.html`, `dist/icons/`, `dist/assets/`: Đầy đủ và hợp lệ theo chuẩn Chrome MV3.
   - Cảnh báo deprecation: Đã loại bỏ hoàn toàn cảnh báo `__dirname` (thay bằng `import.meta.dirname`).
6. **Kiểm thử tự động (`npm test`):** **371 / 371 tests PASS (100%)**, 0 fail, 0 skipped (~15.0s qua 24 test suites).
7. **Typecheck & Linter (`npm run lint` / `tsc --noEmit`):** **0 errors, 0 warnings**.

---

## 3. BẢNG TỔNG HỢP CÁC MỤC THAY ĐỔI (A1–A6, B1–B4, C)

| Mục | Quyết định / Vấn đề | Tệp tin | Tóm tắt Nội dung Trước khi Sửa | Tóm tắt Nội dung Sau khi Sửa | Trạng thái |
|:---:|:---:|:---:|---|---|:---:|
| **A1** | D1 (Âm thanh) | `PRODUCT_SPEC.md` | Mục 10 ghi: cấm Web Audio API hay tiếng chuông trong MVP. | Bỏ câu cấm. Quy định rõ: Chrome Notification là kênh chính khi hoàn thành; Popup có chuông Web Audio khi bắt đầu focus/break; lỗi AudioContext bỏ qua êm, không ảnh hưởng session/thưởng. | **ĐÃ XONG** |
| **A2** | D1 (Âm thanh) | `ARCHITECTURE.md` | Dòng permissions `"notifications"` ghi: không dùng âm thanh. | Cập nhật: Chrome Notification dùng cho hoàn thành phiên; âm thanh chuông chuyển phase do Popup UI xử lý riêng bằng Web Audio API khi mở popup. | **ĐÃ XONG** |
| **A3** | D2 (Multiplier) | `README.md` | Ghi "1.0x to 2.2x", tier 180+ min là "×2.2", tier đầu "5–29 min". | Sửa thành "1.0x to 2.5x", tier 180+ min thành "**×2.5**", tier đầu thành "**Dưới 30 min: ×1.0**". | **ĐÃ XONG** |
| **A4** | D2 (Multiplier) | `PROJECT_STATUS.md` | Nhiều chỗ ghi mốc trần hệ số là ×2.2 (kể cả Task 8 & 9). | Cập nhật toàn bộ các mốc hệ số tối đa thành **×2.5** cho các phiên $\ge 180$ phút. | **ĐÃ XONG** |
| **A5** | D3 (CoinBonus) | `README.md` | Bảng Economic Rules ghi công thức cộng nhầm `(tierMultiplier + totalCoinBonus)`. | Chuyển thành chuẩn xác: `durationMinutes × baseRate × tierMultiplier × (1 + totalCoinBonus)` cho cả Countdown và Stopwatch. | **ĐÃ XONG** |
| **A6** | D4 (Tên công trình) | `README.md` & `PROJECT_STATUS.md` | README ghi "Study Cave"; Status ghi tên thuần Việt không rõ ID. | README sửa thành "Meditation Cave". PROJECT_STATUS ghi rõ tên hiển thị kèm ID: Meditation Cave [`stone_age_study_cave`], Primitive Granary [`stone_age_food_cache`]. | **ĐÃ XONG** |
| **B1** | Lỗi Manifest mẫu | `ARCHITECTURE.md` | Manifest mẫu ghi `"service_worker": "src/background/index.ts"`. | Sửa thành `"background.js"` khớp `public/manifest.json`. Thêm dòng ghi chú xác nhận file này do Vite build ra `dist/background.js` (đã xác minh tạo thành công). | **ĐÃ XONG** |
| **B2** | Nhãn TypeScript | `ARCHITECTURE.md` | Ghi "TypeScript 5+". | Sửa thành "**TypeScript 7**" đúng theo `package.json` (`typescript: ^7.0.2`). | **ĐÃ XONG** |
| **B3** | Trùng số mục | `PRODUCT_SPEC.md` | Có hai mục cùng đánh số "## 8." (Pause Rule và Xử lý Gián đoạn). | Đánh số lại chuẩn xác: Mục 8 (Pause Rule), Mục 9 (Xử lý Gián đoạn), Mục 10 (Profiles & Allowlist), Mục 11 (Thông báo & Âm thanh), Mục 12 (UI Architecture). | **ĐÃ XONG** |
| **B4** | Tham chiếu chéo | Toàn bộ `.md` | Nguy cơ sai lệch tham chiếu chéo theo số mục spec. | Đã rà soát toàn bộ `.md`: không có tham chiếu cứng dạng "Mục 8", văn phong mô tả tên chuyên mục giữ tính nhất quán 100%. | **ĐÃ XONG** |
| **C** | Tái cấu trúc Status | `PROJECT_STATUS.md` | Ghi Phase 5B.4 đã hoàn thành, số liệu test 356 cũ, trùng lặp mục 4 & 5. | Viết lại theo trạng thái thật: Milestone 5B.4.3B PASS (371 tests); 5B.4.3C đã xong Packaging (F-08, F-09, F-11), UI chưa làm (F-10); cấu trúc lại 5 phần gọn gàng, chuẩn xác. | **ĐÃ XONG** |

---

## 4. CÁC ĐIỂM PHÁT HIỆN THÊM & NHỮNG GÌ CỐ Ý KHÔNG SỬA

1. **Sự nhất quán của mã nguồn thực tế về Multiplier:**
   - Đã kiểm tra `src/core/reward/multiplierRules.ts` dòng 42: trả về đúng `2.5` khi `focusMinutes >= 180`. Mã nguồn và `PRODUCT_SPEC.md` đã thống nhất tuyệt đối về $\times 2.5$.
2. **Sự nhất quán về công thức CoinBonus:**
   - Đã kiểm tra `src/core/reward/rewardEngine.ts` dòng 64: `coinsEarned = baseRate * minutes * multiplier * coinBonusMultiplier`, trong đó `coinBonusMultiplier = (1 + totalCoinBonus)`. XP không nhân `coinBonusMultiplier`. Mã nguồn và spec đã đúng $100\%$.
3. **Sự nhất quán về âm thanh Web Audio:**
   - Đã kiểm tra `src/ui/services/soundEffects.ts` và `src/ui/components/TimerView.tsx` dòng 249–251: sử dụng Web Audio API tổng hợp âm thanh tần số thực (sine wave oscillator) khi chuyển sang Focus (`playFocusStartChime`) hoặc Break (`playBreakStartChime`). Hoàn toàn không phụ thuộc file âm thanh ngoài hay Chrome Notification audio.
4. **Những hạng mục cố ý KHÔNG can thiệp (Out of Scope):**
   - **Dependencies template:** Giữ nguyên các gói `@google/genai`, `express`, `dotenv`, `motion`, `.env.example`, `metadata.json`, script `clean` trong `package.json` theo đúng ràng buộc của yêu cầu.
   - **Tính năng Milestone 5C:** Không triển khai mutation `UPGRADE_BUILDING`, không làm chuyển kỷ nguyên Bronze Age.
   - **Mã nguồn và Test:** Không thêm/sửa/xóa bất kỳ dòng code nào trong `src/`, `public/`, `__tests__/`, `package.json`, `tsconfig.json`, hay `vite.config.ts`.

---

## 5. XÁC NHẬN RÀNG BUỘC KỸ THUẬT (ZERO CODE / TEST / CONFIG MODIFICATION)

- Toàn bộ các thay đổi trong nhiệm vụ này **chỉ tác động duy nhất lên các tệp tài liệu Markdown (`.md`)**:
  - `PRODUCT_SPEC.md`
  - `ARCHITECTURE.md`
  - `README.md`
  - `PROJECT_STATUS.md`
  - `respond.md`
  - `respond_5B.4.3C_report.md` (bản sao lưu)
- Đã kiểm tra kết quả `grep` xác nhận không còn tồn tại các cụm từ sai lệch:
  - "2.2" (đã loại bỏ hoàn toàn khỏi các bảng quy tắc; chỉ còn lại 2 dòng ghi chú lịch sử và số mục 2.2).
  - "Study Cave" $\to$ đã xóa sạch (thay bằng "Meditation Cave").
  - "Food Cache" $\to$ đã xóa sạch (thay bằng "Primitive Granary").
  - "không dùng âm thanh" $\to$ đã xóa sạch (cập nhật cơ chế Web Audio API).
  - "TypeScript 5" $\to$ đã xóa sạch (cập nhật TypeScript 7).
- Hệ thống tiếp tục vượt qua cả hai cổng kiểm định:
  - `npm run lint` (`tsc --noEmit`): **0 errors, 0 warnings**.
  - `compile_applet`: **Build succeeded**.

---

## 6. ĐỀ XUẤT CÁC BƯỚC TIẾP THEO

1. **Bắt tay triển khai phần UI của Milestone 5B.4.3C:**
   - Xây dựng 6 components trong `src/ui/components/civilization/` theo đúng hợp đồng đã chốt:
     1. `CivilizationHeader.tsx`
     2. `BuildingCatalogPanel.tsx`
     3. `BuildingDetailsModal.tsx`
     4. `LandExpansionModal.tsx`
     5. `MapGridView.tsx`
     6. `CivilizationScreen.tsx`
   - Gắn `CivilizationScreen` vào tab `Civ` của `src/App.tsx`.
   - Bỏ exclude trong `tsconfig.json` và thêm `__tests__/ui/civilizationView.test.ts` vào script `test`.
   - Chạy `npm test` xác nhận nâng tổng số test từ **371 lên 382 tests PASS (100%)**.
2. **Chuẩn bị Milestone 5C:**
   - Sau khi đóng hoàn toàn Milestone 5B.4.3C, lập kế hoạch triển khai nâng cấp công trình (`UPGRADE_BUILDING`) và chuyển kỷ nguyên đồ đồng (`BRONZE_AGE`).
