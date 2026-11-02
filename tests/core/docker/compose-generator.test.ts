import * as path from 'path';
import { generateComposeContent } from '../../../src/core/docker/compose-generator';
import type { DevEnvConfig } from '../../../src/types/config';
import { logger } from '../../../src/utils/logger';

const templatesDir = path.resolve(__dirname, '../../../templates');

describe('compose-generator', () => {
  describe('generateComposeContent', () => {
    it('produces valid YAML with version and network when config has no databases or services', () => {
      const config = {
        name: 'empty-app',
        docker: { network_name: 'my-network' },
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(content).toContain('version:');
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
      expect(content).toContain('interval: "10s"');
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
      expect(content).toContain('interval: "30s"');
      expect(content).toContain('retries: 3');
    });

    it('does not auto-apply a DB healthcheck to a generic service by coincidental type', () => {
      const config = {
        name: 'app',
        services: [{ type: 'redis', port: 6379, host: 'localhost' }],
        docker: {},
      } as DevEnvConfig;
      const content = generateComposeContent(config, templatesDir);
      expect(Object.keys(require('js-yaml').load(content).services)).toContain('redis_1');
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
      expect(content).toContain('interval: "10s"');
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
      const names = Object.keys(require('js-yaml').load(content).services);
      expect(names).toEqual(expect.arrayContaining(['db', 'db_2']));
    });

    describe('environment value rendering', () => {
      const yaml = require('js-yaml');
      const render = (password: string) =>
        generateComposeContent(
          {
            name: 'app',
            databases: [{ type: 'postgresql' as const, user: 'u', password, host: 'localhost' }],
          } as DevEnvConfig,
          templatesDir
        );
      const envOf = (content: string): string[] => yaml.load(content).services.postgresql_1.environment;

      it('does not HTML-escape special characters in values', () => {
        const pw = "p&ss=w'rd<>\"`";
        expect(envOf(render(pw))).toContain(`POSTGRES_PASSWORD=${pw}`);
      });

      it('keeps values containing ": " and " #" as a single literal list item', () => {
        expect(envOf(render('x: y'))).toContain('POSTGRES_PASSWORD=x: y');
        expect(envOf(render('a #b'))).toContain('POSTGRES_PASSWORD=a #b');
      });

      it('escapes $ so Compose does not interpolate literal values', () => {
        expect(envOf(render('pa$word'))).toContain('POSTGRES_PASSWORD=pa$$word');
      });

      it('does not HTML-escape service names, images or versions', () => {
        const content = generateComposeContent(
          { name: 'app', services: [{ type: 'redis', version: '7&x', host: 'localhost' }] } as DevEnvConfig,
          templatesDir
        );
        expect(yaml.load(content).services.redis_1.image).toBe('redis:7&x');
        expect(content).not.toContain('&amp;');
      });
    });

    it('quotes free-form name/version/network so values cannot break YAML or inject keys', () => {
      const yaml = require('js-yaml');
      const content = generateComposeContent(
        {
          name: 'app',
          services: [{ type: 'redis', version: '7\n    privileged: true #x', host: 'localhost' }],
          docker: { network_name: 'n: x' },
        } as DevEnvConfig,
        templatesDir
      );
      const doc = yaml.load(content);
      expect(doc.services.redis_1.image).toBe('redis:7\n    privileged: true #x');
      expect(doc.services.redis_1.privileged).toBeUndefined();
      expect(doc.services.redis_1.networks).toEqual(['n: x']);
      expect(Object.keys(doc.networks)).toEqual(['n: x']);
    });

    it('quotes healthcheck interval/timeout so they cannot inject YAML keys', () => {
      const yaml = require('js-yaml');
      const content = generateComposeContent(
        {
          name: 'app',
          databases: [{ type: 'redis' as const, host: 'localhost' }],
          health_checks: [{ name: 'redis_1', type: 'redis', interval: '5s\n    privileged: true', timeout: '3s' }],
        } as DevEnvConfig,
        templatesDir
      );
      const svc = yaml.load(content).services.redis_1;
      expect(svc.privileged).toBeUndefined();
      expect(svc.healthcheck.interval).toBe('5s\n    privileged: true');
      expect(svc.healthcheck.timeout).toBe('3s');
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
