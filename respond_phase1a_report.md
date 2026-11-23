# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 1a: NỀN TẢNG i18n LÕI & CÔNG TẮC CHUÔNG (`chimeEnabled`)

**Ngày hoàn thành:** 13/11/2026  
**Phạm vi thực hiện:** **Giai đoạn 1a** trong kế hoạch chính thức `respond_plan_5B.5.md` (đã cập nhật đầy đủ ĐC-1..ĐC-4, tổng lộ trình 11 giai đoạn).

---

## 1. Tóm tắt
- Đã sao lưu và cập nhật kế hoạch chính thức sang `respond_plan_5B.5.md` (giữ nguyên toàn bộ các file `respond_*.md` trước đó).
- Đã xây dựng nền tảng i18n lõi tại `src/i18n/` (`SupportedLocale = 'en' | 'vi'`, `TranslationKey` gõ kiểu chặt, từ điển `EN_MESSAGES` / `VI_MESSAGES` chỉ chứa key hạ tầng & công tắc chuông/ngôn ngữ, hàm `translate`, `detectDefaultLocale`, `resolveLocale`, `I18nProvider`, `useTranslation`) không cài thêm thư viện ngoài. Mặc định trong Node/test luôn là `'en'`.
- Đã mở rộng `UserSettings` với `language?: SupportedLocale` và `chimeEnabled?: boolean` (`undefined` = bật); giữ nguyên trường cũ `soundEnabled: boolean` và giá trị mặc định `false` với chú thích deprecated/ignored (`storageSchema.ts`, `v1_initialSchema.ts`, `storageManager.ts`), xóa bỏ hoàn toàn comment sai `"No audio in MVP"`.
- Đã thêm `SET_LANGUAGE` và `SET_CHIME_ENABLED` đầy đủ ở types (`messages.ts`), background handler (`MessageHandler` ghi nguyên tử qua `StorageManager.updateSettings` dùng `StorageMutex`), và simulator (`extensionClient.ts`).
- **Phương án đọc settings cho UI (ít thay đổi hợp đồng nhất):** Bổ sung field optional `settings?: UserSettings` vào `FullSessionStateResponse` (`GET_SESSION_STATE`) thay vì tạo thêm endpoint mới `GET_SETTINGS` — giữ nguyên tương thích ngược 100% cho mọi test/caller cũ và tránh phát sinh thêm round-trip IPC khi `App.tsx` đã đồng bộ qua `GET_SESSION_STATE` + `onStorageChange`.
- Đã gating chuông chuyển pha Web Audio trong `soundEffects.ts` và `TimerView.tsx` theo `chimeEnabled !== false` (bỏ qua hoàn toàn `soundEnabled` cũ để người dùng hiện tại có `soundEnabled: false` vẫn nghe chuông bình thường), bổ sung nút bật/tắt chuông tối thiểu (`data-testid="chime-toggle-btn"`, biểu tượng `Bell`/`BellOff`, `aria-label` qua `useTranslation()`) và bọc `App.tsx` bằng `I18nProvider` mà không đổi bố cục, điều hướng hay chuỗi tiếng Anh mặc định.

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (7 files)
1. `respond_plan_5B.5.md` — Bản kế hoạch 5B.5 chính thức (11 giai đoạn, áp dụng ĐC-1..ĐC-4).
2. `src/i18n/types.ts` — Kiểu `SupportedLocale`, `TranslationKey`, `TranslationParams`.
3. `src/i18n/locales/en.ts` — Từ điển tiếng Anh cho hạ tầng ngôn ngữ & công tắc chuông.
4. `src/i18n/locales/vi.ts` — Từ điển tiếng Việt tương ứng (khớp 100% khóa).
5. `src/i18n/translator.ts` — `translate`, `normalizeLocaleTag`, `detectDefaultLocale`, `resolveLocale`, `isSupportedLocale`.
6. `src/i18n/I18nContext.tsx` — `I18nProvider` và hook `useTranslation()` có fallback an toàn cho SSR/test độc lập.
7. `__tests__/core/i18n.test.ts` — 8 unit tests cho i18n, handler `SET_LANGUAGE`/`SET_CHIME_ENABLED`, simulator parity, gating chuông và nút chuông trên `TimerView`.

### File chỉnh sửa (9 files)
1. `src/types/storageSchema.ts` — Thêm `language?`, `chimeEnabled?`; đánh dấu `soundEnabled` là deprecated/ignored, cập nhật comment.
2. `src/storage/migrations/v1_initialSchema.ts` — Giữ nguyên `soundEnabled: false` và cập nhật comment `"No audio in MVP"`.
3. `src/storage/storageManager.ts` — Làm rõ comment `getSettings()` và bổ sung `updateSettings()` chạy qua `StorageMutex`.
4. `src/types/messages.ts` — Thêm `SET_LANGUAGE`, `SET_CHIME_ENABLED`, payload types, và `settings?: UserSettings` vào `FullSessionStateResponse`.
5. `src/background/sessionCoordinator.ts` — Đọc và trả `settings` trong `getFullState()`.
6. `src/background/messageHandler.ts` — Bổ sung validate + xử lý `SET_LANGUAGE` và `SET_CHIME_ENABLED`.
7. `src/ui/services/extensionClient.ts` — Thêm `settings` vào `mockState` và simulator parity cho `SET_LANGUAGE`, `SET_CHIME_ENABLED`.
8. `src/ui/services/soundEffects.ts` — Bổ sung `isChimeEnabled`, `playPhaseTransitionChime`, `setChimeEnabled` (chỉ kiểm tra `chimeEnabled !== false`, bỏ qua `soundEnabled`).
9. `src/ui/components/TimerView.tsx` & `src/App.tsx` — Gating chuông + nút bật/tắt chuông tối thiểu có `aria-label` i18n trong `TimerView`; đồng bộ `settings` và bọc `I18nProvider` quanh `App`.

### File xóa
- Không có (`0` file bị xóa).

---

## 3. Kết quả Kiểm chứng: Baseline vs Sau Giai đoạn 1a

| Hạng mục | Baseline (trước 1a) | Sau Giai đoạn 1a | Chênh lệch |
|---|---|---|---|
| `npm test` | **382 / 382 PASS** (0 fail, ~15.30s) | **390 / 390 PASS** (0 fail, ~16.85s) | **+8 tests mới** (382 test cũ pass nguyên vẹn) |
| `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | **PASS** (0 errors) | Không lỗi TypeScript |
| `npm run clean && npm run build` | **PASS** (820ms) | **PASS** (815ms) | Ổn định |
| `dist/background.js` | `76.96 kB` (gzip `16.69 kB`) | `77.67 kB` (gzip `16.89 kB`) | **+0.71 kB** (+0.20 kB gzip) |
| `dist/assets/popup-*.js` | `596.04 kB` (gzip `160.77 kB`) | `600.47 kB` (gzip `161.97 kB`) | **+4.43 kB** (+1.20 kB gzip) |
| `dist/assets/popup-*.css` | `56.54 kB` (gzip `9.28 kB`) | `56.54 kB` (gzip `9.28 kB`) | `0.00 kB` |
| `dist/assets/domainNormalizer-*.js` | `21.93 kB` (gzip `6.86 kB`) | `23.37 kB` (gzip `7.35 kB`) | `+1.44 kB` (+0.49 kB gzip) |

*(Ghi chú: cảnh báo chunk >500 kB của Vite giữ nguyên như baseline do đã chốt hoãn `manualChunks` theo mục 7.)*

---

## 4. Xác nhận Ràng buộc & Những gì Cố ý Không Làm
- **Không sửa** `vite.config.ts`, `public/manifest.json`, `public/blocked.html`, `public/_locales` (thuộc Giai đoạn 1b).
- **Không làm** Quest, Stats, tái cấu trúc Bottom Nav / Header, `ProfileBottomSheet`, pixel-art sprite, Chrome Notification i18n, không đổi `CURRENT_SCHEMA_VERSION` (vẫn là `2`) và không thêm dependency mới.
- **Không sửa bất kỳ assertion nào của 382 tests hiện có** — toàn bộ 382 test cũ vượt qua nguyên vẹn.
- **Giữ nguyên giao diện tiếng Anh mặc định, bố cục và các chuỗi hiển thị hiện có** (chỉ bổ sung duy nhất nút biểu tượng chuông tối thiểu có `aria-label` qua i18n).

---

## 5. Phát hiện thêm hoặc Mâu thuẫn
- Trong `I18nContext.tsx`, phiên bản TypeScript 7 (`react` 19) yêu cầu `children?: React.ReactNode` trên `I18nProviderProps` khi gọi `React.createElement(I18nProvider, { locale }, child)` với child là tham số thứ 3 — đã chỉnh tương thích ngay và `tsc --noEmit` đạt 0 lỗi.
- Trong `soundEffects.ts`, `TimerView.tsx` trước đây gọi thẳng `playFocusStartChime` / `playBreakStartChime` không kiểm tra settings, còn `UserSettings.soundEnabled` có sẵn comment `"No audio in MVP"`. Việc tách sang `chimeEnabled?: boolean` (`undefined` = bật) và bỏ qua `soundEnabled` đã giải quyết triệt để mâu thuẫn mà vẫn bảo toàn `v2Migration.test.ts` và thói quen của người dùng hiện hữu.
- Không phát sinh xung đột nào giữa kế hoạch, code và 382 test hiện tại.

---

## 6. Hạn chế
- Mới kiểm chứng trên môi trường Node/SSR (`tsx --test`), `tsc --noEmit` và `vite build`; **chưa load unpacked `dist/` để kiểm tra thực tế trên trình duyệt Chrome thật** (bao gồm `AudioContext` thực và `chrome.i18n.getUILanguage()` trong Chrome MV3 runtime).

---

## 7. Đề xuất Bước Kế tiếp
- Tiến hành **Giai đoạn 1b**: bổ sung `src/blocked/blocked.ts` (MV3 CSP-safe), cập nhật `vite.config.ts` & `public/blocked.html`, tạo `public/_locales/{en,vi}/messages.json` và cập nhật `public/manifest.json`, kiểm chứng build hoàn chỉnh cho trang chặn & đa ngôn ngữ extension manifest.

CHỜ LỆNH BẮT ĐẦU GIAI ĐOẠN 1b
