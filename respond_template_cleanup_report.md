# FOCUS QUEST — BÁO CÁO DỌN TÀN DƯ TEMPLATE GOOGLE AI STUDIO

**Ngày thực hiện:** 14/11/2026  
**Vai trò:** Senior Build & Release Engineer  
**Trạng thái:** **HOÀN THÀNH (FULL PASS — 382/382 Tests PASS | Lint 0 lỗi | Build PASS)**

---

## 1. TÓM TẮT

**Kết quả:** **Hoàn thành** toàn bộ các hạng mục **D1–D6** theo kế hoạch dọn tàn dư template Google AI Studio:
- Đã sao lưu `respond.md` cũ sang `respond_5B.4.3C_final_report.md` và giữ nguyên toàn bộ các file `respond_*.md` lịch sử khác.
- Đã grep xác minh 5 gói (`@google/genai`, `express`, `dotenv`, `motion`, `@types/express`), `GEMINI_API_KEY`, `APP_URL`, `server.js` không được import/dùng ở bất kỳ đâu trong `src/`, `__tests__/`, `vite.config.ts`, `public/` (trừ file zip lưu trữ `public/assets/aistudio/FocusQuest_d8f2d1fc.zip`).
- Đã gỡ bỏ an toàn 5 gói thừa, làm sạch script `clean`, xóa `.env.example`, chuẩn hóa `metadata.json` và `index.html`, cập nhật `PROJECT_STATUS.md` — hành vi extension và giao diện hoàn toàn không thay đổi.

---

## 2. BẢNG TỔNG HỢP THAY ĐỔI (D1–D6)

| Hạng mục | File tác động | Trước khi sửa | Sau khi sửa | Trạng thái |
|---|---|---|---|---|
| **D1** | `package.json`, `package-lock.json` | Còn 5 gói thừa: `@google/genai`, `express`, `dotenv`, `motion`, `@types/express` (`package-lock.json`: 300 entries). | Đã gỡ cả 5 gói bằng `npm uninstall --legacy-peer-deps` (`package-lock.json`: 178 entries; xóa đúng 122 entries liên quan, 0 thêm mới, 0 đổi phiên bản gói còn lại). | **HOÀN THÀNH** |
| **D2** | `package.json` | `"clean": "rm -rf dist server.js"` | `"clean": "rm -rf dist"` | **HOÀN THÀNH** |
| **D3** | `.env.example` (`.gitignore` giữ nguyên) | Tồn tại `.env.example` với `GEMINI_API_KEY` và `APP_URL`. | Đã xóa `.env.example`; giữ nguyên dòng `!.env.example` trong `.gitignore`. | **HOÀN THÀNH** |
| **D4** | `metadata.json` | `description` cũ; `majorCapabilities: ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]`. | `description` lấy từ `manifest.json`; `majorCapabilities: []`; giữ `name: "Focus Quest"` và `requestFramePermissions: []`. | **HOÀN THÀNH** |
| **D5** | `index.html` | Có các thẻ `og:title`, `og:description`, `og:type`, `twitter:card`. | Giữ `<title>Focus Quest</title>`, đồng bộ `description` ngắn với `manifest.json`, xóa `og:*` và `twitter:card`; giữ nguyên `<body>` và `<script>`. | **HOÀN THÀNH** |
| **D6** | `PROJECT_STATUS.md` (`README.md`, `ARCHITECTURE.md` giữ nguyên) | Chưa có mục ghi nhận dọn template. | Thêm mục `### 3.4. Dọn tàn dư template` tóm tắt D1–D5 và số liệu kiểm chứng (không LaTeX, giữ nguyên cấu trúc). Grep xác nhận `README.md` và `ARCHITECTURE.md` không nhắc gói đã gỡ nên giữ nguyên. | **HOÀN THÀNH** |

---

## 3. SO SÁNH BASELINE VÀ SAU KHI DỌN

| Tiêu chí kiểm chứng | Baseline (Trước khi dọn) | Sau khi dọn (D1–D6) | Chênh lệch / Kết luận |
|---|---|---|---|
| **`npm test`** | **382 / 382 PASS** (0 fail, 0 skipped; ~24.49s) | **382 / 382 PASS** (0 fail, 0 skipped; ~17.91s) | Không đổi kết quả (**PASS 100%**) |
| **`npm run lint` (`tsc --noEmit`)** | **0 errors** | **0 errors** (kể cả `lint_applet`) | Không đổi kết quả (**PASS**) |
| **`npm run clean && npm run build`** | **PASS** (~931ms, `compile_applet` PASS) | **PASS** (879ms, `compile_applet` PASS) | Build sạch, không cảnh báo mới |
| **`dist/background.js`** | `76,964 B` (`76.96 kB`, gzip `16.69 kB`) | `76,964 B` (`76.96 kB`, gzip `16.69 kB`) | **0 B** (bằng nhau tuyệt đối) |
| **`dist/assets/popup-DsSjaWr9.js`** | `596,047 B` (`596.04 kB`, gzip `160.77 kB`) | `596,047 B` (`596.04 kB`, gzip `160.77 kB`) | **0 B** (bằng nhau tuyệt đối) |
| **`dist/assets/domainNormalizer-zgpTEtXf.js`** | `21,934 B` (`21.93 kB`, gzip `6.86 kB`) | `21,934 B` (`21.93 kB`, gzip `6.86 kB`) | **0 B** (bằng nhau tuyệt đối) |
| **`dist/assets/popup-DHFcy1Wj.css`** | `56,540 B` (`56.54 kB`, gzip `9.28 kB`) | `56,540 B` (`56.54 kB`, gzip `9.28 kB`) | **0 B** (bằng nhau tuyệt đối) |
| **`dist/index.html`** | `949 B` (`0.94 kB`, gzip `0.43 kB`) | `637 B` (`0.63 kB`, gzip `0.37 kB`) | **-312 B** (nhờ gỡ `og:*` và `twitter:card`) |
| **Grep tàn dư ngoài phạm vi lịch sử** | Còn trong `package.json`, `metadata.json`, `.env.example` | **0 match** trong `src/`, `__tests__/`, `vite.config.ts`, `index.html`, `metadata.json`, `package.json`, `package-lock.json` | Sạch hoàn toàn |

---

## 4. CÁC GÓI / FILE PHÁT HIỆN NHƯNG CỐ Ý KHÔNG SỬA

1. **`bun.lock`**
   - *Bằng chứng:* Vẫn tồn tại song song với `package-lock.json`, chứa `"name": "react-example"` (dòng 6) và cả 5 gói vừa gỡ (`@google/genai`, `express`, `dotenv`, `motion`, `@types/express`).
   - *Rủi ro:* Hai lockfile lệch hoàn toàn cả tên project lẫn danh sách dependency; nếu môi trường hoặc CI dùng `bun install` sẽ cài lại các gói thừa hoặc lệch phiên bản package.
   - *Đề xuất:* Thống nhất dùng `npm` (`package-lock.json`) và xóa `bun.lock` (hoặc chạy `bun install` đồng bộ lại) trong một PR riêng.
2. **`autoprefixer` (`^10.4.21` trong `devDependencies`, lock `10.6.2`)**
   - *Bằng chứng:* Grep toàn repo cho `0` tham chiếu; không có `postcss.config.*` hay `tailwind.config.*`; `src/index.css` chỉ có `@import "tailwindcss";` được xử lý trực tiếp bởi `@tailwindcss/vite` (`4.3.3`) và `vite` (`8.3.5` dùng `lightningcss`).
   - *Đề xuất:* Có thể **gỡ bỏ** an toàn ở đợt dọn tiếp theo.
3. **`esbuild` (`^0.25.0` trong `devDependencies`, lock `0.25.12`)**
   - *Bằng chứng:* Grep toàn repo cho `0` import trực tiếp; `tsx` (`4.23.15`) đã tự khai báo `esbuild: ~0.28.0` riêng, còn `vite` (`8.3.5`) dùng `rolldown: ~1.2.14` và khai báo `peerOptional esbuild@"^0.27.0 || ^0.28.0"`. Chính `esbuild@^0.25.0` ở root đang gây lỗi `ERESOLVE` khi chạy `npm uninstall` hoặc `npm ci` mặc định.
   - *Đề xuất:* Nên **gỡ bỏ** khỏi `devDependencies` ở đợt dọn tiếp theo để khôi phục `npm ci` chuẩn không cần `--legacy-peer-deps`.
4. **`public/assets/aistudio/FocusQuest_d8f2d1fc.zip` (`1.2 MB`)**
   - *Bằng chứng:* Grep phát hiện file nhị phân trong `public/assets/aistudio/`, và Vite tự sao chép sang `dist/assets/aistudio/FocusQuest_d8f2d1fc.zip` mỗi lần build, làm phình dung lượng gói extension đầu ra.
   - *Đề xuất:* Xác minh mục đích lưu trữ và **xóa** khỏi `public/assets/aistudio/` ở PR riêng nếu không cần thiết cho runtime extension.

---

## 5. XÁC NHẬN KHÔNG ĐỤNG TỚI MỤC NGOÀI PHẠM VI

- **Không sửa** `server.hmr` / `server.watch` trong `vite.config.ts`.
- **Không sửa** demo shell `"Khung Chrome"` và logic Interactive Preview trong `src/App.tsx`, `src/ui/services/extensionClient.ts`.
- **Không sửa** bất kỳ file nào trong `src/core/`, `src/background/`, `src/storage/`, `src/chrome/`, `__tests__/`.
- **Không sửa** `public/manifest.json` và danh sách permissions.
- **Không xóa** `bun.lock`, `autoprefixer`, `esbuild`; **không** nâng cấp phiên bản bất kỳ gói còn lại nào; giữ nguyên `!.env.example` trong `.gitignore` và toàn bộ các file `respond_*.md` lịch sử.
- Danh sách file thay đổi đúng giới hạn cho phép: `package.json`, `package-lock.json`, `index.html`, `metadata.json`, `.env.example` (xóa), `PROJECT_STATUS.md`, `respond_5B.4.3C_final_report.md` (mới), `respond.md`.

---

## 6. HẠN CHẾ

- **`npm ci` thực tế chưa kiểm chứng cài lại toàn bộ `node_modules`:**
  - `npm ci --dry-run` mặc định gặp lỗi `ERESOLVE` do xung đột peer pre-existing giữa `dev esbuild@"^0.25.0"` (`0.25.12`) và `vite@8.3.5` (`peerOptional esbuild@"^0.27.0 || ^0.28.0"`).
  - `npm ci --legacy-peer-deps --dry-run` đã chạy PASS (exit code 0, xác nhận `package-lock.json` hợp lệ), và `npm uninstall` ở D1 cũng dùng `--legacy-peer-deps` kèm đối chiếu diff lockfile (xóa đúng 122 gói liên quan, 0 thêm mới, 0 đổi phiên bản). Tuy nhiên, chưa chạy lệnh `npm ci` xóa-cài-lại toàn bộ `node_modules` thực tế.

---

## 7. ĐỀ XUẤT BƯỚC TIẾP THEO

1. **Lập kế hoạch chi tiết cho Milestone 5C (Era Progression & Building Upgrades):** thiết kế transaction `UPGRADE_BUILDING`, chuyển đổi kỷ nguyên `STONE_AGE` -> `BRONZE_AGE` (Automatic Building Evolution chi phí 0 Coins), và catalog công trình Thời kỳ Đồ Đồng.
2. *(Tùy chọn dọn phụ trước 5C)* Gỡ `esbuild`, `autoprefixer`, xử lý `bun.lock` và `public/assets/aistudio/FocusQuest_d8f2d1fc.zip` trong một PR bảo trì riêng để `npm ci` mặc định pass hoàn toàn và gói `dist/` gọn nhẹ hơn `1.2 MB`.
