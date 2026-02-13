import * as path from 'path';
import * as fs from 'fs-extra';
import prompts from 'prompts';
import { runInit } from '../../../src/commands/init';
import { loadConfig, loadConfigOrPromptInit, loadEnvFile, resolveEnvVars, findProjectRoot } from '../../../src/core/config/loader';
import { logger } from '../../../src/utils/logger';

jest.mock('prompts', () => jest.fn());
jest.mock('../../../src/commands/init', () => ({
  runInit: jest.fn(),
}));

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
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      const result = resolveEnvVars('hello ${MISSING_VAR} world', {});
      expect(result).toBe('hello ${MISSING_VAR} world');
      warnSpy.mockRestore();
    });

    it('replaces multiple vars in one string', () => {
      const result = resolveEnvVars('${A}-${B}-${C}', { A: '1', B: '2', C: '3' });
      expect(result).toBe('1-2-3');
    });

    it('provided env overrides process.env for same key', () => {
      process.env.OVERRIDE_TEST = 'process';
      const result = resolveEnvVars('${OVERRIDE_TEST}', { OVERRIDE_TEST: 'provided' });
      expect(result).toBe('provided');
      delete process.env.OVERRIDE_TEST;
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

    it('throws on invalid YAML and message mentions config file and syntax', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'invalid: yaml: [[[');

      const loadPromise = loadConfig(tempDir);
      await expect(loadPromise).rejects.toThrow(/\.dev-env\.yml/);
      await expect(loadPromise).rejects.toThrow(/syntax|YAML|parse/i);
    });

    it('throws on invalid schema (missing name)', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'version: "1.0.0"\ndependencies: []');

      await expect(loadConfig(tempDir)).rejects.toThrow(/Invalid configuration/);
    });

    it('resolves ${VAR} in config from .env when loadEnvFile is called first', async () => {
      await fs.writeFile(path.join(tempDir, '.env'), 'APP_NAME=resolved-app\n');
      await fs.writeFile(
        path.join(tempDir, '.dev-env.yml'),
        'name: ${APP_NAME}\nversion: "1.0.0"\ndatabases: []'
      );
      const config = await loadConfig(tempDir);
      expect(config.name).toBe('resolved-app');
      delete process.env.APP_NAME;
    });

    it('resolves ${VAR} in nested strings (env, connection_string)', async () => {
      await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=xyz\n');
      await fs.writeFile(
        path.join(tempDir, '.dev-env.yml'),
        'name: n\nversion: "1.0.0"\nenv:\n  KEY: ${SECRET}\ndatabases: []'
      );
      const config = await loadConfig(tempDir);
      expect(config.env?.KEY).toBe('xyz');
      delete process.env.SECRET;
    });
  });

  describe('loadConfigOrPromptInit', () => {
    it('returns config without prompting when .dev-env.yml exists', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), validConfigYaml);
      const cfg = await loadConfigOrPromptInit(tempDir);
      expect(cfg.name).toBe('test-project');
      expect(prompts).not.toHaveBeenCalled();
      expect(runInit).not.toHaveBeenCalled();
    });

    it('throws with a helpful message when missing and not a TTY', async () => {
      const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
      const original = stdout.isTTY;
      stdout.isTTY = false;
      try {
        await expect(loadConfigOrPromptInit(tempDir)).rejects.toThrow(/envkit init/);
        await expect(loadConfigOrPromptInit(tempDir)).rejects.toThrow(/Configuration file not found/);
      } finally {
        stdout.isTTY = original;
      }
    });

    it('prompts and throws when user answers no', async () => {
      const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
      const original = stdout.isTTY;
      stdout.isTTY = true;
      jest.mocked(prompts as any).mockResolvedValueOnce({ value: false });
      try {
        await expect(loadConfigOrPromptInit(tempDir)).rejects.toThrow(/envkit init/);
        expect(prompts).toHaveBeenCalled();
        expect(runInit).not.toHaveBeenCalled();
      } finally {
        stdout.isTTY = original;
      }
    });

    it('runs init and then loads config when user answers yes', async () => {
      const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
      const original = stdout.isTTY;
      stdout.isTTY = true;
      jest.mocked(prompts as any).mockResolvedValueOnce({ value: true });

      jest.mocked(runInit).mockImplementationOnce(async (root: string) => {
        await fs.writeFile(path.join(root, '.dev-env.yml'), validConfigYaml);
      });

      try {
        const cfg = await loadConfigOrPromptInit(tempDir);
        expect(prompts).toHaveBeenCalled();
        expect(runInit).toHaveBeenCalledWith(tempDir);
        expect(cfg.name).toBe('test-project');
      } finally {
        stdout.isTTY = original;
      }
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

    it('prefers .dev-env.yml over package.json when both exist', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: from-yaml');
      await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
      const subDir = path.join(tempDir, 'sub');
      await fs.ensureDir(subDir);
      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });

    it('returns directory containing requirements.txt when no .dev-env.yml or package.json', async () => {
      const subDir = path.join(tempDir, 'a', 'b');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), '');
      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });

    it('returns directory containing Cargo.toml when no .dev-env.yml or package.json', async () => {
      const subDir = path.join(tempDir, 'crate', 'src');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(tempDir, 'Cargo.toml'), '[package]\n');
      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });

    it('returns directory containing go.mod when no .dev-env.yml or package.json', async () => {
      const subDir = path.join(tempDir, 'cmd', 'app');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com\n');
      const found = await findProjectRoot(subDir);
      expect(found).toBe(tempDir);
    });
  });
});
