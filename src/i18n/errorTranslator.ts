import { getAllBuildingDefinitions } from '../core/civilization/buildingCatalog.ts';
import { AppError, ErrorCode, ErrorParams, extractCodedError } from '../types/errors.ts';
import {
  getLocalizedBuildingName,
  getLocalizedEraName,
} from '../ui/utils/buildingI18n.ts';
import { SupportedLocale } from './types.ts';

export interface UiErrorPayload {
  message?: string | null;
  code?: string | null;
  params?: ErrorParams;
}

export function toUiErrorPayload(
  err: unknown,
  fallbackCode: ErrorCode = 'ACTION_FAILED',
  fallbackMessage?: string
): UiErrorPayload {
  if (err instanceof AppError) {
    return {
      message: err.message,
      code: err.code,
      params: err.params,
    };
  }
  const extracted = extractCodedError(err);
  const rawMessage = extracted.message && extracted.message.trim().length > 0
    ? extracted.message
    : fallbackMessage;
  return {
    message: rawMessage,
    code: extracted.code ?? fallbackCode,
    params: extracted.params,
  };
}

export const ALL_KNOWN_ERROR_CODES: readonly ErrorCode[] = [
  'ACTION_FAILED',
  'WORKER_UNREACHABLE',
  'EMPTY_RESPONSE',
  'INVALID_MESSAGE_FORMAT',
  'UNKNOWN_ACTION',
  'MISSING_START_SESSION_FIELDS',
  'INVALID_SESSION_MODE',
  'INVALID_TARGET_MINUTES',
  'SESSION_ALREADY_ACTIVE',
  'SESSION_PROFILE_NOT_FOUND',
  'SESSION_INVALID_JOB_ASSIGNMENT',
  'SESSION_JOB_NOT_FOUND',
  'SESSION_JOB_DUPLICATE',
  'SESSION_JOB_TOO_MANY',
  'SESSION_JOB_INSUFFICIENT_CREW',
  'SESSION_JOB_UPGRADE_ORDER',
  'NO_ACTIVE_SESSION_PAUSE',
  'NO_SESSION_RESUME',
  'NO_SESSION_GIVE_UP',
  'STOPWATCH_GIVE_UP_DISALLOWED',
  'NO_ACTIVE_STOPWATCH_FINISH',
  'COUNTDOWN_FINISH_STOPWATCH_DISALLOWED',
  'INVALID_TIMER_TRANSITION',
  'POMODORO_EARLY_COMPLETE_STOPWATCH',
  'POMODORO_EARLY_COMPLETE_FOCUS',
  'CANNOT_SKIP_BREAK_IN_FOCUS',
  'INVALID_POMODORO_ALARM',
  'SESSION_CANNOT_RESET_ACTIVE',
  'EXIT_SESSION_FAILED',
  'SKIP_BREAK_FAILED',
  'MISSING_PROFILE_ID',
  'MISSING_CREATE_PROFILE_NAME',
  'MISSING_RENAME_PROFILE_FIELDS',
  'MISSING_DOMAIN_FIELDS',
  'ACTIVE_SESSION_LOCK_ALLOWLIST',
  'ACTIVE_SESSION_LOCK_PROFILE_CREATE',
  'ACTIVE_SESSION_LOCK_PROFILE_RENAME',
  'ACTIVE_SESSION_LOCK_PROFILE_DELETE',
  'ACTIVE_SESSION_LOCK_PROFILE_SWITCH',
  'PROFILE_NAME_EMPTY',
  'PROFILE_NAME_TOO_LONG',
  'PROFILE_DUPLICATE_NAME',
  'PROFILE_NOT_FOUND',
  'PROFILE_SET_ACTIVE_NOT_FOUND',
  'PROFILE_DELETE_LAST',
  'PROFILE_REPLACEMENT_NOT_FOUND',
  'NO_PROFILES_IN_STORAGE',
  'DOMAIN_EMPTY',
  'DOMAIN_PATTERN_TOO_BROAD',
  'DOMAIN_INVALID_FORMAT',
  'PROFILE_CREATE_INVALID_DOMAIN',
  'PROFILE_ADD_INVALID_DOMAIN',
  'PROFILE_UPDATE_INVALID_ALLOWLIST',
  'SWITCH_PROFILE_FAILED',
  'CREATE_PROFILE_FAILED',
  'RENAME_PROFILE_FAILED',
  'DELETE_PROFILE_FAILED',
  'ADD_DOMAIN_FAILED',
  'REMOVE_DOMAIN_FAILED',
  'CIV_INVALID_PLACE_PAYLOAD',
  'CIV_INVALID_BUILDING_DEF_ID',
  'CIV_INVALID_POSITION',
  'CIV_UNKNOWN_BUILDING_DEF',
  'CIV_REQUIRES_LEVEL',
  'CIV_REQUIRES_FOCUS_MINUTES',
  'CIV_REQUIRES_ERA',
  'CIV_INSUFFICIENT_BUILDING_COINS',
  'CIV_CANNOT_PLACE_BUILDING',
  'CIV_GRID_PLACEMENT_FAILED',
  'CIV_ECONOMY_BUILDING_LIMIT_REACHED',
  'CIV_INVALID_BUILDING_INSTANCE_ID',
  'CIV_BUILDING_NOT_FOUND',
  'CIV_BUILDING_REMOVAL_FAILED',
  'CIV_INVALID_UPGRADE_PAYLOAD',
  'CIV_UPGRADE_REQUEST_FAILED',
  'BUILDING_NOT_FOUND',
  'BUILDING_MAX_LEVEL',
  'UPGRADE_PLAYER_LEVEL_REQUIRED',
  'BUILDING_LEVEL_MISMATCH',
  'CIV_UPGRADE_NOT_SUPPORTED',
  'CIV_UPGRADE_ERA_LOCKED',
  'CIV_INVALID_EXPAND_PAYLOAD',
  'CIV_EXPAND_UNSUPPORTED_FIELDS',
  'CIV_INVALID_EXPAND_ORIGIN_TYPE',
  'CIV_INVALID_EXPAND_ORIGIN_GRID',
  'CIV_EXPAND_REQUIRES_LEVEL',
  'CIV_INSUFFICIENT_EXPAND_COINS',
  'CIV_LAND_EXPANSION_FAILED',
  'CIV_LOAD_FAILED',
  'CIV_PLACE_REQUEST_FAILED',
  'CIV_REMOVE_REQUEST_FAILED',
  'CIV_EXPAND_REQUEST_FAILED',
  'CIV_INVALID_VILLAGER_ROLE',
  'CIV_NO_VILLAGE_CAVE',
  'CIV_VILLAGER_CAPACITY_REACHED',
  'CIV_VILLAGER_INSUFFICIENT_COINS',
  'CIV_CAVE_HAS_VILLAGERS',
  'CIV_VILLAGE_CAVE_LIMIT_REACHED',
  'CIV_NOT_ENOUGH_VILLAGERS',
  'CIV_BUILDING_UNDER_CONSTRUCTION',
  'CIV_JOB_NOT_FOUND',
  'CIV_EXPAND_ALREADY_QUEUED',
  'CIV_INVALID_CANCEL_JOB_PAYLOAD',
  'CIV_CANCEL_JOB_REQUEST_FAILED',
  'CIV_INVALID_FOUNDER_PAYLOAD',
  'CIV_FOUNDER_ALREADY_SELECTED',
  'CIV_FOUNDER_NOT_SELECTED',
  'INVALID_LANGUAGE',
  'INVALID_CHIME_FLAG',
  'INVALID_MUSIC_PLAYER_EXPANDED_FLAG',
  'MUSIC_COORDINATOR_NOT_INITIALIZED',
  'MUSIC_INVALID_SEEK_POSITION',
  'MUSIC_INVALID_VOLUME',
  'MUSIC_INVALID_SHUFFLE_FLAG',
  'MUSIC_INVALID_REPEAT_MODE',
  'MUSIC_TRACK_NOT_FOUND',
  'MUSIC_CATALOG_FETCH_FAILED',
  'MUSIC_CATALOG_MALFORMED_JSON',
  'MUSIC_PLAYBACK_AUTOPLAY_BLOCKED',
  'MUSIC_PLAYBACK_NETWORK',
  'MUSIC_PLAYBACK_DECODE',
  'MUSIC_PLAYBACK_UNKNOWN',
  'INVALID_QUEST_PAYLOAD',
  'UNKNOWN_QUEST',
  'QUEST_PERIOD_MISMATCH',
  'QUEST_ALREADY_CLAIMED',
  'QUEST_EXPIRED',
  'QUEST_NOT_COMPLETED',
] as const;

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
  if (upper === 'PLACEMENT REJECTED' || upper === 'PLACEMENT INVALID') return 'vị trí đặt không hợp lệ';
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

function getSafeGenericError(locale: SupportedLocale): string {
  return locale === 'vi'
    ? 'Đã xảy ra lỗi. Vui lòng thử lại.'
    : 'Something went wrong. Please try again.';
}

function isTechnicalErrorString(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return (
    /^(TypeError|SyntaxError|ReferenceError|RangeError|URIError|EvalError):/.test(trimmed) ||
    /\bat\s+[\w.$<>]+\s*\(.*:\d+:\d+\)/.test(trimmed) ||
    /\b(\/app\/|C:\\|src\/|dist\/).*\.(ts|tsx|js|jsx)/.test(trimmed) ||
    trimmed.includes('Cannot read properties of ') ||
    trimmed.includes('is not a function') ||
    trimmed.includes('is not defined')
  );
}

function translateDomainReasonByCode(
  locale: SupportedLocale,
  reasonCode: string,
  params?: ErrorParams
): string | null {
  const pattern = params?.pattern !== undefined ? String(params.pattern) : '';
  switch (reasonCode) {
    case 'DOMAIN_EMPTY':
      return locale === 'vi'
        ? 'Tên miền không được để trống.'
        : 'Domain pattern cannot be empty.';
    case 'DOMAIN_PATTERN_TOO_BROAD':
      return locale === 'vi'
        ? pattern
          ? `Mẫu '${pattern}' quá rộng và sẽ làm vô hiệu hóa tính năng chặn trang web.`
          : 'Mẫu tên miền quá rộng và sẽ làm vô hiệu hóa tính năng chặn trang web.'
        : pattern
          ? `Pattern '${pattern}' is too broad and would disable website blocking protection.`
          : 'Pattern is too broad and would disable website blocking protection.';
    case 'DOMAIN_INVALID_FORMAT':
      return locale === 'vi'
        ? pattern
          ? `Định dạng tên miền không hợp lệ: '${pattern}'. Ví dụ hợp lệ: 'wikipedia.org', '*.github.com'.`
          : "Định dạng tên miền không hợp lệ. Ví dụ hợp lệ: 'wikipedia.org', '*.github.com'."
        : pattern
          ? `Invalid domain format: '${pattern}'. Example valid formats: 'wikipedia.org', '*.github.com'.`
          : "Invalid domain format. Example valid formats: 'wikipedia.org', '*.github.com'.";
    default:
      return null;
  }
}

const EXACT_VI_ERROR_MAP: Record<string, string> = {
  // Profile & Allowlist exact messages
  'Profile name cannot be empty or whitespace.': 'Tên hồ sơ không được để trống hoặc chỉ chứa khoảng trắng.',
  'Profile name cannot exceed 50 characters.': 'Tên hồ sơ không được vượt quá 50 ký tự.',
  'Cannot delete the only remaining profile in the system.': 'Không thể xóa hồ sơ duy nhất còn lại trong hệ thống.',
  'No profiles found in storage.': 'Không tìm thấy hồ sơ nào trong bộ nhớ.',
  'Profile not found': 'Không tìm thấy hồ sơ.',
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
  'Could not upgrade building.': 'Không thể nâng cấp công trình.',
  'Upgrade request failed.': 'Yêu cầu nâng cấp công trình thất bại.',
  'UPGRADE_BUILDING requires valid buildingId and expectedLevel.':
    'Yêu cầu nâng cấp cần mã công trình và cấp hiện tại hợp lệ.',
  'Could not expand territory.': 'Không thể mở rộng lãnh thổ.',
  'Expansion request failed.': 'Yêu cầu mở rộng lãnh thổ thất bại.',
  'You need a Rock Shelter to recruit villagers.': 'Bạn cần xây Hang trú ẩn trước khi tuyển dân làng.',
  'You need a Meditation Cave to recruit villagers.': 'Bạn cần xây Hang trú ẩn trước khi tuyển dân làng.',
  'RECRUIT_VILLAGER requires a valid villager role (elder | crafter | woodworker).':
    'Vai trò dân làng không hợp lệ (chỉ hỗ trợ elder | crafter | woodworker).',
  'RECRUIT_VILLAGER requires a valid villager role.': 'Vai trò dân làng không hợp lệ.',
  'SELECT_FOUNDER requires a valid villager role (elder | crafter | woodworker).':
    'Vai trò dân làng khởi đầu không hợp lệ (chỉ hỗ trợ elder | crafter | woodworker).',
  'Founder villager has already been selected.': 'Dân làng khởi đầu đã được chọn trước đó.',
  'Select a founder villager first.': 'Hãy chọn dân làng khởi đầu trước.',
  'Could not recruit villager.': 'Không thể tuyển dân làng.',
  'Recruitment request failed.': 'Yêu cầu tuyển dân làng thất bại.',
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
  'Failed to skip Pomodoro break.': 'Không thể bỏ qua giờ nghỉ Pomodoro. Vui lòng thử lại.',
  'Manual early interval completion is prohibited in Pomodoro Stopwatch.':
    'Không thể hoàn tất sớm chu kỳ trong Pomodoro Bấm giờ.',
  'Manual early interval completion is prohibited during Focus phase.':
    'Không thể hoàn tất sớm pha tập trung khi chưa hết thời gian.',
  "SET_LANGUAGE requires valid language ('en' | 'vi').": "Ngôn ngữ không hợp lệ (chỉ hỗ trợ 'en' hoặc 'vi').",
  'SET_CHIME_ENABLED requires boolean enabled flag.': 'Cấu hình chuông báo không hợp lệ.',
  'SET_MUSIC_PLAYER_EXPANDED requires boolean expanded flag.': 'Trạng thái thu phóng trình phát nhạc không hợp lệ.',
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

function translateByErrorCode(
  locale: SupportedLocale,
  code: string,
  params?: ErrorParams,
  rawFallback?: string
): string | null {
  const isVi = locale === 'vi';
  const p = params ?? {};
  const str = (key: string, fallback = '') =>
    p[key] !== undefined && p[key] !== null ? String(p[key]) : fallback;

  switch (code) {
    case 'WORKER_UNREACHABLE':
      return isVi ? 'Không thể kết nối tiến trình nền. Vui lòng thử lại.' : 'Background worker unreachable.';
    case 'EMPTY_RESPONSE':
      return isVi ? 'Không nhận được phản hồi từ tiến trình nền.' : 'Empty response received.';
    case 'INVALID_MESSAGE_FORMAT':
      return isVi ? 'Định dạng yêu cầu không hợp lệ.' : 'Invalid message format: missing action field.';
    case 'UNKNOWN_ACTION': {
      const action = str('action');
      return isVi
        ? action
          ? `Thao tác không được hỗ trợ (${action}).`
          : 'Thao tác không được hỗ trợ.'
        : action
          ? `Unknown action: ${action}`
          : 'Unknown action.';
    }
    case 'MISSING_START_SESSION_FIELDS':
      return isVi ? 'Thiếu chế độ hoặc hồ sơ tập trung để bắt đầu phiên.' : 'START_SESSION requires mode and profileId.';
    case 'INVALID_SESSION_MODE': {
      const mode = str('mode');
      return isVi
        ? mode
          ? `Chế độ phiên không hợp lệ (${mode}).`
          : 'Chế độ phiên không hợp lệ.'
        : mode
          ? `Invalid session mode: ${mode}`
          : 'Invalid session mode.';
    }
    case 'INVALID_TARGET_MINUTES':
      return isVi
        ? 'Thời lượng đếm ngược phải nằm trong khoảng 1 đến 1440 phút.'
        : 'COUNTDOWN requires targetMinutes between 1 and 1440.';
    case 'SESSION_ALREADY_ACTIVE': {
      const status = str('status');
      return isVi
        ? status
          ? `Không thể bắt đầu phiên mới: đã có phiên ở trạng thái '${status}'.`
          : 'Không thể bắt đầu phiên mới: đã có phiên đang hoạt động.'
        : status
          ? `Cannot start session: a session is already in status '${status}'.`
          : 'Cannot start session: a session is already active.';
    }
    case 'SESSION_PROFILE_NOT_FOUND': {
      const profileId = str('profileId');
      return isVi
        ? profileId
          ? `Không thể bắt đầu phiên: không tìm thấy hồ sơ '${profileId}'.`
          : 'Không thể bắt đầu phiên: không tìm thấy hồ sơ đã chọn.'
        : profileId
          ? `Cannot start session: profile with ID '${profileId}' not found.`
          : 'Cannot start session: selected profile not found.';
    }
    case 'SESSION_INVALID_JOB_ASSIGNMENT':
      return isVi
        ? 'Danh sách công việc giao cho phiên không hợp lệ.'
        : 'Invalid session construction job assignment.';
    case 'SESSION_JOB_NOT_FOUND':
      return isVi
        ? 'Một công việc được chọn không còn tồn tại trên bản đồ.'
        : 'An assigned construction job no longer exists.';
    case 'SESSION_JOB_DUPLICATE':
      return isVi
        ? 'Không thể chọn trùng cùng một công việc trong phiên.'
        : 'Duplicate construction job ID in session assignment.';
    case 'SESSION_JOB_TOO_MANY': {
      const max = str('max', '4');
      return isVi
        ? `Chỉ được giao tối đa ${max} công việc cùng lúc trong một phiên.`
        : `At most ${max} construction jobs can be assigned concurrently.`;
    }
    case 'SESSION_JOB_INSUFFICIENT_CREW': {
      const required = str('required', '1');
      const available = str('available', '0');
      return isVi
        ? `Công việc đã chọn cần ${required} dân làng (hiện có ${available}).`
        : `Assigned jobs require ${required} villagers, but only ${available} are available.`;
    }
    case 'SESSION_JOB_UPGRADE_ORDER':
      return isVi
        ? 'Công trình cần hoàn thành cấp nâng trước đó trước khi giao cấp tiếp theo.'
        : 'A lower-level upgrade on this building must run before assigning this upgrade.';
    case 'NO_ACTIVE_SESSION_PAUSE':
      return isVi ? 'Không có phiên tập trung đang chạy để tạm dừng.' : 'No active session to pause.';
    case 'NO_SESSION_RESUME':
      return isVi ? 'Không có phiên tập trung để tiếp tục.' : 'No session to resume.';
    case 'NO_SESSION_GIVE_UP':
      return isVi ? 'Không có phiên tập trung để bỏ cuộc.' : 'No session to give up.';
    case 'STOPWATCH_GIVE_UP_DISALLOWED':
      return isVi
        ? 'Chế độ Bấm giờ không dùng bỏ cuộc. Hãy chọn Kết thúc phiên.'
        : "Give up is not applicable to standard Stopwatch sessions. Use 'FINISH'.";
    case 'NO_ACTIVE_STOPWATCH_FINISH':
      return isVi
        ? 'Không có phiên Bấm giờ đang hoạt động để kết thúc.'
        : 'No active stopwatch session to finish.';
    case 'COUNTDOWN_FINISH_STOPWATCH_DISALLOWED':
      return isVi
        ? 'Không thể kết thúc sớm phiên Đếm ngược như Bấm giờ.'
        : "Cannot finish countdown with 'finishStopwatch'. Countdown finishes when target is met.";
    case 'INVALID_TIMER_TRANSITION':
      return isVi
        ? 'Không thể thực hiện chuyển trạng thái đồng hồ ở thời điểm hiện tại.'
        : rawFallback && !isTechnicalErrorString(rawFallback)
          ? rawFallback
          : 'Invalid timer state transition.';
    case 'POMODORO_EARLY_COMPLETE_STOPWATCH':
      return isVi
        ? 'Không thể hoàn tất sớm chu kỳ trong Pomodoro Bấm giờ.'
        : 'Manual early interval completion is prohibited in Pomodoro Stopwatch.';
    case 'POMODORO_EARLY_COMPLETE_FOCUS':
      return isVi
        ? 'Không thể hoàn tất sớm pha tập trung khi chưa hết thời gian.'
        : 'Manual early interval completion is prohibited during Focus phase.';
    case 'CANNOT_SKIP_BREAK_IN_FOCUS':
      return isVi
        ? 'Không thể bỏ qua giờ nghỉ khi đang ở pha Tập trung.'
        : 'Cannot skip break while in Focus phase.';
    case 'INVALID_POMODORO_ALARM':
      return isVi
        ? 'Tín hiệu đồng hồ Pomodoro không hợp lệ hoặc đã hết hạn.'
        : 'Invalid or stale Pomodoro stage alarm.';
    case 'SESSION_CANNOT_RESET_ACTIVE': {
      const status = str('status');
      return isVi
        ? status
          ? `Không thể đặt lại phiên đang hoạt động ('${status}'). Hãy hoàn thành hoặc kết thúc trước.`
          : 'Không thể đặt lại phiên đang hoạt động. Hãy hoàn thành hoặc kết thúc trước.'
        : status
          ? `Cannot reset active session with status '${status}'. Finish or give up first.`
          : 'Cannot reset active session. Finish or give up first.';
    }
    case 'EXIT_SESSION_FAILED':
      return isVi ? 'Không thể thoát phiên tập trung. Vui lòng thử lại.' : 'Failed to exit session.';
    case 'SKIP_BREAK_FAILED':
      return isVi ? 'Không thể bỏ qua giờ nghỉ Pomodoro. Vui lòng thử lại.' : 'Failed to skip Pomodoro break.';
    case 'MISSING_PROFILE_ID':
      return isVi ? 'Thiếu mã hồ sơ để thực hiện thao tác.' : 'Profile ID is required.';
    case 'MISSING_CREATE_PROFILE_NAME':
      return isVi ? 'Vui lòng nhập tên hồ sơ mới.' : 'CREATE_PROFILE requires name.';
    case 'MISSING_RENAME_PROFILE_FIELDS':
      return isVi ? 'Thiếu mã hồ sơ hoặc tên mới.' : 'RENAME_PROFILE requires profileId and newName.';
    case 'MISSING_DOMAIN_FIELDS':
      return isVi ? 'Thiếu thông tin hồ sơ hoặc tên miền.' : 'Profile ID and domain pattern are required.';
    case 'ACTIVE_SESSION_LOCK_ALLOWLIST':
      return isVi
        ? 'Không thể chỉnh sửa danh sách cho phép khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'
        : 'Allowlist cannot be modified during a focus session. Finish your session first.';
    case 'ACTIVE_SESSION_LOCK_PROFILE_CREATE':
      return isVi
        ? 'Không thể tạo hồ sơ mới khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'
        : 'Cannot create profile during a focus session. Finish your session first.';
    case 'ACTIVE_SESSION_LOCK_PROFILE_RENAME':
      return isVi
        ? 'Không thể đổi tên hồ sơ khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'
        : 'Cannot rename profile during a focus session. Finish your session first.';
    case 'ACTIVE_SESSION_LOCK_PROFILE_DELETE':
      return isVi
        ? 'Không thể xóa hồ sơ khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'
        : 'Cannot delete profile during a focus session. Finish your session first.';
    case 'ACTIVE_SESSION_LOCK_PROFILE_SWITCH':
      return isVi
        ? 'Không thể đổi hồ sơ đang dùng khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'
        : 'Cannot switch active profile during a focus session. Finish your session first.';
    case 'PROFILE_NAME_EMPTY':
      return isVi
        ? 'Tên hồ sơ không được để trống hoặc chỉ chứa khoảng trắng.'
        : 'Profile name cannot be empty or whitespace.';
    case 'PROFILE_NAME_TOO_LONG':
      return isVi ? 'Tên hồ sơ không được vượt quá 50 ký tự.' : 'Profile name cannot exceed 50 characters.';
    case 'PROFILE_DUPLICATE_NAME': {
      const name = str('name');
      return isVi
        ? name
          ? `Hồ sơ có tên '${name}' đã tồn tại.`
          : 'Tên hồ sơ đã tồn tại.'
        : name
          ? `A profile with the name '${name}' already exists.`
          : 'A profile with that name already exists.';
    }
    case 'PROFILE_NOT_FOUND': {
      const profileId = str('profileId');
      return isVi
        ? profileId
          ? `Không tìm thấy hồ sơ với mã '${profileId}'.`
          : 'Không tìm thấy hồ sơ.'
        : profileId
          ? `Profile with ID '${profileId}' not found.`
          : 'Profile not found.';
    }
    case 'PROFILE_SET_ACTIVE_NOT_FOUND': {
      const profileId = str('profileId');
      return isVi
        ? profileId
          ? `Không thể chọn hồ sơ: không tìm thấy mã '${profileId}'.`
          : 'Không thể chọn hồ sơ đang dùng.'
        : profileId
          ? `Cannot set active profile: ID '${profileId}' not found.`
          : 'Cannot set active profile.';
    }
    case 'PROFILE_DELETE_LAST':
      return isVi
        ? 'Không thể xóa hồ sơ duy nhất còn lại trong hệ thống.'
        : 'Cannot delete the only remaining profile in the system.';
    case 'PROFILE_REPLACEMENT_NOT_FOUND': {
      const profileId = str('profileId');
      return isVi
        ? profileId
          ? `Hồ sơ thay thế '${profileId}' không tồn tại.`
          : 'Hồ sơ thay thế không tồn tại.'
        : profileId
          ? `Replacement active profile with ID '${profileId}' does not exist.`
          : 'Replacement active profile does not exist.';
    }
    case 'NO_PROFILES_IN_STORAGE':
      return isVi ? 'Không tìm thấy hồ sơ nào trong bộ nhớ.' : 'No profiles found in storage.';
    case 'DOMAIN_EMPTY':
    case 'DOMAIN_PATTERN_TOO_BROAD':
    case 'DOMAIN_INVALID_FORMAT':
      return translateDomainReasonByCode(locale, code, params);
    case 'PROFILE_CREATE_INVALID_DOMAIN': {
      const reasonCode = str('reasonCode');
      const sub =
        (reasonCode ? translateDomainReasonByCode(locale, reasonCode, params) : null) ??
        (isVi ? translateDomainSubError(str('reason')) : str('reason'));
      return isVi
        ? sub
          ? `Không thể tạo hồ sơ: ${sub}`
          : 'Không thể tạo hồ sơ vì tên miền không hợp lệ.'
        : sub
          ? `Cannot create profile: ${sub}`
          : 'Cannot create profile: invalid domain pattern.';
    }
    case 'PROFILE_ADD_INVALID_DOMAIN': {
      const reasonCode = str('reasonCode');
      const sub =
        (reasonCode ? translateDomainReasonByCode(locale, reasonCode, params) : null) ??
        (isVi ? translateDomainSubError(str('reason')) : str('reason'));
      return isVi
        ? sub
          ? `Không thể thêm tên miền: ${sub}`
          : 'Không thể thêm tên miền vì định dạng không hợp lệ.'
        : sub
          ? `Cannot add domain: ${sub}`
          : 'Cannot add domain: invalid domain pattern.';
    }
    case 'PROFILE_UPDATE_INVALID_ALLOWLIST': {
      const reasonCode = str('reasonCode');
      const sub =
        (reasonCode ? translateDomainReasonByCode(locale, reasonCode, params) : null) ??
        (isVi ? translateDomainSubError(str('reason')) : str('reason'));
      return isVi
        ? sub
          ? `Không thể cập nhật danh sách cho phép: ${sub}`
          : 'Không thể cập nhật danh sách cho phép.'
        : sub
          ? `Cannot update allowlist: ${sub}`
          : 'Cannot update allowlist.';
    }
    case 'SWITCH_PROFILE_FAILED':
      return isVi ? 'Không thể chuyển hồ sơ.' : 'Failed to switch profile.';
    case 'CREATE_PROFILE_FAILED':
      return isVi ? 'Không thể tạo hồ sơ mới.' : 'Failed to create profile.';
    case 'RENAME_PROFILE_FAILED':
      return isVi ? 'Không thể đổi tên hồ sơ.' : 'Failed to rename profile.';
    case 'DELETE_PROFILE_FAILED':
      return isVi ? 'Không thể xóa hồ sơ.' : 'Failed to delete profile.';
    case 'ADD_DOMAIN_FAILED':
      return isVi ? 'Không thể thêm tên miền.' : 'Failed to add domain.';
    case 'REMOVE_DOMAIN_FAILED':
      return isVi ? 'Không thể xóa tên miền.' : 'Failed to remove domain.';
    case 'CIV_INVALID_PLACE_PAYLOAD':
      return isVi ? 'Dữ liệu đặt công trình không hợp lệ.' : 'PLACE_BUILDING requires payload object.';
    case 'CIV_INVALID_BUILDING_DEF_ID':
      return isVi ? 'Thiếu mã loại công trình hợp lệ.' : 'PLACE_BUILDING requires valid buildingDefinitionId.';
    case 'CIV_INVALID_POSITION':
      return isVi ? 'Thiếu tọa độ đặt công trình hợp lệ.' : 'PLACE_BUILDING requires valid position coordinates.';
    case 'CIV_UNKNOWN_BUILDING_DEF': {
      const defId = str('buildingDefinitionId') || str('buildingId');
      return isVi
        ? defId
          ? `Không nhận diện được công trình "${defId}".`
          : 'Không nhận diện được công trình đã chọn.'
        : defId
          ? `Unknown building definition: "${defId}"`
          : 'Unknown building definition.';
    }
    case 'CIV_REQUIRES_LEVEL': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const req = str('requiredLevel', '?');
      const cur = str('currentLevel', '?');
      return isVi
        ? `Công trình "${bName}" yêu cầu Player Level ${req} (hiện tại: Lv. ${cur}).`
        : `Building "${bName}" requires Player Level ${req} (current: ${cur})`;
    }
    case 'CIV_REQUIRES_FOCUS_MINUTES': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const req = str('requiredMinutes', '?');
      const cur = str('currentMinutes', '?');
      return isVi
        ? `Công trình "${bName}" yêu cầu ${req} phút tập trung tích lũy (hiện tại: ${cur} phút).`
        : `Building "${bName}" requires ${req} lifetime focus minutes (current: ${cur})`;
    }
    case 'CIV_REQUIRES_ERA': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const reqEra = str('requiredEra') ? getLocalizedEraName(locale, str('requiredEra')) : str('requiredEra');
      const curEra = str('currentEra') ? getLocalizedEraName(locale, str('currentEra')) : str('currentEra');
      return isVi
        ? `Công trình "${bName}" yêu cầu Thời đại ${reqEra} (hiện tại: ${curEra}).`
        : `Building "${bName}" requires Era ${reqEra || str('requiredEra')} (current: ${curEra || str('currentEra')})`;
    }
    case 'CIV_INSUFFICIENT_BUILDING_COINS': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const cost = str('cost', '?');
      const balance = str('balance', '?');
      return isVi
        ? `Không đủ Coin: "${bName}" cần ${cost} Coin (số dư: ${balance}).`
        : `Insufficient coins: building "${bName}" costs ${cost} Coins (current balance: ${balance})`;
    }
    case 'CIV_CANNOT_PLACE_BUILDING': {
      const reason = translatePlacementReason(locale, str('reason', 'Placement rejected'));
      return isVi ? `Không thể đặt công trình: ${reason}.` : `Cannot place building: ${reason}`;
    }
    case 'CIV_GRID_PLACEMENT_FAILED': {
      const reason = translatePlacementReason(locale, str('reason', 'Placement rejected'));
      return isVi ? `Đặt công trình trên bản đồ thất bại: ${reason}.` : `Grid placement failed: ${reason}`;
    }
    case 'CIV_ECONOMY_BUILDING_LIMIT_REACHED': {
      const limit = str('limit', '4');
      const current = str('currentCount', limit);
      const rawName = str('buildingName');
      const bName = rawName ? resolveBuildingDisplayByRawName(locale, rawName) : '';
      if (bName) {
        return isVi
          ? `Đã đạt giới hạn xây dựng cho "${bName}" (${current}/${limit}).`
          : `Build Limit reached for "${bName}" (${current}/${limit} placed).`;
      }
      return isVi
        ? `Đã đạt giới hạn xây dựng (${current}/${limit}).`
        : `Build Limit reached (${current}/${limit} placed).`;
    }
    case 'CIV_INVALID_BUILDING_INSTANCE_ID':
      return isVi ? 'Thiếu mã công trình cần xóa.' : 'REMOVE_BUILDING requires valid buildingInstanceId.';
    case 'CIV_BUILDING_NOT_FOUND': {
      const id = str('buildingInstanceId');
      return isVi
        ? id
          ? `Không tìm thấy công trình "${id}".`
          : 'Không tìm thấy công trình cần xóa.'
        : id
          ? `Building instance "${id}" not found`
          : 'Building instance not found.';
    }
    case 'CIV_BUILDING_REMOVAL_FAILED': {
      const reason = str('reason');
      return isVi
        ? reason
          ? `Phá dỡ công trình thất bại: ${reason}.`
          : 'Phá dỡ công trình thất bại.'
        : reason
          ? `Building removal failed: ${reason}`
          : 'Building removal failed.';
    }
    case 'CIV_INVALID_UPGRADE_PAYLOAD':
      return isVi
        ? 'Yêu cầu nâng cấp cần mã công trình và cấp hiện tại hợp lệ.'
        : 'UPGRADE_BUILDING requires valid buildingId and expectedLevel.';
    case 'CIV_UPGRADE_REQUEST_FAILED':
      return isVi ? 'Không thể nâng cấp công trình.' : 'Could not upgrade building.';
    case 'BUILDING_NOT_FOUND': {
      const id = str('buildingId');
      return isVi
        ? id
          ? `Không tìm thấy công trình "${id}".`
          : 'Không tìm thấy công trình cần nâng cấp.'
        : id
          ? `Building "${id}" not found.`
          : 'Building not found.';
    }
    case 'BUILDING_MAX_LEVEL': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const maxLv = str('maxLevel', '?');
      return isVi
        ? `Công trình "${bName}" đã đạt cấp tối đa (Lv. ${maxLv}).`
        : `Building "${bName}" is already at max level (Lv. ${maxLv}).`;
    }
    case 'UPGRADE_PLAYER_LEVEL_REQUIRED': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const req = str('requiredLevel', '?');
      const cur = str('currentLevel', '?');
      return isVi
        ? `Nâng cấp "${bName}" yêu cầu Player Level ${req} (hiện tại: Lv. ${cur}).`
        : `Upgrading "${bName}" requires Player Level ${req} (current: Lv. ${cur}).`;
    }
    case 'BUILDING_LEVEL_MISMATCH': {
      const exp = str('expectedLevel', '?');
      const cur = str('currentLevel', '?');
      return isVi
        ? `Cấp công trình đã thay đổi (kỳ vọng Lv. ${exp}, hiện tại Lv. ${cur}). Vui lòng thử lại.`
        : `Building level changed concurrently (expected Lv. ${exp}, current Lv. ${cur}). Please try again.`;
    }
    case 'CIV_UPGRADE_NOT_SUPPORTED': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      return isVi
        ? `Công trình "${bName}" giữ nguyên hiệu ứng hiện tại và không thể nâng cấp.`
        : `Building "${bName}" keeps its fixed effect and cannot be upgraded.`;
    }
    case 'CIV_UPGRADE_ERA_LOCKED': {
      const bName = resolveBuildingDisplayByRawName(locale, str('buildingName', 'Building'));
      const reqEra = str('requiredEra') ? getLocalizedEraName(locale, str('requiredEra')) : str('requiredEra');
      return isVi
        ? `Nâng cấp "${bName}" yêu cầu Thời đại ${reqEra}.`
        : `Upgrading "${bName}" requires Era ${reqEra || str('requiredEra')}.`;
    }
    case 'CIV_INVALID_EXPAND_PAYLOAD':
      return isVi ? 'Dữ liệu mở rộng đất không hợp lệ.' : 'EXPAND_LAND requires payload object.';
    case 'CIV_EXPAND_UNSUPPORTED_FIELDS':
      return isVi
        ? 'Yêu cầu mở rộng đất chỉ hỗ trợ tọa độ phân khu.'
        : 'EXPAND_LAND requires origin coordinates only; direction and slotIndex are not supported.';
    case 'CIV_INVALID_EXPAND_ORIGIN_TYPE':
      return isVi ? 'Thiếu tọa độ phân khu mở rộng hợp lệ.' : 'EXPAND_LAND requires valid origin coordinates.';
    case 'CIV_INVALID_EXPAND_ORIGIN_GRID': {
      const w = str('chunkWidth', '4');
      const h = str('chunkHeight', '4');
      return isVi
        ? `Mở rộng đất thất bại: tọa độ không khớp lưới phân khu ${w}×${h}.`
        : `Land expansion failed: INVALID_ORIGIN (origin must align to ${w}x${h} chunk grid).`;
    }
    case 'CIV_EXPAND_REQUIRES_LEVEL': {
      const idx = str('purchaseIndex', '1');
      const req = str('requiredLevel', '?');
      const cur = str('currentLevel', '?');
      return isVi
        ? `Mở rộng đất lần #${idx} yêu cầu Player Level ${req} (hiện tại: Lv. ${cur}).`
        : `Land expansion #${idx} requires Player Level ${req} (current: ${cur})`;
    }
    case 'CIV_INSUFFICIENT_EXPAND_COINS': {
      const idx = str('purchaseIndex', '1');
      const cost = str('cost', '?');
      const balance = str('balance', '?');
      return isVi
        ? `Không đủ Coin: mở rộng đất lần #${idx} cần ${cost} Coin (số dư: ${balance}).`
        : `Insufficient coins: chunk expansion #${idx} costs ${cost} Coins (current balance: ${balance})`;
    }
    case 'CIV_LAND_EXPANSION_FAILED': {
      const reason = translateExpansionReason(locale, str('reason', 'cannot expand chunk'));
      return isVi ? `Mở rộng đất thất bại: ${reason}.` : `Land expansion failed: ${reason}`;
    }
    case 'CIV_LOAD_FAILED':
      return isVi ? 'Không thể tải dữ liệu Nền Văn Minh.' : 'Failed to load civilization state.';
    case 'CIV_PLACE_REQUEST_FAILED':
      return isVi ? 'Không thể đặt công trình tại vị trí đó.' : 'Could not place building at that location.';
    case 'CIV_REMOVE_REQUEST_FAILED':
      return isVi ? 'Không thể phá dỡ công trình.' : 'Could not remove building.';
    case 'CIV_EXPAND_REQUEST_FAILED':
      return isVi ? 'Không thể mở rộng lãnh thổ.' : 'Could not expand territory.';
    case 'CIV_INVALID_VILLAGER_ROLE': {
      const role = str('role');
      return isVi
        ? role
          ? `Vai trò dân làng không hợp lệ ("${role}").`
          : 'Vai trò dân làng không hợp lệ.'
        : role
          ? `Invalid villager role ("${role}").`
          : 'RECRUIT_VILLAGER requires a valid villager role.';
    }
    case 'CIV_NO_VILLAGE_CAVE':
      return isVi
        ? 'Bạn cần xây Hang trú ẩn trước khi tuyển dân làng.'
        : 'You need a Rock Shelter to recruit villagers.';
    case 'CIV_VILLAGER_CAPACITY_REACHED': {
      const current = str('currentCount');
      const capacity = str('capacity');
      return isVi
        ? current && capacity
          ? `Làng đã đạt sức chứa tối đa (${current}/${capacity}). Hãy nâng cấp Hang trú ẩn để thêm chỗ.`
          : 'Làng đã đạt sức chứa tối đa. Hãy nâng cấp Hang trú ẩn để thêm chỗ.'
        : current && capacity
          ? `Village capacity reached (${current}/${capacity}). Upgrade your Rock Shelter to house more villagers.`
          : 'Village capacity reached. Upgrade your Rock Shelter to house more villagers.';
    }
    case 'CIV_VILLAGER_INSUFFICIENT_COINS': {
      const cost = str('cost');
      const balance = str('balance');
      return isVi
        ? cost && balance
          ? `Không đủ Coin: tuyển dân làng cần ${cost} Coin (số dư: ${balance}).`
          : 'Không đủ Coin để tuyển dân làng.'
        : cost && balance
          ? `Insufficient coins: recruiting a villager costs ${cost} Coins (current balance: ${balance}).`
          : 'Insufficient coins to recruit a villager.';
    }
    case 'CIV_CAVE_HAS_VILLAGERS': {
      const count = str('count');
      return isVi
        ? count
          ? `Không thể phá dỡ Hang trú ẩn khi đang có ${count} dân làng sinh sống.`
          : 'Không thể phá dỡ Hang trú ẩn khi vẫn còn dân làng sinh sống.'
        : count
          ? `Cannot demolish Rock Shelter while ${count} villagers live in the village.`
          : 'Cannot demolish Rock Shelter while villagers still live in the village.';
    }
    case 'CIV_VILLAGE_CAVE_LIMIT_REACHED': {
      const limit = str('limit', '1');
      const current = str('currentCount', limit);
      const rawName = str('buildingName');
      const bName = rawName ? resolveBuildingDisplayByRawName(locale, rawName) : '';
      return isVi
        ? bName
          ? `Chỉ được xây tối đa ${limit} "${bName}" trên bản đồ (${current}/${limit}).`
          : `Chỉ được xây tối đa ${limit} Hang trú ẩn trên bản đồ (${current}/${limit}).`
        : bName
          ? `Only ${limit} "${bName}" may be built on the map (${current}/${limit} placed).`
          : `Only ${limit} Rock Shelter may be built on the map (${current}/${limit} placed).`;
    }
    case 'CIV_NOT_ENOUGH_VILLAGERS': {
      const required = str('requiredCrew', '1');
      const total = str('totalVillagers', '0');
      return isVi
        ? `Cần tối thiểu ${required} dân làng để thực hiện việc này (hiện có ${total}).`
        : `Requires at least ${required} villagers for this job (currently ${total}).`;
    }
    case 'CIV_BUILDING_UNDER_CONSTRUCTION':
      return isVi
        ? 'Công trình đang được xây dựng và chưa thể nâng cấp.'
        : 'This building is still under construction and cannot be upgraded yet.';
    case 'CIV_JOB_NOT_FOUND':
      return isVi
        ? 'Không tìm thấy công việc xây dựng cần hủy.'
        : 'Construction job not found.';
    case 'CIV_EXPAND_ALREADY_QUEUED':
      return isVi
        ? 'Ô đất này đang được khai phá.'
        : 'This territory chunk is already being cleared.';
    case 'CIV_INVALID_CANCEL_JOB_PAYLOAD':
      return isVi
        ? 'Thiếu mã công việc hợp lệ để hủy.'
        : 'CANCEL_CONSTRUCTION_JOB requires a valid jobId.';
    case 'CIV_CANCEL_JOB_REQUEST_FAILED':
      return isVi
        ? 'Không thể hủy công việc xây dựng.'
        : 'Could not cancel construction job.';
    case 'CIV_INVALID_FOUNDER_PAYLOAD': {
      const role = str('role');
      return isVi
        ? role
          ? `Vai trò dân làng khởi đầu không hợp lệ ("${role}").`
          : 'Vai trò dân làng khởi đầu không hợp lệ.'
        : role
          ? `Invalid starting villager role ("${role}").`
          : 'SELECT_FOUNDER requires a valid villager role.';
    }
    case 'CIV_FOUNDER_ALREADY_SELECTED':
      return isVi
        ? 'Dân làng khởi đầu đã được chọn trước đó và không thể thay đổi.'
        : 'Starting villager has already been selected and cannot be changed.';
    case 'CIV_FOUNDER_NOT_SELECTED':
      return isVi
        ? 'Hãy chọn dân làng khởi đầu trước.'
        : 'Please select your starting villager first.';
    case 'INVALID_LANGUAGE':
      return isVi ? "Ngôn ngữ không hợp lệ (chỉ hỗ trợ 'en' hoặc 'vi')." : "SET_LANGUAGE requires valid language ('en' | 'vi').";
    case 'INVALID_CHIME_FLAG':
      return isVi ? 'Cấu hình chuông báo không hợp lệ.' : 'SET_CHIME_ENABLED requires boolean enabled flag.';
    case 'INVALID_MUSIC_PLAYER_EXPANDED_FLAG':
      return isVi
        ? 'Trạng thái thu phóng trình phát nhạc không hợp lệ.'
        : 'SET_MUSIC_PLAYER_EXPANDED requires boolean expanded flag.';
    case 'MUSIC_COORDINATOR_NOT_INITIALIZED':
      return isVi ? 'Trình điều phối nhạc chưa được khởi tạo.' : 'Music coordinator is not initialized.';
    case 'MUSIC_INVALID_SEEK_POSITION':
      return isVi ? 'Vị trí tua nhạc không hợp lệ.' : 'MUSIC_SEEK requires finite numeric positionSec.';
    case 'MUSIC_INVALID_VOLUME':
      return isVi ? 'Mức âm lượng không hợp lệ.' : 'MUSIC_SET_VOLUME requires finite numeric volume.';
    case 'MUSIC_INVALID_SHUFFLE_FLAG':
      return isVi ? 'Cài đặt phát ngẫu nhiên không hợp lệ.' : 'MUSIC_SET_SHUFFLE requires boolean enabled flag.';
    case 'MUSIC_INVALID_REPEAT_MODE':
      return isVi ? 'Chế độ lặp lại không hợp lệ.' : "MUSIC_SET_REPEAT requires mode ('off' | 'all' | 'one').";
    case 'MUSIC_TRACK_NOT_FOUND': {
      const trackId = str('trackId');
      return isVi
        ? trackId
          ? `Không tìm thấy bài nhạc '${trackId}' trong thư viện nhạc Lofi.`
          : 'Không tìm thấy bài nhạc trong thư viện nhạc Lofi.'
        : trackId
          ? `Track '${trackId}' was not found in the Lofi music catalog.`
          : 'Track was not found in the Lofi music catalog.';
    }
    case 'MUSIC_CATALOG_FETCH_FAILED':
      return isVi
        ? 'Không thể tải danh sách nhạc Lofi trực tuyến. Hãy kiểm tra kết nối mạng và thử lại.'
        : 'Unable to load online Lofi catalog. Check your internet connection and retry.';
    case 'MUSIC_CATALOG_MALFORMED_JSON':
      return isVi
        ? 'Dữ liệu danh sách nhạc trực tuyến bị lỗi định dạng JSON.'
        : 'Malformed JSON in remote music catalog.';
    case 'MUSIC_PLAYBACK_AUTOPLAY_BLOCKED':
    case 'autoplay_blocked':
      return isVi
        ? 'Trình duyệt chặn tự động phát âm thanh. Hãy bấm Phát để bắt đầu nghe nhạc.'
        : 'Audio playback failed (autoplay_blocked).';
    case 'MUSIC_PLAYBACK_NETWORK':
    case 'network':
      if (rawFallback && EXACT_VI_ERROR_MAP[rawFallback]) {
        return isVi ? EXACT_VI_ERROR_MAP[rawFallback] : rawFallback;
      }
      return isVi
        ? 'Không thể tải luồng nhạc do lỗi mạng. Hãy kiểm tra kết nối Internet.'
        : 'Audio playback failed (network).';
    case 'MUSIC_PLAYBACK_DECODE':
    case 'decode':
      return isVi ? 'Không thể giải mã tệp âm thanh trực tuyến.' : 'Audio playback failed (decode).';
    case 'MUSIC_PLAYBACK_UNKNOWN':
    case 'unknown':
      if (rawFallback && EXACT_VI_ERROR_MAP[rawFallback]) {
        return isVi ? EXACT_VI_ERROR_MAP[rawFallback] : rawFallback;
      }
      return isVi ? 'Lỗi phát âm thanh không xác định.' : 'Audio playback failed (unknown).';
    case 'INVALID_QUEST_PAYLOAD':
      return isVi
        ? 'Yêu cầu nhận thưởng nhiệm vụ không hợp lệ.'
        : rawFallback && !isTechnicalErrorString(rawFallback)
          ? EXACT_VI_ERROR_MAP[rawFallback]
            ? rawFallback
            : 'Invalid quest reward claim request.'
          : 'CLAIM_QUEST_REWARD requires payload with period and questId.';
    case 'UNKNOWN_QUEST': {
      const questId = str('questId');
      return isVi
        ? questId
          ? `Không tìm thấy nhiệm vụ "${questId}".`
          : 'Không tìm thấy nhiệm vụ này.'
        : questId
          ? `Unknown quest "${questId}".`
          : 'Unknown quest.';
    }
    case 'QUEST_PERIOD_MISMATCH': {
      const questId = str('questId');
      const period = str('period');
      const periodLabelVi = period === 'DAILY' ? 'Hàng ngày' : 'Hàng tuần';
      return isVi
        ? questId
          ? `Nhiệm vụ "${questId}" không thuộc chu kỳ ${periodLabelVi}.`
          : 'Nhiệm vụ không khớp chu kỳ yêu cầu.'
        : questId && period
          ? `Quest "${questId}" does not belong to period ${period}.`
          : 'Quest does not belong to requested period.';
    }
    case 'QUEST_ALREADY_CLAIMED': {
      const questId = str('questId');
      return isVi
        ? questId
          ? `Phần thưởng nhiệm vụ "${questId}" đã được nhận trước đó.`
          : 'Phần thưởng nhiệm vụ đã được nhận trước đó.'
        : questId
          ? `Quest "${questId}" reward has already been claimed.`
          : 'Quest reward has already been claimed.';
    }
    case 'QUEST_EXPIRED': {
      const questId = str('questId');
      return isVi
        ? questId
          ? `Phần thưởng nhiệm vụ "${questId}" đã hết hạn sau khi qua chu kỳ mới.`
          : 'Phần thưởng nhiệm vụ đã hết hạn sau khi qua chu kỳ mới.'
        : questId
          ? `Quest "${questId}" reward expired after period reset.`
          : 'Quest reward expired after period reset.';
    }
    case 'QUEST_NOT_COMPLETED': {
      const questId = str('questId');
      const progress = str('progress');
      const target = str('target');
      return isVi
        ? questId && progress && target
          ? `Nhiệm vụ "${questId}" chưa hoàn thành (${progress}/${target}).`
          : 'Nhiệm vụ chưa hoàn thành.'
        : questId && progress && target
          ? `Quest "${questId}" is not completed yet (${progress}/${target}).`
          : 'Quest is not completed yet.';
    }
    case 'ACTION_FAILED': {
      if (rawFallback && !isTechnicalErrorString(rawFallback)) {
        if (!isVi) return rawFallback;
        const translatedFromRaw = translateRawVietnamese(locale, rawFallback);
        if (translatedFromRaw !== rawFallback) {
          return translatedFromRaw;
        }
      }
      return getSafeGenericError(locale);
    }
    default:
      return null;
  }
}

function translateRawVietnamese(locale: SupportedLocale, trimmed: string): string {
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

/**
 * Translate structured ErrorCode + optional ErrorParams and/or raw backend/coordinator
 * error strings for the active UI locale.
 * Sanitizes technical errors / stack traces so raw internals never leak to the UI.
 */
export function localizeErrorMessage(
  locale: SupportedLocale,
  rawError: string | null | undefined,
  errorCode?: string | null,
  errorParams?: ErrorParams
): string {
  const trimmedRaw = typeof rawError === 'string' ? rawError.trim() : '';

  if (errorCode) {
    const byCode = translateByErrorCode(locale, errorCode, errorParams, trimmedRaw);
    if (byCode) {
      return byCode;
    }
  }

  if (!trimmedRaw) return '';

  if (isTechnicalErrorString(trimmedRaw)) {
    return getSafeGenericError(locale);
  }

  if (locale !== 'vi') {
    return trimmedRaw;
  }

  return translateRawVietnamese(locale, trimmedRaw);
}
