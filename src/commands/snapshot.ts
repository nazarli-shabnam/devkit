import * as path from 'path';
import { findProjectRoot, loadConfig } from '../core/config/loader';
import { createSnapshot, listSnapshots } from '../core/snapshot/storage';
import { readFile } from '../utils/file-ops';
import { logger } from '../utils/logger';

export async function runSnapshotCreate(name?: string): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  await loadConfig(projectRoot);

  const configPath = path.join(projectRoot, '.dev-env.yml');
  const configYaml = await readFile(configPath);

  const snapshotName =
    name && name.trim() ? name.trim() : `snapshot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const meta = await createSnapshot(projectRoot, snapshotName, configYaml);

  logger.success(`Snapshot "${meta.name}" created at ${meta.createdAt}`);
}

export async function runSnapshotList(): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const snapshots = await listSnapshots(projectRoot);

  if (snapshots.length === 0) {
    logger.info('No snapshots found. Create one with: devkit snapshot create [name]');
    return;
  }

  logger.step(`Found ${snapshots.length} snapshot(s):`);
  for (const s of snapshots) {
    logger.info(`  ${s.name}  (${s.createdAt})`);
  }
}
