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

    it('calls logger.success with snapshot name and createdAt', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x');
      process.chdir(tempDir);

      await runSnapshotCreate('my-snap');

      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('my-snap')
      );
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      );
    });

    it('creates snapshot with sanitized name when name has invalid chars', async () => {
      const configYaml = 'name: test\nversion: "1.0.0"';
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), configYaml);
      process.chdir(tempDir);

      await runSnapshotCreate('pre migration v1');

      const snapshots = await listSnapshots(tempDir);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].name).toBe('pre-migration-v1');
      const configPath = path.join(tempDir, '.devkit', 'snapshots', 'pre-migration-v1', 'dev-env.yml');
      expect(await fs.pathExists(configPath)).toBe(true);
    });
  });

  describe('runSnapshotList', () => {
    it('runs without error when no snapshots', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: list-test');
      process.chdir(tempDir);
      await expect(runSnapshotList()).resolves.toBeUndefined();
    });

    it('logs "No snapshots found" when no snapshots', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: list-test');
      process.chdir(tempDir);

      await runSnapshotList();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No snapshots found')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('devkit snapshot create')
      );
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

    it('lists snapshots in createdAt descending order', async () => {
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x');
      process.chdir(tempDir);
      await runSnapshotCreate('old');
      await new Promise((r) => setTimeout(r, 10));
      await runSnapshotCreate('new');

      await runSnapshotList();

      const stepCall = (logger.step as jest.Mock).mock.calls[0][0];
      expect(stepCall).toContain('2 snapshot');
      const infoCalls = (logger.info as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
      const newIdx = infoCalls.findIndex((s) => s.includes('new'));
      const oldIdx = infoCalls.findIndex((s) => s.includes('old'));
      expect(newIdx).toBeLessThan(oldIdx);
    });
  });
});
