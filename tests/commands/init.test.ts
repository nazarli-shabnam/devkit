import * as path from 'path';
import * as fs from 'fs-extra';
import {
  getDefaultProjectName,
  isInteractive,
  runInit,
} from '../../src/commands/init';
import { logger } from '../../src/utils/logger';

describe('init command', () => {
  let tempDir: string;

  beforeEach(async () => {
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    tempDir = path.join(require('os').tmpdir(), `envkit-init-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  describe('getDefaultProjectName', () => {
    it('returns package.json name when present', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe('my-app');
    });

    it('returns directory basename when no package.json', async () => {
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe(path.basename(tempDir));
    });

    it('returns directory basename when package.json has no name', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ version: '1.0.0' })
      );
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe(path.basename(tempDir));
    });

    it('returns directory basename when package.json is invalid JSON', async () => {
      await fs.writeFile(path.join(tempDir, 'package.json'), 'not valid json {');
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe(path.basename(tempDir));
    });

    it('returns directory basename when package.json name is empty string', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: '' })
      );
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe(path.basename(tempDir));
    });

    it('trims whitespace from package.json name', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: '  my-app  ' })
      );
      const name = await getDefaultProjectName(tempDir);
      expect(name).toBe('my-app');
    });
  });

  describe('isInteractive', () => {
    it('returns a boolean', () => {
      expect(typeof isInteractive()).toBe('boolean');
    });
  });

  describe('runInit', () => {
    it('throws when not in a TTY (non-interactive)', async () => {
      const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
      const original = stdout.isTTY;
      stdout.isTTY = false;
      try {
        await expect(runInit(tempDir)).rejects.toThrow(
          /Not in an interactive terminal|Run `envkit init`/
        );
      } finally {
        stdout.isTTY = original;
      }
    });
  });
});
