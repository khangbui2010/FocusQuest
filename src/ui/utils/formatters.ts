/**
 * Utility functions for formatting rewards, numbers, and stats in UI and notification display boundaries.
 *
 * IMPORTANT BOUNDARY:
 * Never call these formatters inside reward engines, economy logic, storage layers,
 * or SessionCoordinator calculations. Full IEEE-754 precision must be preserved until display.
 */

function parsePositiveDecimalString(valueStr: string): { intDigits: string; fracDigits: string } {
  const lower = valueStr.toLowerCase();
  const expIdx = lower.indexOf('e');

  if (expIdx === -1) {
    const dotIdx = lower.indexOf('.');
    if (dotIdx === -1) {
      return { intDigits: lower || '0', fracDigits: '' };
    }
    return {
      intDigits: lower.slice(0, dotIdx) || '0',
      fracDigits: lower.slice(dotIdx + 1),
    };
  }

  const mantissa = lower.slice(0, expIdx);
  const exponent = parseInt(lower.slice(expIdx + 1), 10);
  const dotIdx = mantissa.indexOf('.');
  const rawInt = dotIdx === -1 ? mantissa : mantissa.slice(0, dotIdx);
  const rawFrac = dotIdx === -1 ? '' : mantissa.slice(dotIdx + 1);
  const digits = `${rawInt}${rawFrac}`;
  const decimalPos = rawInt.length + exponent;

  if (decimalPos <= 0) {
    return {
      intDigits: '0',
      fracDigits: `${'0'.repeat(-decimalPos)}${digits}`,
    };
  }

  if (decimalPos >= digits.length) {
    return {
      intDigits: `${digits}${'0'.repeat(decimalPos - digits.length)}`,
      fracDigits: '',
    };
  }

  return {
    intDigits: digits.slice(0, decimalPos) || '0',
    fracDigits: digits.slice(decimalPos),
  };
}

function addOneToDigits(digits: number[]): { result: number[]; carryOut: number } {
  const out = [...digits];
  let carry = 1;
  for (let i = out.length - 1; i >= 0 && carry > 0; i--) {
    const sum = out[i] + carry;
    out[i] = sum % 10;
    carry = Math.floor(sum / 10);
  }
  return { result: out, carryOut: carry };
}

/**
 * Format reward / currency / XP amounts for UI display:
 * - Max `maxDecimals` fractional digits (default: 2)
 * - True decimal half-up rounding (no binary `1.005 * 100` precision loss)
 * - Strips trailing zeros & trailing decimal point ("34.50" -> "34.5", "55.00" -> "55")
 * - Always uses '.' as decimal separator
 * - Never returns "-0"; returns "0" for NaN / Infinity / -Infinity / non-numeric inputs
 */
export function formatRewardAmount(amount: number, maxDecimals: number = 2): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '0';
  }
  if (amount === 0) {
    return '0';
  }

  const decimals =
    typeof maxDecimals === 'number' && Number.isInteger(maxDecimals) && maxDecimals >= 0
      ? Math.min(maxDecimals, 12)
      : 2;

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const { intDigits, fracDigits } = parsePositiveDecimalString(absAmount.toString());

  let roundedIntStr = intDigits.replace(/^0+(?=\d)/, '') || '0';
  let roundedFracStr = fracDigits;

  if (fracDigits.length > decimals) {
    const keptFrac = fracDigits.slice(0, decimals).padEnd(decimals, '0');
    const nextDigit = Number(fracDigits[decimals] ?? '0');

    const intArr = roundedIntStr.split('').map((ch) => Number(ch));
    const fracArr = keptFrac.split('').map((ch) => Number(ch));

    if (nextDigit >= 5) {
      const combined = [...intArr, ...fracArr];
      const { result, carryOut } = addOneToDigits(combined);
      const finalCombined = carryOut > 0 ? [carryOut, ...result] : result;
      const splitIdx = finalCombined.length - decimals;
      roundedIntStr = finalCombined.slice(0, splitIdx).join('');
      roundedFracStr = decimals > 0 ? finalCombined.slice(splitIdx).join('') : '';
    } else {
      roundedFracStr = keptFrac;
    }
  } else {
    roundedFracStr = fracDigits.slice(0, decimals);
  }

  // Strip trailing zeros after decimal point
  roundedFracStr = roundedFracStr.replace(/0+$/, '');
  roundedIntStr = roundedIntStr.replace(/^0+(?=\d)/, '') || '0';

  if (roundedIntStr === '0' && roundedFracStr.length === 0) {
    return '0';
  }

  const sign = isNegative ? '-' : '';
  return roundedFracStr.length > 0
    ? `${sign}${roundedIntStr}.${roundedFracStr}`
    : `${sign}${roundedIntStr}`;
}

export const formatCoinAmount = formatRewardAmount;
export const formatXpAmount = formatRewardAmount;
export const formatDecimalMax2 = formatRewardAmount;
