import * as path from 'path';
import * as fs from 'fs-extra';
import {
  sanitizeConfigForShare,
  runShareExport,
  runShareImport,
} from '../../src/commands/share';
import { logger } from '../../src/utils/logger';

jest.spyOn(logger, 'debug').mockImplementation();

describe('share command', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    tempDir = path.join(require('os').tmpdir(), `devkit-share-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  describe('sanitizeConfigForShare', () => {
    it('replaces database password and user with placeholders', () => {
      const config = {
        name: 'test',
        databases: [
          {
            type: 'postgresql' as const,
            port: 5432,
            user: 'admin',
            password: 'secret123',
            database: 'mydb',
          },
        ],
      };
      const out = sanitizeConfigForShare(config as any);
      expect(out.databases).toHaveLength(1);
      expect(out.databases![0].user).toBe('${DB_USER}');
      expect(out.databases![0].password).toBe('${DB_PASSWORD}');
      expect(out.databases![0].database).toBe('mydb');
    });

    it('replaces env values with variable placeholders', () => {
      const config = {
        name: 'test',
        env: { API_KEY: 'sk-secret', PORT: '3000' },
      };
      const out = sanitizeConfigForShare(config as any);
      expect(out.env).toEqual({ API_KEY: '${API_KEY}', PORT: '${PORT}' });
    });

    it('leaves databases without password unchanged except user placeholder', () => {
      const config = {
        name: 'test',
        databases: [{ type: 'redis' as const, port: 6379 }],
      };
      const out = sanitizeConfigForShare(config as any);
      expect(out.databases).toHaveLength(1);
      expect(out.databases![0].port).toBe(6379);
      expect(out.databases![0]).not.toHaveProperty('password');
    });
  });

  describe('runShareExport', () => {
    it('throws when .dev-env.yml is not found', async () => {
      process.chdir(tempDir);
      await expect(runShareExport()).rejects.toThrow(
        /Configuration file not found|\.dev-env\.yml/
      );
    });

    it('writes sanitized YAML to output file', async () => {
      const configYaml = [
        'name: export-test',
        'version: "1.0.0"',
        'databases:',
        '  - type: postgresql',
        '    port: 5432',
        '    user: myuser',
        '    password: mypass',
        '    database: app',
      ].join('\n');
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), configYaml);
      process.chdir(tempDir);

      await runShareExport({ output: 'dev-env.shared.yml' });

      const outPath = path.join(tempDir, 'dev-env.shared.yml');
      expect(await fs.pathExists(outPath)).toBe(true);
      const content = await fs.readFile(outPath, 'utf-8');
      expect(content).toContain('${DB_USER}');
      expect(content).toContain('${DB_PASSWORD}');
      expect(content).not.toContain('mypass');
      expect(content).not.toContain('myuser');
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('dev-env.shared.yml')
      );
    });
  });

  describe('runShareImport', () => {
    it('throws when import file does not exist', async () => {
      process.chdir(tempDir);
      await expect(
        runShareImport(path.join(tempDir, 'missing.yml'))
      ).rejects.toThrow(/File not found|missing\.yml/);
    });

    it('throws when YAML is invalid', async () => {
      const badPath = path.join(tempDir, 'bad.yml');
      await fs.writeFile(badPath, 'not: valid: yaml: [');
      process.chdir(tempDir);

      await expect(runShareImport(badPath)).rejects.toThrow(/Invalid YAML/);
    });

    it('throws when config schema is invalid', async () => {
      const badPath = path.join(tempDir, 'no-name.yml');
      await fs.writeFile(badPath, 'version: "1.0.0"\ndatabases: []');
      process.chdir(tempDir);

      await expect(runShareImport(badPath)).rejects.toThrow(/Invalid dev-env config|name/);
    });

    it('writes valid shared config to .dev-env.yml', async () => {
      const sharedPath = path.join(tempDir, 'shared.yml');
      await fs.writeFile(
        sharedPath,
        'name: imported\nversion: "1.0.0"\ndatabases:\n  - type: redis\n    port: 6379'
      );
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: original');
      process.chdir(tempDir);

      await runShareImport(sharedPath, { output: '.dev-env.yml' });

      const content = await fs.readFile(path.join(tempDir, '.dev-env.yml'), 'utf-8');
      expect(content).toMatch(/name:\s*imported/);
      expect(content).toMatch(/redis|6379/);
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('.dev-env.yml')
      );
    });
  });
});
