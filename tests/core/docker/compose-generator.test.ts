import * as path from 'path';
import { generateComposeContent } from '../../../src/core/docker/compose-generator';
import type { DevEnvConfig } from '../../../src/types/config';
import { logger } from '../../../src/utils/logger';

const templatesDir = path.resolve(__dirname, '../../../templates');

describe('compose-generator', () => {
  describe('generateComposeContent', () => {
    it('produces valid YAML (no obsolete version key) with network when config has no databases or services', () => {
      const config = {
        name: 'empty-app',
        docker: { network_name: 'my-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).not.toMatch(/^version:/m);
      expect(content).toContain('services:');
      expect(content).toContain('my-network');
      expect(content).toContain('networks:');
    });

    it('includes postgres and redis services from databases', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, port: 5432, database: 'mydb', host: 'localhost' },
          { type: 'redis' as const, port: 6379, host: 'localhost' },
        ],
        docker: { network_name: 'dev-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('postgres');
      expect(content).toContain('redis');
      expect(content).toContain('5432:5432');
      expect(content).toContain('6379:6379');
      expect(content).toContain('POSTGRES_DB');
      expect(content).toContain('mydb');
    });

    it('includes healthcheck for database services', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, port: 5432, host: 'localhost' },
          { type: 'redis' as const, port: 6379, host: 'localhost' },
        ],
        docker: { network_name: 'dev-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('healthcheck:');
      expect(content).toMatch(/pg_isready|postgres/);
      expect(content).toMatch(/redis-cli|ping/);
      expect(content).toContain('interval: 10s');
    });

    it('skips sqlite (no container service)', () => {
      const config = {
        name: 'app',
        databases: [{ type: 'sqlite' as const, host: 'localhost' }],
        docker: {},
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).not.toMatch(/sqlite|sqlite_1/);
      expect(content).toContain('services:');
    });

    it('warns when a database has no Docker image (sqlite)', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      try {
        const config = {
          name: 'app',
          databases: [{ type: 'sqlite' as const, name: 'localdb', host: 'localhost' }],
          docker: {},
        } as DevEnvConfig;
        generateComposeContent(config, templatesDir);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('localdb'));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('adds a healthcheck to a generic service when a matching health_check provides a test', () => {
      const config = {
        name: 'app',
        services: [{ type: 'rabbitmq', port: 5672, host: 'localhost' }],
        health_checks: [
          { name: 'rabbitmq_1', type: 'rabbitmq', test: 'rabbitmq-diagnostics ping', interval: '30s', retries: 3 },
        ],
        docker: {},
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('healthcheck:');
      expect(content).toContain('rabbitmq-diagnostics ping');
      expect(content).toContain('interval: 30s');
      expect(content).toContain('retries: 3');
    });

    it('does not auto-apply a DB healthcheck to a generic service by coincidental type', () => {
      const config = {
        name: 'app',
        services: [{ type: 'redis', port: 6379, host: 'localhost' }],
        docker: {},
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('redis_1:');
      expect(content).not.toContain('healthcheck:');
    });

    it('includes custom service with port and management_port', () => {
      const config = {
        name: 'app',
        services: [
          { type: 'rabbitmq', port: 5672, management_port: 15672, host: 'localhost' },
        ],
        docker: {},
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('rabbitmq');
      expect(content).toContain('5672:5672');
      expect(content).toContain('15672:15672');
    });

    it('uses config.docker.network_name when provided', () => {
      const config = {
        name: 'app',
        docker: { network_name: 'custom-net' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('custom-net');
    });

    it('defaults network to dev-network when docker config is missing', () => {
      const config = { name: 'app' } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('dev-network');
    });

    it('includes healthcheck for mariadb and mongodb when in config', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'mariadb' as const, port: 3306, host: 'localhost' },
          { type: 'mongodb' as const, port: 27017, host: 'localhost' },
        ],
        docker: { network_name: 'dev-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('healthcheck:');
      expect(content).toMatch(/mysqladmin|mongosh/);
      expect(content).toContain('interval: 10s');
    });

    it('deduplicates service names when databases would collide', () => {
      const config = {
        name: 'app',
        databases: [
          { type: 'postgresql' as const, name: 'db', port: 5432, host: 'localhost' },
          { type: 'postgresql' as const, name: 'db', port: 5433, host: 'localhost' },
        ],
        docker: { network_name: 'dev-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      // First one keeps name "db", second should get "db_2"
      expect(content).toContain('db:');
      expect(content).toContain('db_2:');
    });

    describe('service name sanitization', () => {
      const namesOf = (config: Record<string, unknown>): string[] =>
        Object.keys(
          require('js-yaml').load(generateComposeContent({ name: 'app', ...config } as DevEnvConfig, templatesDir)).services
        );

      it('turns namespaced image types into valid service names', () => {
        expect(namesOf({ services: [{ type: 'bitnami/redis', port: 6379, host: 'localhost' }] })).toEqual(['bitnami_redis_1']);
        expect(namesOf({ services: [{ type: 'mcr.microsoft.com/mssql/server', host: 'localhost' }] })).toEqual([
          'mcr.microsoft.com_mssql_server_1',
        ]);
      });

      it('sanitizes explicit database names and warns', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        expect(namesOf({ databases: [{ type: 'postgresql', name: 'my db!', host: 'localhost' }] })).toEqual(['my_db_']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('my db!'));
      });

      it('keeps valid names untouched and still de-duplicates', () => {
        expect(
          namesOf({
            databases: [
              { type: 'postgresql', name: 'app-db', host: 'localhost' },
              { type: 'postgresql', name: 'app-db', host: 'localhost' },
            ],
          })
        ).toEqual(['app-db', 'app-db_2']);
      });

      it('never produces an empty or symbol-leading name', () => {
        expect(namesOf({ databases: [{ type: 'redis', name: '***', host: 'localhost' }] })).toEqual(['service']);
        expect(namesOf({ databases: [{ type: 'redis', name: '.hidden', host: 'localhost' }] })).toEqual(['hidden']);
      });
    });

    describe('mysql/mariadb users', () => {
      const envFor = (db: Record<string, unknown>): string[] => {
        const content = generateComposeContent(
          { name: 'app', databases: [{ type: 'mysql', host: 'localhost', ...db }] } as DevEnvConfig,
          templatesDir
        );
        return require('js-yaml').load(content).services.mysql_1.environment;
      };

      it('sets only MYSQL_ROOT_PASSWORD when user is root', () => {
        const env = envFor({ user: 'root', password: 'pw', database: 'app' });
        expect(env).toContain('MYSQL_ROOT_PASSWORD=pw');
        expect(env.some((e) => e.startsWith('MYSQL_USER='))).toBe(false);
        expect(env.some((e) => e.startsWith('MYSQL_PASSWORD='))).toBe(false);
      });

      it('still creates a regular user alongside the root password', () => {
        const env = envFor({ user: 'app', password: 'pw' });
        expect(env).toEqual(expect.arrayContaining(['MYSQL_ROOT_PASSWORD=pw', 'MYSQL_USER=app', 'MYSQL_PASSWORD=pw']));
      });
    });

    it('throws when templates dir has no docker-compose.hbs', () => {
      const fs = require('fs');
      const os = require('os');
      const emptyDir = path.join(os.tmpdir(), `devkit-no-template-${Date.now()}`);
      fs.mkdirSync(emptyDir, { recursive: true });
      try {
        const config = { name: 'app' } as DevEnvConfig;
        expect(() => generateComposeContent(config, emptyDir)).toThrow(
          /template not found|docker-compose\.hbs/
        );
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
