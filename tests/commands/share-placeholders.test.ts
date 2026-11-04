import { sanitizeConfigForShare } from '../../src/commands/share';
import type { DevEnvConfig } from '../../src/types/config';

const sanitize = (config: Record<string, unknown>): DevEnvConfig =>
  sanitizeConfigForShare({ name: 't', ...config } as unknown as DevEnvConfig);

describe('share placeholders', () => {
  describe('databases', () => {
    it('keeps the conventional DB_USER/DB_PASSWORD for a single database', () => {
      const out = sanitize({ databases: [{ type: 'postgresql', user: 'u', password: 'p' }] });
      expect(out.databases[0]).toMatchObject({ user: '${DB_USER}', password: '${DB_PASSWORD}' });
    });

    it('gives each of several databases its own placeholders', () => {
      const out = sanitize({
        databases: [
          { type: 'postgresql', name: 'main-db', user: 'a', password: 'pa' },
          { type: 'mysql', user: 'b', password: 'pb' },
          { type: 'redis', name: 'cache', password: 'pc' },
        ],
      });
      expect(out.databases.map((d) => [d.user, d.password])).toEqual([
        ['${DB_MAIN_DB_USER}', '${DB_MAIN_DB_PASSWORD}'],
        ['${DB_MYSQL_2_USER}', '${DB_MYSQL_2_PASSWORD}'],
        [undefined, '${DB_CACHE_PASSWORD}'],
      ]);
    });

    it('keeps credentials that already are a single ${VAR} reference', () => {
      const out = sanitize({
        databases: [
          { type: 'postgresql', user: '${PG_USER}', password: '${PG_PASSWORD}' },
          { type: 'mysql', user: '${MYSQL_USER}', password: 'literal' },
        ],
      });
      expect(out.databases[0]).toMatchObject({ user: '${PG_USER}', password: '${PG_PASSWORD}' });
      expect(out.databases[1]).toMatchObject({ user: '${MYSQL_USER}', password: '${DB_MYSQL_2_PASSWORD}' });
    });
  });

  describe('env', () => {
    it('keeps non-secret values and masks secret keys', () => {
      const out = sanitize({ env: { NODE_ENV: 'development', LOG_LEVEL: 'debug', DB_PASSWORD: 'x', API_TOKEN: 'y' } });
      expect(out.env).toEqual({
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DB_PASSWORD: '${DB_PASSWORD}',
        API_TOKEN: '${API_TOKEN}',
      });
    });

    it('masks any value with literal URL credentials, but not one built from references', () => {
      const out = sanitize({
        env: {
          DATABASE_URL: 'postgres://admin:s3cret@db:5432/app',
          SAFE_URL: 'postgres://${DB_USER}:${DB_PASSWORD}@db:5432/app',
          PLAIN_URL: 'http://localhost:3000/x',
        },
      });
      expect(out.env).toEqual({
        DATABASE_URL: '${DATABASE_URL}',
        SAFE_URL: 'postgres://${DB_USER}:${DB_PASSWORD}@db:5432/app',
        PLAIN_URL: 'http://localhost:3000/x',
      });
    });

    it('leaves a secret key that already is a reference alone', () => {
      expect(sanitize({ env: { API_KEY: '${OTHER_NAME}' } }).env).toEqual({ API_KEY: '${OTHER_NAME}' });
    });
  });

  describe('health checks', () => {
    it('uses the short names for a single check', () => {
      const out = sanitize({
        health_checks: [{ name: 'db', type: 'postgresql', connection_string: 'postgres://u:p@h/d', url: 'https://u:p@h/x' }],
      });
      expect(out.health_checks[0]).toMatchObject({ connection_string: '${CONNECTION_STRING}', url: '${HEALTH_CHECK_URL}' });
    });

    it('keeps a connection string whose credentials are references, masks literal and non-URL ones', () => {
      const out = sanitize({
        health_checks: [
          { name: 'a', type: 'postgresql', connection_string: 'postgres://${DB_USER}:${DB_PASSWORD}@h:5432/d' },
          { name: 'b', type: 'postgresql', connection_string: 'postgres://root:pw@h/d' },
          { name: 'c', type: 'mssql', connection_string: 'Server=h;Password=pw' },
        ],
      });
      expect(out.health_checks.map((h) => h.connection_string)).toEqual([
        'postgres://${DB_USER}:${DB_PASSWORD}@h:5432/d',
        '${B_CONNECTION_STRING}',
        '${C_CONNECTION_STRING}',
      ]);
    });

    it('does not treat a reference in a secret-looking query parameter as a literal', () => {
      const out = sanitize({
        health_checks: [
          { name: 'a', type: 'http', url: 'https://h/x?token=${T}' },
          { name: 'b', type: 'http', url: 'https://h/x?token=abc' },
        ],
      });
      expect(out.health_checks.map((h) => h.url)).toEqual(['https://h/x?token=${T}', '${B_URL}']);
    });
  });
});
