import * as path from 'path';
import * as fs from 'fs-extra';
import { loadConfig, loadEnvFile, resolveEnvVars, findProjectRoot } from '../../../src/core/config/loader';

const validConfigYaml = `
name: test-project
version: "1.0.0"
dependencies:
  - type: npm
    command: npm install
    path: .
databases: []
`;

describe('config loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(require('os').tmpdir(), `devkit-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('resolveEnvVars', () => {
    it('replaces ${VAR} with env value', () => {
      const result = resolveEnvVars('hello ${FOO} world', { FOO: 'bar' });
      expect(result).toBe('hello bar world');
    });

    it('uses process.env when not in provided env', () => {
      process.env.TEST_RESOLVE_VAR = 'from-process';
      const result = resolveEnvVars('value: ${TEST_RESOLVE_VAR}');
      expect(result).toBe('value: from-process');
      delete process.env.TEST_RESOLVE_VAR;
    });

    it('leaves unresolved var as-is and logs warning', () => {
      const result = resolveEnvVars('hello ${MISSING_VAR} world', {});
      expect(result).toBe('hello ${MISSING_VAR} world');
    });
  });

  describe('loadEnvFile', () => {
    it('does not throw when .env does not exist', async () => {
      await expect(loadEnvFile(tempDir)).resolves.toBeUndefined();
    });

    it('loads .env when present', async () => {
      await fs.writeFile(path.join(tempDir, '.env'), 'LOADER_TEST=loaded\n');
      await loadEnvFile(tempDir);
      expect(process.env.LOADER_TEST).toBe('loaded');
      delete process.env.LOADER_TEST;
    });
  });

  describe('loadConfig', () => {
    it('throws when .dev-env.yml does not exist', async () => {
      await expect(loadConfig(tempDir)).rejects.toThrow(/Configuration file not found/);
      await expect(loadConfig(tempDir)).rejects.toThrow(/\.dev-env\.yml/);
    });

    it('loads and parses valid YAML config', async () => {
      const configPath = path.join(tempDir, '.dev-env.yml');
      await fs.writeFile(configPath, validConfigYaml);

      const config = await loadConfig(tempDir);
      expect(config.name).toBe('test-project');
      expect(config.version).toBe('1.0.0');
      expect(config.dependencies).toHaveLength(1);
      expect(config.dependencies![0].type).toBe('npm');
    });

    it('throws on invalid YAML', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'invalid: yaml: [[[');

      await expect(loadConfig(tempDir)).rejects.toThrow();
    });

    it('throws on invalid schema (missing name)', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'version: "1.0.0"\ndependencies: []');

      await expect(loadConfig(tempDir)).rejects.toThrow(/Invalid configuration/);
    });
  });

  describe('findProjectRoot', () => {
    it('returns directory containing .dev-env.yml', async () => {
      const subDir = path.join(tempDir, 'a', 'b', 'c');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: root');

      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });

    it('returns directory containing package.json when no .dev-env.yml', async () => {
      const subDir = path.join(tempDir, 'a', 'b');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(tempDir, 'package.json'), '{}');

      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });

    it('returns cwd when no markers found', async () => {
      const found = await findProjectRoot(tempDir);
      expect(found).toBe(process.cwd());
    });
  });
});
