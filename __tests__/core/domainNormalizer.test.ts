import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomainNormalizer } from '../../src/core/profiles/domainNormalizer.ts';

test('DomainNormalizer: normalizes case, schemes, ports, paths, queries, and fragments', () => {
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('HTTPS://WwW.WiKiPeDiA.ORG/wiki/Computer_science?src=search#heading'),
    'www.wikipedia.org'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('http://localhost:3000/app'),
    'localhost'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('git@github.com:user/repo.git'),
    'github.com'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('   developer.mozilla.org/en-US/   '),
    'developer.mozilla.org'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('wikipedia.org.'),
    'wikipedia.org',
    'Must strip trailing FQDN dot'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('admin:secret@secure.notion.so:8443/home'),
    'secure.notion.so',
    'Must strip userinfo, port and path'
  );
  assert.strictEqual(
    DomainNormalizer.normalizeHostname('xn--hctp-1na6k.vn'),
    'xn--hctp-1na6k.vn',
    'Must preserve standard Punycode IDN hostname'
  );
});

test('DomainNormalizer: correctly matches exact domains and valid subdomains', () => {
  // Exact match
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('wikipedia.org', 'wikipedia.org'),
    true
  );

  // Subdomains matched by root domain pattern
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('en.wikipedia.org', 'wikipedia.org'),
    true
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('vi.wikipedia.org', 'wikipedia.org'),
    true
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('upload.wikimedia.org', 'wikimedia.org'),
    true
  );

  // Subdomains matched by explicit wildcard pattern '*.github.com'
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('gist.github.com', '*.github.com'),
    true
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('github.com', '*.github.com'),
    true
  );
});

test('DomainNormalizer: STRICT SECURITY - Rejects lookalike, spoofed and nested attacker domains', () => {
  // Lookalike prefixes / suffixes
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('notwikipedia.org', 'wikipedia.org'),
    false,
    'Must NOT match notwikipedia.org'
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('mywikipedia.org', 'wikipedia.org'),
    false,
    'Must NOT match mywikipedia.org'
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('evil-github.com', 'github.com'),
    false,
    'Must NOT match evil-github.com'
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('github.com.evil.com', 'github.com'),
    false,
    'Must NOT match phishing domain pretending to be github.com'
  );
  assert.strictEqual(
    DomainNormalizer.isHostAllowedByPattern('wikipedia.org.attacker.com', 'wikipedia.org'),
    false,
    'Must NOT match attacker subdomain targeting wikipedia.org'
  );
});

test('DomainNormalizer: validateAllowlistPattern forbids dangerous and overly broad wildcards', () => {
  const r1 = DomainNormalizer.validateAllowlistPattern('*');
  assert.strictEqual(r1.isValid, false);
  assert.ok(r1.error?.includes('too broad'));

  const r2 = DomainNormalizer.validateAllowlistPattern('*.com');
  assert.strictEqual(r2.isValid, false);

  const r3 = DomainNormalizer.validateAllowlistPattern('*.org');
  assert.strictEqual(r3.isValid, false);

  const r4 = DomainNormalizer.validateAllowlistPattern('');
  assert.strictEqual(r4.isValid, false);

  const rValid1 = DomainNormalizer.validateAllowlistPattern('wikipedia.org');
  assert.strictEqual(rValid1.isValid, true);
  assert.strictEqual(rValid1.normalizedDomain, 'wikipedia.org');

  const rValid2 = DomainNormalizer.validateAllowlistPattern('*.github.com');
  assert.strictEqual(rValid2.isValid, true);
});

test('DomainNormalizer: isUrlAllowed blocks everything if allowlist is empty', () => {
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://wikipedia.org', []), false);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://github.com', []), false);
});

test('DomainNormalizer: isUrlAllowed allows whitelisted domains and blocks other websites', () => {
  const allowlist = ['wikipedia.org', 'scholar.google.com', 'coursera.org'];

  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://en.wikipedia.org/wiki/Main_Page', allowlist), true);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://scholar.google.com/scholar?q=ai', allowlist), true);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://coursera.org/learn/ml', allowlist), true);

  // Distraction sites must be strictly blocked
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://www.youtube.com', allowlist), false);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://facebook.com', allowlist), false);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://reddit.com', allowlist), false);
  assert.strictEqual(DomainNormalizer.isUrlAllowed('https://notwikipedia.org', allowlist), false);
});
