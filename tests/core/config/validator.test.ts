import { validateConfig, checkConfigWarnings } from '../../../src/core/config/validator';
import type { DevEnvConfig } from '../../../src/types/config';
import { logger } from '../../../src/utils/logger';

describe('validator', () => {
  describe('validateConfig', () => {
    it('returns parsed config for valid input', () => {
      const input = { name: 'my-app', dependencies: [], databases: [] };
      const result = validateConfig(input);
      expect(result.name).toBe('my-app');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('databases');
    });

    it('throws with message listing issues for invalid input', () => {
      expect(() => validateConfig({})).toThrow(/Configuration validation failed/);
      expect(() => validateConfig({ name: 123 })).toThrow(/validation failed/);
    });

    it('accepts full valid config', () => {
      const config = {
        name: 'app',
        version: '1.0.0',
        dependencies: [{ type: 'npm', command: 'npm i', path: '.' }],
        databases: [{ type: 'postgresql', port: 5432 }],
        services: [],
        env: {},
        health_checks: [],
      };
      const result = validateConfig(config);
      expect(result.name).toBe('app');
      expect(result.databases).toHaveLength(1);
    });
  });

  describe('checkConfigWarnings', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('does not warn when no passwords in config', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'redis' as const, port: 6379, host: 'localhost' }],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn when password is env placeholder ${VAR}', () => {
      const config = {
        name: 'app',
        databases: [
          {
            type: 'postgresql' as const,
            port: 5432,
            host: 'localhost',
            user: '${DB_USER}',
            password: '${DB_PASSWORD}',
            database: 'db',
          },
        ],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns when plain password in config', () => {
      const config = {
        name: 'app',
        databases: [
          {
            type: 'postgresql' as const,
            port: 5432,
            host: 'localhost',
            user: 'u',
            password: 'plaintext',
            database: 'db',
          },
        ],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('secrets detected')
      );
    });

    it('does not warn for benign keys containing the word "password" (e.g. env URLs)', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'redis' as const, port: 6379, host: 'localhost' }],
        env: { PASSWORD_RESET_URL: 'https://example.com/reset' },
      };
      checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('secrets detected'));
    });

    it('returns the list of warnings it emits', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, port: 5432, host: 'localhost', user: 'u', password: 'plain', database: 'db' },
        ],
      };
      const warnings = checkConfigWarnings(config as DevEnvConfig);
      expect(warnings.some((w) => w.includes('secrets detected'))).toBe(true);
    });

    it('warns on a hardcoded secret in the env block (secret-like key)', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'redis' as const, port: 6379, host: 'localhost' }],
        env: { API_KEY: 'sk-live-abc123' },
      };
      checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('secrets detected'));
    });

    it('does not warn on an env placeholder secret value', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'redis' as const, port: 6379, host: 'localhost' }],
        env: { API_KEY: '${API_KEY}' },
      };
      checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns when postgresql missing user or password', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'postgresql' as const, port: 5432, host: 'localhost', database: 'db' }],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing user or password')
      );
    });

    it('warns when mysql missing user or password', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'mysql' as const, port: 3306, host: 'localhost', database: 'db' }],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing user or password')
      );
    });

    it('warns when service port conflicts with database port', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'redis' as const, port: 6379, host: 'localhost' }],
        services: [{ type: 'other' as const, port: 6379, host: 'localhost' }],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 6379')
      );
    });

    it('warns on duplicate port usage', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, port: 5432, host: 'localhost' },
          { type: 'redis' as const, port: 5432, host: 'localhost' },
        ],
      };
      checkConfigWarnings(config as DevEnvConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 5432')
      );
    });

    it('detects conflicts between databases that rely on default ports', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, host: 'localhost' },
          { type: 'postgresql' as const, name: 'second', host: 'localhost' },
        ],
      };
      const warnings = checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnings.some((w) => w.includes('Port 5432'))).toBe(true);
    });

    it('uses the default port when comparing an explicit port against another database', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'redis' as const, host: 'localhost' },
          { type: 'postgresql' as const, port: 6379, host: 'localhost' },
        ],
      };
      const warnings = checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnings.some((w) => w.includes('Port 6379'))).toBe(true);
    });

    it('detects a service port that collides with another service management_port', () => {
      const config = {
        name: 'app',
        services: [
          { type: 'rabbitmq', port: 5672, management_port: 15672, host: 'localhost' },
          { type: 'other', port: 15672, host: 'localhost' },
        ],
      };
      const warnings = checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnings.some((w) => w.includes('Port 15672'))).toBe(true);
    });

    it('does not warn when default ports differ or sqlite has no port', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, user: 'u', password: 'p', host: 'localhost' },
          { type: 'redis' as const, host: 'localhost' },
          { type: 'sqlite' as const, host: 'localhost' },
          { type: 'sqlite' as const, host: 'localhost' },
        ],
      };
      const warnings = checkConfigWarnings(config as unknown as DevEnvConfig);
      expect(warnings.filter((w) => w.includes('Port'))).toEqual([]);
    });
  });
});
