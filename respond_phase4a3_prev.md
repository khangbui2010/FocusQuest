# BÁO CÁO GIAI ĐOẠN 5B.6a-fix — SỬA `npm install` ERESOLVE & FLAKY TEST `Alarm validation 8`

**Ngày hoàn thành:** 2026-11-16  
**Bản sao lưu báo cáo trước:** `respond_phase5b6a_report.md` *(sao lưu nguyên bản `respond.md` trước khi thực hiện 5B.6a-fix)*  
**Phạm vi:** Thực hiện **ĐÚNG MỘT** giai đoạn nhỏ `5B.6a-fix` (2 việc) trên nền mã nguồn hiện có (sau Lô 5 Chặng A → E & Milestone 5B.6a/5B.6b); **không** đụng logic kinh tế/session/civilization, **không** làm 4b hay giai đoạn tiếp theo.  
**Giới hạn kiểm chứng:** Toàn bộ kiểm tra UI/integration chạy trên Node.js (`tsx --test` + React SSR `renderToString`); **chưa test trực tiếp trên trình duyệt Chrome thật (`chrome://extensions` Load unpacked)**.

---

## VIỆC 1 — Sửa `npm install` lỗi `ERESOLVE`

### 1. Hiện tượng tái hiện & Xác minh mã nguồn
- Chạy `rm -rf node_modules && npm install` (không kèm cờ) thất bại với mã lỗi `ERESOLVE`:
  - `package.json` ghim `devDependencies.esbuild: "^0.25.0"` (resolve ra `esbuild@0.25.12`).
  - `vite@8.3.5` khai báo `peerOptional esbuild: "^0.27.0 || ^0.28.0"`.
- Grep toàn bộ `src/`, `__tests__/`, `public/` và các file cấu hình gốc: **0 file mã nguồn hoặc test import trực tiếp `esbuild`**. Ngoài ra `tsx@4.23.15` đã kéo `esbuild ~0.28.0` làm dependency trực tiếp.

### 2. Thay đổi đã thực hiện & Trạng thái Lockfiles
- `package.json`: Nâng `devDependencies.esbuild` từ `"^0.25.0"` lên `"^0.28.0"`.
- `package-lock.json`: Được cập nhật bởi `npm install` sạch (resolve `esbuild@0.28.2`).
- `bun.lock`: Trước khi sửa, `bun.lock` còn ghim `esbuild@^0.25.0` (`0.25.12`) và bị lệch header/dependencies (do từng bị tool sync chạm nhẹ khi khôi phục workspace). Đã chạy `rm -f bun.lock && bun install --lockfile-only` (`migrated lockfile from package-lock.json`, `Saved bun.lock (151 packages)`) để đồng bộ **cả hai lockfile** (`package-lock.json` và `bun.lock`) về `name: "focus-quest"` và `esbuild@0.28.2`.

### 3. Nghiệm thu Việc 1
- `rm -rf node_modules && npm install` (không dùng `--legacy-peer-deps`): **Exit 0** (`added 63 packages, and audited 64 packages in 25s, found 0 vulnerabilities`).
- Xác minh CLI sau cài đặt: `tsx v4.23.15`, `vite/8.3.5`, `esbuild 0.28.2`, `node v22.23.2`.
- `npm run lint` và `npm run build` đều chạy bình thường sau nâng cấp.

---

## VIỆC 2 — Xác minh & Sửa Flaky Test `Alarm validation 8`

### 1. Kết quả xác minh trong `src/background/sessionCoordinator.ts`
- Đã đọc trực tiếp nhánh `advancePomodoroStage` và `reconcileActiveSession` trong `src/background/sessionCoordinator.ts`:
  1. Ở `__tests__/background/pomodoroAlarmValidation.test.ts` (dòng `236-238`), test gọi `advancePomodoroStage(focusAlarm(session))` (nhánh `1B` POMODORO_STOPWATCH, dòng `1127` & `1347` của `sessionCoordinator.ts`) đặt `phaseStartedAt: now` (`Date.now()`) và lưu vào biến cục bộ `breakStartedAt`.
  2. Dòng `248` sửa `phaseStartedAt` trong storage thành `Date.now() - 61_000`, **nhưng `breakStartedAt` vẫn giữ nguyên mốc `Date.now()` lấy ở bước 1**.
  3. Dòng `263` gọi `ensureInitialized()` → `reconcileActiveSession()` (dòng `1937-1940`) → `advancePomodoroStage()` (CASE 2: BREAK → FOCUS, dòng `1127` & `1443`) gán `phaseStartedAt: now` (`Date.now()` lúc reconcile).
  4. Do test dùng `MemoryStorageAdapter` thuần in-memory, bước 1 và bước 3 thường thực thi trong **cùng 1 mili-giây** (`~3ms` cho cả test, có lúc `afterReconcile.phaseStartedAt === breakStartedAt`), khiến assert `>` ở dòng `268` fail với `'new Focus phase must start after the break phase'`.
- **Kết luận:** Giả thuyết của bạn là **ĐÚNG**. Harness (`__tests__/mocks/chromeMock.ts`) chưa có fake clock.

### 2. Sửa đổi đã áp dụng
- Chỉ sửa file test `__tests__/background/pomodoroAlarmValidation.test.ts` (dòng `267-272`): đổi `>` thành `>=` kèm comment giải thích rõ cơ chế trùng mili-giây in-memory (trong khi `aged.pomodoroState!.phaseStartedAt` đã lùi `-61_000 ms`).
- **Không** sửa code production (`sessionCoordinator.ts`).

### 3. Nghiệm thu Việc 2 (`npm test` 10 lần liên tiếp, gồm chạy song song)
*(Ghi chú: codebase hiện có **483 tests** sau Lô A → E, không phải 467 của mốc 5B.6a cũ).*

| Lần chạy | Hình thức | Kết quả | Thời gian (`duration_ms`) |
|---|---|---|---|
| Run 1 | Tuần tự | **483 / 483 PASS** (`0` fail, `0` skip) | `32,156.60 ms` (`32.16s`) |
| Run 2 | Song song (nhóm 3) | **483 / 483 PASS** (`0` fail, `0` skip) | `74,685.19 ms` (`74.69s`) |
| Run 3 | Song song (nhóm 3) | **483 / 483 PASS** (`0` fail, `0` skip) | `73,993.26 ms` (`73.99s`) |
| Run 4 | Song song (nhóm 3) | **483 / 483 PASS** (`0` fail, `0` skip) | `74,725.60 ms` (`74.73s`) |
| Run 5 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `47,916.82 ms` (`47.92s`) |
| Run 6 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `48,017.45 ms` (`48.02s`) |
| Run 7 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `45,464.56 ms` (`45.46s`) |
| Run 8 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `45,481.05 ms` (`45.48s`) |
| Run 9 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `47,786.98 ms` (`47.79s`) |
| Run 10 | Song song (nhóm 2) | **483 / 483 PASS** (`0` fail, `0` skip) | `47,863.65 ms` (`47.86s`) |

Ngoài ra đã chạy riêng `__tests__/background/pomodoroAlarmValidation.test.ts` thêm `1 + 5` lần: cả 6 lần đều **14 / 14 PASS** (`~285–349 ms`/lần khi chạy ấm).

---

## KẾT QUẢ KIỂM ĐỊNH CHUNG (`lint`, `test`, `build`)

1. **`npm run lint` (`tsc --noEmit`):** **PASS (Exit code 0)** — 0 lỗi, 0 cảnh báo.
2. **`npm test`:** **10 / 10 lần PASS** — **483 / 483 tests PASS** (`32.16s` tuần tự).
3. **`npm run clean && npm run build` (`vite v8.3.5`):** **PASS (Exit code 0)** — `1,731 modules transformed`, thời gian **`1.03s`**.
   - `dist/index.html`: `0.71 kB` (`717 B`, gzip `0.40 kB`)
   - `dist/blocked.html`: `1,810 B`
   - `dist/blocked.js`: `1.32 kB` (`1,321 B`, gzip `0.60 kB`)
   - `dist/background.js`: `78.13 kB` (`78,131 B`, gzip `16.91 kB`)
   - `dist/manifest.json`: `967 B`
   - `dist/_locales/en/messages.json`: `382 B` | `dist/_locales/vi/messages.json`: `440 B`
   - `dist/assets/popup-B932t5i2.js`: **`696.38 kB`** (`696,386 B`, gzip `185.47 kB`) *(vẫn có cảnh báo Vite chunk > 500 kB)*
   - `dist/assets/popup-Bw4W26YK.css`: `76.27 kB` (`76,272 B`, gzip `11.97 kB`)
   - `dist/assets/translator-BersRAKQ.js`: `43.98 kB` (`43,980 B`, gzip `12.00 kB`)
   - `dist/assets/domainNormalizer-DnXGcnwF.js`: `23.17 kB` (`23,175 B`, gzip `7.25 kB`)
   - `dist/assets/storageKeys-iohUx5lT.js`: `0.30 kB` (`305 B`, gzip `0.23 kB`)

### Ghi chú về kích thước `popup-*.js` (~436 kB trong yêu cầu vs `696.38 kB` thực tế)
- Trên build thực tế hiện tại (`vite v8.3.5`), `dist/assets/popup-*.js` ra **`696.38 kB`** (`696,386 B`, gzip `185.47 kB`), khớp với `PROJECT_STATUS.md` (ghi `696.68 kB` sau Lô A → E và `698.36 kB` trước đó) — **không phải ~436 kB**.
- Hiện **chưa rõ** con số `~436 kB` được ghi nhận từ phiên bản/cấu hình cũ nào trước đó (trong lịch sử `respond_before_batch_report.md` và `respond_phase5b6a_report.md`, `popup-*.js` đều nằm trong khoảng `689–712 kB` do gộp chung React 19, `lucide-react`, các modal/gallery và chưa lazy-split chunk).

---

## TÀI LIỆU ĐÃ CẬP NHẬT & GIỚI HẠN
- **Sao lưu:** `respond_phase5b6a_report.md` (bản sao nguyên vẹn của `respond.md` trước khi thực hiện 5B.6a-fix).
- **Cập nhật:** `PROJECT_STATUS.md` (bổ sung mục `Milestone 5B.6a-fix` và số liệu kiểm chứng mới nhất), `respond.md` (báo cáo này).
- **Giới hạn kiểm chứng:** Chưa cài đặt và chạy thử trực tiếp trên trình duyệt Chrome thật (`chrome://extensions` Load unpacked `dist/`).
- **Trạng thái hiện tại:** **DỪNG chờ duyệt** trước khi chuyển sang giai đoạn tiếp theo (ví dụ Giai đoạn 4b nếu bạn xác nhận tiếp tục).
