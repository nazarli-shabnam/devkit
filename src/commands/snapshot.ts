import { findProjectRoot } from '../core/config/loader';
import { listSnapshots } from '../core/snapshot/storage';
import { logger } from '../utils/logger';

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
