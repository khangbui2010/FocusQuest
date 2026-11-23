import { ErrorCode, ErrorParams } from '../../types/errors.ts';

export interface DomainValidationResult {
  isValid: boolean;
  normalizedDomain: string;
  error?: string;
  errorCode?: ErrorCode;
  errorParams?: ErrorParams;
}

// Dangerous top-level or overly broad wildcards that must be prohibited
const FORBIDDEN_WILDCARDS = new Set([
  '*',
  '*.*',
  '*.com',
  '*.org',
  '*.net',
  '*.edu',
  '*.gov',
  '*.io',
  '*.co',
  '*.vn',
]);

export class DomainNormalizer {
  /**
   * Extract clean, lowercased hostname from raw user input or navigation URL.
   * Strips schemes (http://, https://), ports, paths, queries, and hash fragments.
   */
  static normalizeHostname(rawInput: string): string {
    if (!rawInput || typeof rawInput !== 'string') return '';

    let clean = rawInput.trim().toLowerCase();

    // Remove protocol
    clean = clean.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');

    // Remove userinfo (e.g. user:pass@)
    const atIndex = clean.indexOf('@');
    if (atIndex !== -1) {
      clean = clean.slice(atIndex + 1);
    }

    // Remove path, query, hash
    const slashIndex = clean.indexOf('/');
    if (slashIndex !== -1) {
      clean = clean.slice(0, slashIndex);
    }
    const queryIndex = clean.indexOf('?');
    if (queryIndex !== -1) {
      clean = clean.slice(0, queryIndex);
    }
    const hashIndex = clean.indexOf('#');
    if (hashIndex !== -1) {
      clean = clean.slice(0, hashIndex);
    }

    // Remove port if present
    const colonIndex = clean.indexOf(':');
    if (colonIndex !== -1) {
      clean = clean.slice(0, colonIndex);
    }

    // Strip trailing dots
    clean = clean.replace(/\.+$/, '');

    return clean;
  }

  /**
   * Validate a domain pattern for an allowlist entry.
   * Prohibits overly broad wildcards and malformed entries.
   */
  static validateAllowlistPattern(pattern: string): DomainValidationResult {
    const normalized = this.normalizeHostname(pattern);

    if (!normalized) {
      return {
        isValid: false,
        normalizedDomain: '',
        error: 'Domain pattern cannot be empty.',
        errorCode: 'DOMAIN_EMPTY',
      };
    }

    if (FORBIDDEN_WILDCARDS.has(normalized)) {
      return {
        isValid: false,
        normalizedDomain: normalized,
        error: `Pattern '${pattern}' is too broad and would disable website blocking protection.`,
        errorCode: 'DOMAIN_PATTERN_TOO_BROAD',
        errorParams: { pattern },
      };
    }

    // Check valid domain characters (letters, numbers, hyphens, dots, optional leading '*.' or '*.')
    const patternRegex = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

    // Also support exact match without subdomain wildcard
    if (!patternRegex.test(normalized)) {
      return {
        isValid: false,
        normalizedDomain: normalized,
        error: `Invalid domain format: '${pattern}'. Example valid formats: 'wikipedia.org', '*.github.com'.`,
        errorCode: 'DOMAIN_INVALID_FORMAT',
        errorParams: { pattern },
      };
    }

    return { isValid: true, normalizedDomain: normalized };
  }

  /**
   * Check whether a target hostname is permitted by an allowlist rule pattern.
   * 
   * Strict security guarantees:
   * - EXACT match: 'wikipedia.org' matches 'wikipedia.org'
   * - SUBDOMAIN matching:
   *     If pattern is 'wikipedia.org', it ALSO matches 'en.wikipedia.org' and 'www.wikipedia.org'
   *     If pattern is '*.wikipedia.org', it matches 'en.wikipedia.org' and 'wikipedia.org'
   * - REJECTS lookalike / spoofed domains:
   *     'notwikipedia.org' does NOT match 'wikipedia.org'
   *     'mywikipedia.org' does NOT match 'wikipedia.org'
   *     'wikipedia.org.attacker.com' does NOT match 'wikipedia.org'
   *     'evil-github.com' does NOT match 'github.com'
   */
  static isHostAllowedByPattern(targetHostname: string, pattern: string): boolean {
    const cleanTarget = this.normalizeHostname(targetHostname);
    const cleanPattern = this.normalizeHostname(pattern);

    if (!cleanTarget || !cleanPattern) return false;

    // Exact hostname match
    if (cleanTarget === cleanPattern) {
      return true;
    }

    // Strip leading '*.' if present on pattern
    const baseDomain = cleanPattern.startsWith('*.')
      ? cleanPattern.slice(2)
      : cleanPattern;

    // If target equals the base domain
    if (cleanTarget === baseDomain) {
      return true;
    }

    // Must be a proper subdomain ending with '.' + baseDomain
    // Example: cleanTarget = "en.wikipedia.org", baseDomain = "wikipedia.org"
    // Suffix check: cleanTarget.endsWith("." + baseDomain)
    const subdomainSuffix = '.' + baseDomain;
    if (cleanTarget.endsWith(subdomainSuffix)) {
      return true;
    }

    // All lookalikes like "evilwikipedia.org" or "wikipedia.org.phishing.com" will fail!
    return false;
  }

  /**
   * Check if a URL / hostname is allowed across a full allowlist.
   */
  static isUrlAllowed(urlOrHost: string, allowedPatterns: string[]): boolean {
    if (!allowedPatterns || allowedPatterns.length === 0) {
      return false; // Allowlist-only: empty allowlist blocks everything
    }

    const targetHost = this.normalizeHostname(urlOrHost);
    if (!targetHost) return false;

    return allowedPatterns.some((pattern) =>
      this.isHostAllowedByPattern(targetHost, pattern)
    );
  }
}
