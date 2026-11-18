import { getAllBuildingDefinitions } from '../core/civilization/buildingCatalog.ts';
import {
  getLocalizedBuildingName,
  getLocalizedEraName,
} from '../ui/utils/buildingI18n.ts';
import { SupportedLocale } from './types.ts';

function resolveBuildingDisplayByRawName(locale: SupportedLocale, rawName: string): string {
  const def = getAllBuildingDefinitions().find((item) => item.name === rawName || item.id === rawName);
  if (!def) return rawName;
  return getLocalizedBuildingName(locale, def, rawName);
}

function translatePlacementReason(locale: SupportedLocale, rawReason: string): string {
  if (locale !== 'vi') return rawReason;
  const upper = rawReason.trim().toUpperCase();
  if (upper.includes('CELL_OCCUPIED')) return 'ô đất đã có công trình';
  if (upper.includes('OUT_OF_BOUNDS') || upper.includes('OUTSIDE')) return 'ngoài phạm vi lãnh thổ đã mở';
  if (upper.includes('INSUFFICIENT_COINS')) return 'không đủ Coin';
  if (upper === 'PLACEMENT REJECTED') return 'vị trí đặt không hợp lệ';
  return rawReason;
}

function translateExpansionReason(locale: SupportedLocale, rawReason: string): string {
  if (locale !== 'vi') return rawReason;
  const upper = rawReason.trim().toUpperCase();
  if (upper.includes('INVALID_ORIGIN')) return 'tọa độ không khớp lưới phân khu 4×4';
  if (upper.includes('NOT_ADJACENT')) return 'chỉ có thể mở rộng phân khu liền kề vùng đất đã mở';
  if (upper.includes('ALREADY_UNLOCKED')) return 'phân khu này đã được mở trước đó';
  if (upper === 'CANNOT EXPAND CHUNK') return 'không thể mở rộng phân khu này';
  return rawReason;
}

const EXACT_VI_ERROR_MAP: Record<string, string> = {
  // Profile & Allowlist exact messages
  'Profile name cannot be empty or whitespace.': 'Tên hồ sơ không được để trống hoặc chỉ chứa khoảng trắng.',
  'Profile name cannot exceed 50 characters.': 'Tên hồ sơ không được vượt quá 50 ký tự.',
  'Cannot delete the only remaining profile in the system.': 'Không thể xóa hồ sơ duy nhất còn lại trong hệ thống.',
  'No profiles found in storage.': 'Không tìm thấy hồ sơ nào trong bộ nhớ.',
  'Allowlist cannot be modified during a focus session. Finish your session first.':
    'Không thể chỉnh sửa danh sách cho phép khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.',
  'Cannot create profile during a focus session. Finish your session first.':
    'Không thể tạo hồ sơ mới khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.',
  'Cannot rename profile during a focus session. Finish your session first.':
    'Không thể đổi tên hồ sơ khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.',
  'Cannot delete profile during a focus session. Finish your session first.':
    'Không thể xóa hồ sơ khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.',
  'Cannot switch active profile during a focus session. Finish your session first.':
    'Không thể đổi hồ sơ đang dùng khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.',
  'Domain pattern cannot be empty.': 'Tên miền không được để trống.',
  'Invalid domain pattern.': 'Định dạng tên miền không hợp lệ.',

  // UI Profile fallback messages
  'Failed to switch profile.': 'Không thể chuyển hồ sơ.',
  'Failed to create profile.': 'Không thể tạo hồ sơ mới.',
  'Failed to rename profile.': 'Không thể đổi tên hồ sơ.',
  'Failed to delete profile.': 'Không thể xóa hồ sơ.',
  'Failed to add domain.': 'Không thể thêm tên miền.',
  'Failed to remove domain.': 'Không thể xóa tên miền.',

  // Civilization UI fallback messages
  'Failed to load civilization state.': 'Không thể tải dữ liệu Nền Văn Minh.',
  'Could not place building at that location.': 'Không thể đặt công trình tại vị trí đó.',
  'Placement request failed.': 'Yêu cầu đặt công trình thất bại.',
  'Could not remove building.': 'Không thể phá dỡ công trình.',
  'Removal request failed.': 'Yêu cầu phá dỡ công trình thất bại.',
  'Could not expand territory.': 'Không thể mở rộng lãnh thổ.',
  'Expansion request failed.': 'Yêu cầu mở rộng lãnh thổ thất bại.',
  'Invalid payload: expected object for PLACE_BUILDING': 'Dữ liệu đặt công trình không hợp lệ.',
  'PLACE_BUILDING requires a valid buildingDefinitionId': 'Thiếu mã loại công trình hợp lệ.',
  'PLACE_BUILDING requires valid position coordinates': 'Thiếu tọa độ đặt công trình hợp lệ.',
  'PLACE_BUILDING requires payload object.': 'Dữ liệu đặt công trình không hợp lệ.',
  'PLACE_BUILDING requires valid buildingDefinitionId.': 'Thiếu mã loại công trình hợp lệ.',
  'PLACE_BUILDING requires valid position coordinates.': 'Thiếu tọa độ đặt công trình hợp lệ.',
  'REMOVE_BUILDING requires a valid buildingInstanceId': 'Thiếu mã công trình cần xóa.',
  'REMOVE_BUILDING requires valid buildingInstanceId.': 'Thiếu mã công trình cần xóa.',
  'EXPAND_LAND requires payload object': 'Dữ liệu mở rộng đất không hợp lệ.',
  'EXPAND_LAND requires payload object.': 'Dữ liệu mở rộng đất không hợp lệ.',
  'EXPAND_LAND requires valid origin coordinates': 'Thiếu tọa độ phân khu mở rộng hợp lệ.',
  'EXPAND_LAND requires valid origin coordinates.': 'Thiếu tọa độ phân khu mở rộng hợp lệ.',
  'EXPAND_LAND requires origin coordinates only; directional expansion is no longer supported':
    'Yêu cầu mở rộng đất chỉ hỗ trợ tọa độ phân khu.',
  'EXPAND_LAND requires origin coordinates only; direction and slotIndex are not supported.':
    'Yêu cầu mở rộng đất chỉ hỗ trợ tọa độ phân khu.',

  // Session / Timer / MessageHandler messages
  'Invalid message format: missing action field.': 'Định dạng yêu cầu không hợp lệ.',
  'START_SESSION requires mode and profileId.': 'Thiếu chế độ hoặc hồ sơ tập trung để bắt đầu phiên.',
  'COUNTDOWN requires targetMinutes between 1 and 1440.': 'Thời lượng đếm ngược phải nằm trong khoảng 1 đến 1440 phút.',
  'SWITCH_PROFILE requires profileId.': 'Thiếu mã hồ sơ để chuyển đổi.',
  'CREATE_PROFILE requires name.': 'Vui lòng nhập tên hồ sơ mới.',
  'RENAME_PROFILE requires profileId and newName.': 'Thiếu mã hồ sơ hoặc tên mới.',
  'DELETE_PROFILE requires profileId.': 'Thiếu mã hồ sơ cần xóa.',
  'ADD_DOMAIN requires profileId and domainPattern.': 'Thiếu thông tin tên miền cần thêm.',
  'REMOVE_DOMAIN requires profileId and domainPattern.': 'Thiếu thông tin tên miền cần xóa.',
  'No active session to pause.': 'Không có phiên tập trung đang chạy để tạm dừng.',
  'No session to resume.': 'Không có phiên tập trung để tiếp tục.',
  'No session to give up.': 'Không có phiên tập trung để bỏ cuộc.',
  "Give up is not applicable to standard Stopwatch sessions. Use 'FINISH'.":
    'Chế độ Bấm giờ không dùng bỏ cuộc. Hãy chọn Kết thúc phiên.',
  'No active stopwatch session to finish.': 'Không có phiên Bấm giờ đang hoạt động để kết thúc.',
  "Cannot finish countdown with 'finishStopwatch'. Countdown finishes when target is met.":
    'Không thể kết thúc sớm phiên Đếm ngược như Bấm giờ.',
  'Cannot skip break while in Focus phase.': 'Không thể bỏ qua giờ nghỉ khi đang ở pha Tập trung.',
  'Manual early interval completion is prohibited in Pomodoro Stopwatch.':
    'Không thể hoàn tất sớm chu kỳ trong Pomodoro Bấm giờ.',
  "SET_LANGUAGE requires valid language ('en' | 'vi').": "Ngôn ngữ không hợp lệ (chỉ hỗ trợ 'en' hoặc 'vi').",
  'SET_CHIME_ENABLED requires boolean enabled flag.': 'Cấu hình chuông báo không hợp lệ.',
  'Failed to exit session.': 'Không thể thoát phiên tập trung. Vui lòng thử lại.',
  'Could not exit the session. Please try again.': 'Không thể thoát phiên tập trung. Vui lòng thử lại.',
  'Background worker unreachable.': 'Không thể kết nối tiến trình nền. Vui lòng thử lại.',
  'Empty response received.': 'Không nhận được phản hồi từ tiến trình nền.',

  // Music Player backend messages
  'Unable to load online Lofi catalog. Check your internet connection and retry.':
    'Không thể tải danh sách nhạc Lofi trực tuyến. Hãy kiểm tra kết nối mạng và thử lại.',
  'Malformed JSON in remote music catalog.':
    'Dữ liệu danh sách nhạc trực tuyến bị lỗi định dạng JSON.',
  'Audio playback failed (autoplay_blocked).':
    'Trình duyệt chặn tự động phát âm thanh. Hãy bấm Phát để bắt đầu nghe nhạc.',
  'Audio playback failed (network).':
    'Không thể tải luồng nhạc do lỗi mạng. Hãy kiểm tra kết nối Internet.',
  'Audio playback failed (decode).': 'Không thể giải mã tệp âm thanh trực tuyến.',
  'Audio playback failed (unknown).': 'Lỗi phát âm thanh không xác định.',
  'MUSIC_SEEK requires finite numeric positionSec.': 'Vị trí tua nhạc không hợp lệ.',
  'MUSIC_SET_VOLUME requires finite numeric volume.': 'Mức âm lượng không hợp lệ.',
  'MUSIC_SET_SHUFFLE requires boolean enabled flag.': 'Cài đặt phát ngẫu nhiên không hợp lệ.',
  "MUSIC_SET_REPEAT requires mode ('off' | 'all' | 'one').": 'Chế độ lặp lại không hợp lệ.',
  'Music coordinator is not initialized.': 'Trình điều phối nhạc chưa được khởi tạo.',
  'MusicCoordinator is not configured in MessageHandler.': 'Trình điều phối nhạc chưa được cấu hình.',

  // Quest validation messages
  'CLAIM_QUEST_REWARD requires payload with period and questId.':
    'Yêu cầu nhận thưởng nhiệm vụ cần đầy đủ chu kỳ và mã nhiệm vụ.',
  "CLAIM_QUEST_REWARD requires valid period ('DAILY' | 'WEEKLY').":
    "Chu kỳ nhiệm vụ không hợp lệ (chỉ hỗ trợ 'DAILY' hoặc 'WEEKLY').",
  'CLAIM_QUEST_REWARD requires valid questId.': 'Mã nhiệm vụ không hợp lệ.',
};

function translateDomainSubError(rawSubError: string): string {
  if (rawSubError === 'Domain pattern cannot be empty.') {
    return 'Tên miền không được để trống.';
  }
  const broadMatch = rawSubError.match(
    /^Pattern '(.+)' is too broad and would disable website blocking protection\.$/
  );
  if (broadMatch) {
    return `Mẫu '${broadMatch[1]}' quá rộng và sẽ làm vô hiệu hóa tính năng chặn trang web.`;
  }
  const invalidDomainMatch = rawSubError.match(
    /^Invalid domain format: '(.+)'\. Example valid formats:/
  );
  if (invalidDomainMatch) {
    return `Định dạng tên miền không hợp lệ: '${invalidDomainMatch[1]}'. Ví dụ hợp lệ: 'wikipedia.org', '*.github.com'.`;
  }
  return rawSubError;
}

/**
 * Translate raw backend/coordinator/validation error strings for the active UI locale.
 * Preserves original English error strings untouched when locale is 'en'.
 */
export function localizeErrorMessage(
  locale: SupportedLocale,
  rawError: string | null | undefined
): string {
  if (!rawError) return '';
  if (locale !== 'vi') return rawError;

  const trimmed = rawError.trim();
  if (!trimmed) return '';

  if (EXACT_VI_ERROR_MAP[trimmed]) {
    return EXACT_VI_ERROR_MAP[trimmed];
  }

  // Domain validation & wrapped profile domain errors
  const subDomainTranslated = translateDomainSubError(trimmed);
  if (subDomainTranslated !== trimmed) {
    return subDomainTranslated;
  }

  const addDomainPrefix = trimmed.match(/^Cannot add domain: (.+)$/);
  if (addDomainPrefix) {
    return `Không thể thêm tên miền: ${translateDomainSubError(addDomainPrefix[1])}`;
  }

  const createProfilePrefix = trimmed.match(/^Cannot create profile: (.+)$/);
  if (createProfilePrefix) {
    return `Không thể tạo hồ sơ: ${translateDomainSubError(createProfilePrefix[1])}`;
  }

  const updateAllowlistPrefix = trimmed.match(/^Cannot update allowlist: (.+)$/);
  if (updateAllowlistPrefix) {
    return `Không thể cập nhật danh sách cho phép: ${translateDomainSubError(updateAllowlistPrefix[1])}`;
  }

  const duplicateNameMatch = trimmed.match(/^A profile with the name '(.+)' already exists\.$/);
  if (duplicateNameMatch) {
    return `Hồ sơ có tên '${duplicateNameMatch[1]}' đã tồn tại.`;
  }

  const profileNotFoundMatch = trimmed.match(/^Profile with ID '(.+)' not found\.$/);
  if (profileNotFoundMatch) {
    return `Không tìm thấy hồ sơ với mã '${profileNotFoundMatch[1]}'.`;
  }

  const activeNotFoundMatch = trimmed.match(/^Cannot set active profile: ID '(.+)' not found\.$/);
  if (activeNotFoundMatch) {
    return `Không thể chọn hồ sơ: không tìm thấy mã '${activeNotFoundMatch[1]}'.`;
  }

  const replacementNotFoundMatch = trimmed.match(
    /^Replacement active profile with ID '(.+)' does not exist\.$/
  );
  if (replacementNotFoundMatch) {
    return `Hồ sơ thay thế '${replacementNotFoundMatch[1]}' không tồn tại.`;
  }

  // Civilization building & grid errors
  const reqLevelMatch = trimmed.match(
    /^Building "(.+)" requires Player Level (\d+) \(current: (\d+)\)$/
  );
  if (reqLevelMatch) {
    const bName = resolveBuildingDisplayByRawName(locale, reqLevelMatch[1]);
    return `Công trình "${bName}" yêu cầu Player Level ${reqLevelMatch[2]} (hiện tại: Lv. ${reqLevelMatch[3]}).`;
  }

  const reqFocusMatch = trimmed.match(
    /^Building "(.+)" requires (\d+) lifetime focus minutes \(current: (\d+)\)$/
  );
  if (reqFocusMatch) {
    const bName = resolveBuildingDisplayByRawName(locale, reqFocusMatch[1]);
    return `Công trình "${bName}" yêu cầu ${reqFocusMatch[2]} phút tập trung tích lũy (hiện tại: ${reqFocusMatch[3]} phút).`;
  }

  const reqEraMatch = trimmed.match(
    /^Building "(.+)" requires Era ([A-Z_]+) \(current: ([A-Z_]+)\)$/
  );
  if (reqEraMatch) {
    const bName = resolveBuildingDisplayByRawName(locale, reqEraMatch[1]);
    const reqEra = getLocalizedEraName(locale, reqEraMatch[2]);
    const curEra = getLocalizedEraName(locale, reqEraMatch[3]);
    return `Công trình "${bName}" yêu cầu Thời đại ${reqEra} (hiện tại: ${curEra}).`;
  }

  const buildingCoinsMatch = trimmed.match(
    /^Insufficient coins: building "(.+)" costs (\d+) Coins \(current balance: ([\d.]+)\)$/
  );
  if (buildingCoinsMatch) {
    const bName = resolveBuildingDisplayByRawName(locale, buildingCoinsMatch[1]);
    return `Không đủ Coin: "${bName}" cần ${buildingCoinsMatch[2]} Coin (số dư: ${buildingCoinsMatch[3]}).`;
  }

  const cannotPlaceMatch = trimmed.match(/^Cannot place building: (.+)$/);
  if (cannotPlaceMatch) {
    return `Không thể đặt công trình: ${translatePlacementReason(locale, cannotPlaceMatch[1])}.`;
  }

  const gridPlaceMatch = trimmed.match(/^Grid placement failed: (.+)$/);
  if (gridPlaceMatch) {
    return `Đặt công trình trên bản đồ thất bại: ${translatePlacementReason(locale, gridPlaceMatch[1])}.`;
  }

  const unknownDefMatch = trimmed.match(/^Unknown building definition: "(.+)"$/);
  if (unknownDefMatch) {
    return `Không nhận diện được công trình "${unknownDefMatch[1]}".`;
  }

  const instanceNotFoundMatch = trimmed.match(/^Building instance "(.+)" not found$/);
  if (instanceNotFoundMatch) {
    return `Không tìm thấy công trình "${instanceNotFoundMatch[1]}".`;
  }

  const removalFailedMatch = trimmed.match(/^Building removal failed: (.+)$/);
  if (removalFailedMatch) {
    return `Phá dỡ công trình thất bại: ${removalFailedMatch[1]}.`;
  }

  // Land expansion errors
  const expandLevelMatch = trimmed.match(
    /^Land expansion #(\d+) requires Player Level (\d+) \(current: (\d+)\)$/
  );
  if (expandLevelMatch) {
    return `Mở rộng đất lần #${expandLevelMatch[1]} yêu cầu Player Level ${expandLevelMatch[2]} (hiện tại: Lv. ${expandLevelMatch[3]}).`;
  }

  const expandCoinsMatch = trimmed.match(
    /^Insufficient coins: chunk expansion #(\d+) costs (\d+) Coins \(current balance: ([\d.]+)\)$/
  );
  if (expandCoinsMatch) {
    return `Không đủ Coin: mở rộng đất lần #${expandCoinsMatch[1]} cần ${expandCoinsMatch[2]} Coin (số dư: ${expandCoinsMatch[3]}).`;
  }

  const expandFailedMatch = trimmed.match(/^Land expansion failed: (.+)$/);
  if (expandFailedMatch) {
    return `Mở rộng đất thất bại: ${translateExpansionReason(locale, expandFailedMatch[1])}.`;
  }

  // Session coordinator parameterized errors
  const activeStartMatch = trimmed.match(
    /^Cannot start session: a session is already in status '(.+)'\.$/
  );
  if (activeStartMatch) {
    return `Không thể bắt đầu phiên mới: đã có phiên ở trạng thái '${activeStartMatch[1]}'.`;
  }

  const missingProfileStartMatch = trimmed.match(
    /^Cannot start session: profile with ID '(.+)' not found\.$/
  );
  if (missingProfileStartMatch) {
    return `Không thể bắt đầu phiên: không tìm thấy hồ sơ '${missingProfileStartMatch[1]}'.`;
  }

  const resetActiveMatch = trimmed.match(
    /^Cannot reset active session with status '(.+)'\. Finish or give up first\.$/
  );
  if (resetActiveMatch) {
    return `Không thể đặt lại phiên đang hoạt động ('${resetActiveMatch[1]}'). Hãy hoàn thành hoặc kết thúc trước.`;
  }

  const trackNotFoundMatch = trimmed.match(
    /^Track '(.+)' was not found in the Lofi music catalog\.$/
  );
  if (trackNotFoundMatch) {
    return `Không tìm thấy bài nhạc '${trackNotFoundMatch[1]}' trong thư viện nhạc Lofi.`;
  }

  // Quest coordinator parameterized errors
  const unknownQuestMatch = trimmed.match(/^Unknown quest "(.+)"\.$/);
  if (unknownQuestMatch) {
    return `Không tìm thấy nhiệm vụ "${unknownQuestMatch[1]}".`;
  }

  const questPeriodMismatchMatch = trimmed.match(
    /^Quest "(.+)" does not belong to period (DAILY|WEEKLY)\.$/
  );
  if (questPeriodMismatchMatch) {
    const periodLabel = questPeriodMismatchMatch[2] === 'DAILY' ? 'Hàng ngày' : 'Hàng tuần';
    return `Nhiệm vụ "${questPeriodMismatchMatch[1]}" không thuộc chu kỳ ${periodLabel}.`;
  }

  const questAlreadyClaimedMatch = trimmed.match(
    /^Quest "(.+)" reward has already been claimed\.$/
  );
  if (questAlreadyClaimedMatch) {
    return `Phần thưởng nhiệm vụ "${questAlreadyClaimedMatch[1]}" đã được nhận trước đó.`;
  }

  const questExpiredMatch = trimmed.match(
    /^Quest "(.+)" reward expired after period reset\.$/
  );
  if (questExpiredMatch) {
    return `Phần thưởng nhiệm vụ "${questExpiredMatch[1]}" đã hết hạn sau khi qua chu kỳ mới.`;
  }

  const questNotCompletedMatch = trimmed.match(
    /^Quest "(.+)" is not completed yet \((\d+)\/(\d+)\)\.$/
  );
  if (questNotCompletedMatch) {
    return `Nhiệm vụ "${questNotCompletedMatch[1]}" chưa hoàn thành (${questNotCompletedMatch[2]}/${questNotCompletedMatch[3]}).`;
  }

  return trimmed;
}
