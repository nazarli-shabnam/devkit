import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runSnapshotCreate, runSnapshotRestore } from '../../src/commands/snapshot';
import { listSnapshots, snapshotExists, uniqueSnapshotName, createSnapshot } from '../../src/core/snapshot/storage';
import { logger } from '../../src/utils/logger';

describe('snapshot create: no silent overwrite, no silent renames', () => {
  let root: string;
  const originalCwd = process.cwd();
  const writeConfig = (text: string): Promise<void> => fs.writeFile(path.join(root, '.dev-env.yml'), text);
  const saved = (name: string): Promise<string> =>
    fs.readFile(path.join(root, '.devkit', 'snapshots', name, 'dev-env.yml'), 'utf-8');

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    jest.spyOn(logger, 'step').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-snapcol-')));
    await writeConfig('name: v1\n');
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('refuses to replace an existing snapshot, keeping the original content', async () => {
    await runSnapshotCreate('rel');
    await writeConfig('name: v2\n');
    await expect(runSnapshotCreate('rel')).rejects.toThrow(/"rel" already exists.*--force/);
    expect(await saved('rel')).toContain('name: v1');
  });

  it('replaces it with --force', async () => {
    await runSnapshotCreate('rel');
    await writeConfig('name: v2\n');
    await runSnapshotCreate('rel', { force: true });
    expect(await saved('rel')).toContain('name: v2');
  });

  it('tells the user when the name was altered, and catches collisions between altered names', async () => {
    await runSnapshotCreate('rel.v1');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"rel.v1" is stored as "rel-v1"'));
    await expect(runSnapshotCreate('rel-v1')).rejects.toThrow(/"rel-v1" already exists/);
    expect(await listSnapshots(root)).toHaveLength(1);
  });

  it('rejects names with no letters or digits instead of collapsing them into "snapshot"', async () => {
    await expect(runSnapshotCreate('日本語')).rejects.toThrow(/at least one letter or digit/);
    await expect(runSnapshotCreate('***')).rejects.toThrow(/at least one letter or digit/);
    expect(await listSnapshots(root)).toHaveLength(0);
  });

  it('two unnamed snapshots in the same second both succeed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
    try {
      await runSnapshotCreate();
      await runSnapshotCreate();
    } finally {
      jest.useRealTimers();
    }
    expect((await listSnapshots(root)).map((s) => s.name).sort()).toEqual([
      'snapshot-2030-01-01T00-00-00',
      'snapshot-2030-01-01T00-00-00-2',
    ]);
  });

  it('still auto-names unnamed snapshots', async () => {
    await runSnapshotCreate();
    const [snapshot] = await listSnapshots(root);
    expect(snapshot.name).toMatch(/^snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('restore backups never overwrite each other', async () => {
    await runSnapshotCreate('target');
    await writeConfig('name: edited-a\n');
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
    try {
      await runSnapshotRestore('target', { yes: true });
      await writeConfig('name: edited-b\n');
      await runSnapshotRestore('target', { yes: true });
    } finally {
      jest.useRealTimers();
    }
    const backups = (await listSnapshots(root)).map((s) => s.name).filter((n) => n.startsWith('pre-restore-'));
    expect(backups.sort()).toEqual(['pre-restore-2030-01-01T00-00-00', 'pre-restore-2030-01-01T00-00-00-2']);
    expect(await saved('pre-restore-2030-01-01T00-00-00')).toContain('edited-a');
    expect(await saved('pre-restore-2030-01-01T00-00-00-2')).toContain('edited-b');
  });
});

describe('storage helpers', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-snapstore-')));
  });
  afterEach(async () => {
    await fs.remove(root).catch(() => {});
  });

  it('snapshotExists and uniqueSnapshotName', async () => {
    expect(await snapshotExists(root, 'a')).toBe(false);
    await createSnapshot(root, 'a', 'name: x');
    await createSnapshot(root, 'a-2', 'name: x');
    expect(await snapshotExists(root, 'a')).toBe(true);
    expect(await snapshotExists(root, 'a.')).toBe(true); // checks the stored (sanitized) name
    expect(await uniqueSnapshotName(root, 'a')).toBe('a-3');
    expect(await uniqueSnapshotName(root, 'fresh')).toBe('fresh');
  });
});
