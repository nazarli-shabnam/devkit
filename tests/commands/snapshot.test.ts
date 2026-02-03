import * as path from 'path';
import * as fs from 'fs-extra';
import { runSnapshotCreate, runSnapshotList } from '../../src/commands/snapshot';
import { listSnapshots } from '../../src/core/snapshot/storage';
import { logger } from '../../src/utils/logger';

describe('snapshot commands', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'step').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(require('os').tmpdir(), `devkit-snapshot-cmd-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  describe('runSnapshotCreate', () => {
    it('throws when .dev-env.yml is not found', async () => {
      process.chdir(tempDir);
      await expect(runSnapshotCreate('my-snap')).rejects.toThrow(
        /Configuration file not found|\.dev-env\.yml/
      );
    });

    it('creates snapshot with given name and config', async () => {
      const configYaml = 'name: create-test\nversion: "1.0.0"\ndatabases: []';
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), configYaml);
      process.chdir(tempDir);

      await runSnapshotCreate('pre-migration');

      const snapshots = await listSnapshots(tempDir);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].name).toBe('pre-migration');
      const configPath = path.join(tempDir, '.devkit', 'snapshots', 'pre-migration', 'dev-env.yml');
      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toBe(configYaml);
    });

    it('uses default name when name is empty string', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x');
      process.chdir(tempDir);

      await runSnapshotCreate('  ');

      const snapshots = await listSnapshots(tempDir);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].name).toMatch(/^snapshot-\d{4}-\d{2}-\d{2}T/);
    });

    it('uses default name when name is undefined', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x');
      process.chdir(tempDir);

      await runSnapshotCreate(undefined);

      const snapshots = await listSnapshots(tempDir);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].name).toMatch(/^snapshot-/);
    });
  });

  describe('runSnapshotList', () => {
    it('runs without error when no snapshots', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: list-test');
      process.chdir(tempDir);
      await expect(runSnapshotList()).resolves.toBeUndefined();
    });

    it('lists created snapshots', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x');
      process.chdir(tempDir);
      await runSnapshotCreate('first');
      await runSnapshotCreate('second');

      await runSnapshotList();

      expect(logger.step).toHaveBeenCalledWith(expect.stringContaining('2 snapshot'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('first'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('second'));
    });
  });
});
