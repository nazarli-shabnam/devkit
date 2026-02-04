import * as path from 'path';
import * as fs from 'fs-extra';
import {
  getSnapshotDir,
  listSnapshots,
  createSnapshot,
  sanitizeSnapshotName,
  SNAPSHOT_CONFIG_FILENAME,
} from '../../../src/core/snapshot/storage';
import { logger } from '../../../src/utils/logger';

describe('snapshot storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(require('os').tmpdir(), `devkit-snapshot-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('sanitizeSnapshotName', () => {
    it('keeps alphanumeric, dash, underscore', () => {
      expect(sanitizeSnapshotName('my-snapshot')).toBe('my-snapshot');
      expect(sanitizeSnapshotName('snap_1')).toBe('snap_1');
    });

    it('replaces invalid chars with dash and collapses', () => {
      expect(sanitizeSnapshotName('my snapshot')).toBe('my-snapshot');
      expect(sanitizeSnapshotName('a/b\\c')).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it('returns snapshot when empty after sanitize', () => {
      expect(sanitizeSnapshotName('...')).toBe('snapshot');
    });

    it('strips leading and trailing dashes', () => {
      expect(sanitizeSnapshotName('--my-snap--')).toBe('my-snap');
      expect(sanitizeSnapshotName('-a-')).toBe('a');
    });
  });

  describe('createSnapshot', () => {
    it('writes metadata.json and dev-env.yml under .devkit/snapshots/<name>', async () => {
      const configYaml = 'name: test\nversion: "1.0.0"';
      const meta = await createSnapshot(tempDir, 'before-upgrade', configYaml);

      expect(meta.name).toBe('before-upgrade');
      expect(meta.createdAt).toBeDefined();
      expect(new Date(meta.createdAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

      const snapshotPath = path.join(tempDir, '.devkit', 'snapshots', 'before-upgrade');
      const metaPath = path.join(snapshotPath, 'metadata.json');
      const configPath = path.join(snapshotPath, SNAPSHOT_CONFIG_FILENAME);

      expect(await fs.pathExists(metaPath)).toBe(true);
      expect(await fs.pathExists(configPath)).toBe(true);

      const savedMeta = await fs.readJson(metaPath);
      expect(savedMeta.name).toBe('before-upgrade');
      expect(savedMeta.createdAt).toBe(meta.createdAt);

      const savedConfig = await fs.readFile(configPath, 'utf-8');
      expect(savedConfig).toBe(configYaml);
    });

    it('sanitizes name when creating directory', async () => {
      await createSnapshot(tempDir, 'my snapshot', 'name: x');
      const snapshotPath = path.join(tempDir, '.devkit', 'snapshots', 'my-snapshot');
      expect(await fs.pathExists(snapshotPath)).toBe(true);
    });

    it('created snapshot appears in listSnapshots', async () => {
      await createSnapshot(tempDir, 'listed', 'name: app');
      const list = await listSnapshots(tempDir);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('listed');
    });

    it('overwrites existing snapshot with same name', async () => {
      await createSnapshot(tempDir, 'overwrite', 'name: v1');
      const meta2 = await createSnapshot(tempDir, 'overwrite', 'name: v2\nversion: "2.0"');

      const list = await listSnapshots(tempDir);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('overwrite');
      const configPath = path.join(tempDir, '.devkit', 'snapshots', 'overwrite', SNAPSHOT_CONFIG_FILENAME);
      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('v2');
      expect(content).not.toContain('v1');
      expect(meta2.createdAt).toBeDefined();
    });
  });

  describe('getSnapshotDir', () => {
    it('returns .devkit/snapshots under project root', () => {
      const dir = getSnapshotDir(tempDir);
      expect(dir).toBe(path.join(tempDir, '.devkit', 'snapshots'));
    });
  });

  describe('listSnapshots', () => {
    it('returns empty array when snapshot dir does not exist', async () => {
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
    });

    it('returns empty array when snapshot dir is empty', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(snapshotDir);
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
    });

    it('ignores files in snapshot dir (only directories are snapshots)', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(snapshotDir);
      await fs.writeFile(path.join(snapshotDir, 'not-a-dir.txt'), '');
      await fs.writeJson(path.join(snapshotDir, 'metadata.json'), { name: 'file', createdAt: new Date().toISOString() });
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
    });

    it('returns snapshot metadata when valid metadata.json exists', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(path.join(snapshotDir, 'my-snapshot'));
      await fs.writeJson(path.join(snapshotDir, 'my-snapshot', 'metadata.json'), {
        name: 'my-snapshot',
        createdAt: '2025-01-01T12:00:00.000Z',
      });
      const list = await listSnapshots(tempDir);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('my-snapshot');
      expect(list[0].createdAt).toBe('2025-01-01T12:00:00.000Z');
    });

    it('skips directories without metadata.json', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(path.join(snapshotDir, 'no-meta'));
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
    });

    it('skips directories with invalid JSON in metadata.json', async () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(path.join(snapshotDir, 'bad-json'));
      await fs.writeFile(path.join(snapshotDir, 'bad-json', 'metadata.json'), 'not json {');
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
      errorSpy.mockRestore();
    });

    it('skips metadata missing name or createdAt', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(path.join(snapshotDir, 'incomplete'));
      await fs.writeJson(path.join(snapshotDir, 'incomplete', 'metadata.json'), { name: 'only-name' });
      const list = await listSnapshots(tempDir);
      expect(list).toEqual([]);
    });

    it('sorts snapshots by createdAt descending', async () => {
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots');
      await fs.ensureDir(path.join(snapshotDir, 'old'));
      await fs.ensureDir(path.join(snapshotDir, 'new'));
      await fs.writeJson(path.join(snapshotDir, 'old', 'metadata.json'), {
        name: 'old',
        createdAt: '2025-01-01T10:00:00.000Z',
      });
      await fs.writeJson(path.join(snapshotDir, 'new', 'metadata.json'), {
        name: 'new',
        createdAt: '2025-01-02T12:00:00.000Z',
      });
      const list = await listSnapshots(tempDir);
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('new');
      expect(list[1].name).toBe('old');
    });
  });
});
