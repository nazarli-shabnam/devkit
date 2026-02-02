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
        expect.stringContaining('Passwords detected')
      );
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
  });
});
