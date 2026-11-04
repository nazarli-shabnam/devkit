import { sanitizeConfigForShare, requiredVariables } from '../../src/commands/share';
import type { DevEnvConfig } from '../../src/types/config';

const sanitize = (config: Record<string, unknown>): DevEnvConfig =>
  sanitizeConfigForShare({ name: 't', ...config } as unknown as DevEnvConfig);

describe('share sanitizer hardening', () => {
  describe('env masking errs on the side of masking', () => {
    it.each([
      'AWS_ACCESS_KEY_ID',
      'SECRET_KEY_BASE',
      'GITHUB_PAT',
      'STRIPE_SK',
      'PRIVATE_KEY_PEM',
      'DB_PASSWD',
      'dbPassword',
      'SESSION_COOKIE',
      'SENTRY_DSN',
    ])('masks %s', (key) => {
      expect(sanitize({ env: { [key]: 'value' } }).env).toEqual({ [key]: `\${${key}}` });
    });

    it.each(['NODE_ENV', 'PORT', 'LOG_LEVEL', 'API_URL', 'FEATURE_FLAGS'])('keeps %s', (key) => {
      expect(sanitize({ env: { [key]: 'plain' } }).env).toEqual({ [key]: 'plain' });
    });

    it('masks values with embedded credentials under an innocent key', () => {
      const out = sanitize({
        env: {
          HOSTS: 'user:pw@h1,h2',
          DB_CONN: 'Server=h;Password=x',
          OPTS: 'a=1&pwd=hunter2',
          MONGO: 'mongodb://root:p/w@mongo/db',
        },
      });
      expect(out.env).toEqual({
        HOSTS: '${HOSTS}',
        DB_CONN: '${DB_CONN}',
        OPTS: '${OPTS}',
        MONGO: '${MONGO}',
      });
    });

    it('does not mask URLs or settings built from references', () => {
      const out = sanitize({
        env: { DB_URL: 'postgres://${U}:${P}@h:5432/d', OPTS: 'a=1&password=${P}', HOST: 'localhost' },
      });
      expect(out.env).toEqual({
        DB_URL: 'postgres://${U}:${P}@h:5432/d',
        OPTS: 'a=1&password=${P}',
        HOST: 'localhost',
      });
    });
  });

  describe('credentials containing / ? # are still detected', () => {
    it.each(['postgres://u:pa/ss@h/d', 'postgres://u:p#w@h/d', 'postgres://u:p?w@h/d'])('masks %s everywhere', (value) => {
      const out = sanitize({
        env: { CONN: value },
        health_checks: [{ name: 'a', type: 'postgresql', connection_string: value, url: value }],
      });
      expect(out.env).toEqual({ CONN: '${CONN}' });
      expect(out.health_checks[0].connection_string).toBe('${CONNECTION_STRING}');
      expect(out.health_checks[0].url).toBe('${HEALTH_CHECK_URL}');
    });
  });

  describe('defaults and unusual separators cannot smuggle a credential through', () => {
    it('treats a ${VAR:-default} in userinfo as a literal credential (only plain ${VAR} is safe)', () => {
      const out = sanitize({
        env: {
          A: 'postgres://${U:-admin}:${P:-hunter2}@h/d',
          B: 'postgres://${U}:${P}@h/d',
        },
      });
      expect(out.env).toEqual({ A: '${A}', B: 'postgres://${U}:${P}@h/d' });
    });

    it('finds secret-looking pairs in the fragment, after ; and with percent-encoded keys', () => {
      const out = sanitize({
        env: {
          FRAG: 'https://h/x#token=abc',
          SEMI: 'https://h/x;password=abc',
          ENC: 'https://h/x?pass%77ord=abc',
          FINE: 'https://h/x?page=2#top',
        },
      });
      expect(out.env).toEqual({
        FRAG: '${FRAG}',
        SEMI: '${SEMI}',
        ENC: '${ENC}',
        FINE: 'https://h/x?page=2#top',
      });
    });

    it('applies to health check urls too, and tolerates malformed percent escapes', () => {
      const out = sanitize({
        health_checks: [
          { name: 'a', type: 'http', url: 'https://h/x#api_key=abc' },
          { name: 'b', type: 'http', url: 'https://h/x?100%=ok&a=1' },
        ],
      });
      expect(out.health_checks.map((h) => h.url)).toEqual(['${A_URL}', 'https://h/x?100%=ok&a=1']);
    });
  });

  describe('URLs with a prefix or embedded in other text', () => {
    it.each([
      'jdbc:postgresql://u:pw@h:5432/d',
      'jdbc:mysql://h/d?user=u&password=pw',
      'driver=mongodb://root:pw@h/d',
    ])('masks %s', (value) => {
      expect(sanitize({ env: { CONN: value } }).env).toEqual({ CONN: '${CONN}' });
      const out = sanitize({ health_checks: [{ name: 'a', type: 'db', connection_string: value }] });
      expect(out.health_checks[0].connection_string).toBe('${CONNECTION_STRING}');
    });

    it('a URL inside other text does not vouch for the text around it', () => {
      for (const value of ['Server=h;Password=x;Url=http://ok.example/', 'Host=h Pwd=secret see http://ok.example']) {
        const out = sanitize({ health_checks: [{ name: 'a', type: 'db', connection_string: value }] });
        expect(out.health_checks[0].connection_string).toBe('${CONNECTION_STRING}');
        expect(sanitize({ env: { CONN: value } }).env).toEqual({ CONN: '${CONN}' });
      }
    });

    it('only a value that is exactly one URL is vouched for (nothing after it)', () => {
      const value = 'https://ok.example/health Authorization: Bearer abc123';
      const out = sanitize({ health_checks: [{ name: 'a', type: 'http', url: value }] });
      // text after the URL means it is not "just a URL": the Bearer token must not survive
      expect(out.health_checks[0].url).not.toContain('abc123');
      expect(sanitize({ env: { HDR: 'https://ok.example/x token=abc' } }).env).toEqual({ HDR: '${HDR}' });
    });

    it('every URL in a value is judged, not just the first', () => {
      const value = 'http://ok.example/a http://u:pw@h/b';
      expect(sanitize({ env: { URLS: value } }).env).toEqual({ URLS: '${URLS}' });
    });

    it('keeps a prefixed URL whose credentials are references', () => {
      const value = 'jdbc:postgresql://${DB_USER}:${DB_PASSWORD}@h/d';
      expect(sanitize({ env: { CONN: value } }).env).toEqual({ CONN: value });
    });
  });

  describe('placeholder ids never collide', () => {
    it('de-duplicates database names that differ only by case or punctuation', () => {
      const out = sanitize({
        databases: [
          { type: 'postgresql', name: 'main-db', user: 'a' },
          { type: 'postgresql', name: 'main_db', user: 'b' },
          { type: 'postgresql', name: 'Main DB', user: 'c' },
        ],
      });
      const users = out.databases.map((d) => d.user);
      expect(new Set(users).size).toBe(3);
      expect(users).toEqual(['${DB_MAIN_DB_USER}', '${DB_MAIN_DB_2_USER}', '${DB_MAIN_DB_3_USER}']);
    });

    it('does not let a generated name collide with an explicit one', () => {
      const out = sanitize({
        databases: [
          { type: 'mysql', name: 'mysql_2', user: 'a' },
          { type: 'mysql', user: 'b' },
        ],
      });
      expect(out.databases.map((d) => d.user)).toEqual(['${DB_MYSQL_2_USER}', '${DB_MYSQL_2_2_USER}']);
    });

    it('gives names without usable characters a positional id', () => {
      const out = sanitize({
        databases: [
          { type: 'redis', name: '***', password: 'a' },
          { type: 'redis', name: '日本語', password: 'b' },
        ],
      });
      expect(out.databases.map((d) => d.password)).toEqual(['${DB_DB_1_PASSWORD}', '${DB_DB_2_PASSWORD}']);
    });

    it('de-duplicates health check placeholders too', () => {
      const out = sanitize({
        health_checks: [
          { name: 'a-b', type: 'http', url: 'https://u:p@h/x' },
          { name: 'a_b', type: 'http', url: 'https://u:p@h/y' },
        ],
      });
      expect(out.health_checks.map((h) => h.url)).toEqual(['${A_B_URL}', '${A_B_2_URL}']);
    });
  });
});

describe('requiredVariables', () => {
  const unset = (...names: string[]): void => names.forEach((n) => delete process.env[n]);
  afterEach(() => unset('RQ_A', 'RQ_B', 'RQ_SET'));

  it('lists unset references, including env placeholders that point at themselves', () => {
    unset('RQ_A', 'RQ_B');
    const raw = {
      env: { RQ_A: '${RQ_A}', PLAIN: 'x' },
      databases: [{ type: 'redis', user: '${RQ_B}', password: '${RQ_A}' }],
    };
    expect(requiredVariables(raw).sort()).toEqual(['RQ_A', 'RQ_B']);
  });

  it('skips set variables, defaults, escapes and names defined by the env block', () => {
    process.env.RQ_SET = '1';
    const raw = {
      env: { DEFINED: 'v' },
      a: '${RQ_SET}',
      b: '${RQ_B:-fallback}',
      c: 'literal $${NOT_A_REF}',
      d: '${DEFINED}',
    };
    expect(requiredVariables(raw)).toEqual([]);
  });

  it('finds adjacent references and ignores non-string input', () => {
    expect(requiredVariables({ x: '${RQ_A}${RQ_B}' }).sort()).toEqual(['RQ_A', 'RQ_B']);
    expect(requiredVariables(undefined)).toEqual([]);
  });
});
