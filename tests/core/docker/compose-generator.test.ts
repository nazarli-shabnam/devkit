import * as path from 'path';
import { generateComposeContent } from '../../../src/core/docker/compose-generator';
import type { DevEnvConfig } from '../../../src/types/config';

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
  });
});
