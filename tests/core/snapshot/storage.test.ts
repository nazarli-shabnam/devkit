import * as path from 'path';
import * as fs from 'fs-extra';
import { getSnapshotDir, listSnapshots } from '../../../src/core/snapshot/storage';

describe('snapshot storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(require('os').tmpdir(), `devkit-snapshot-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
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
  });
});
