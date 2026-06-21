import * as path from 'path';
import prompts from 'prompts';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
import { createSnapshot, listSnapshots, getSnapshotConfig, deleteSnapshot } from '../core/snapshot/storage';
import { isInteractive } from './init';
import { fileExists, readFile, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function runSnapshotCreate(name?: string): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  await loadConfigOrPromptInit(projectRoot);

  const configPath = path.join(projectRoot, '.dev-env.yml');
  const configYaml = await readFile(configPath);

  const snapshotName =
    name && name.trim() ? name.trim() : `snapshot-${timestamp()}`;
  const meta = await createSnapshot(projectRoot, snapshotName, configYaml);

  logger.success(`Snapshot "${meta.name}" created at ${meta.createdAt}`);
}

export async function runSnapshotList(): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const snapshots = await listSnapshots(projectRoot);

  if (snapshots.length === 0) {
    logger.info('No snapshots found. Create one with: envkit snapshot create [name]');
    return;
  }

  logger.step(`Found ${snapshots.length} snapshot(s):`);
  for (const s of snapshots) {
    logger.info(`  ${s.name}  (${s.createdAt})`);
  }
}

export interface SnapshotRestoreOptions {
  yes?: boolean;
}

export async function runSnapshotRestore(name: string, options: SnapshotRestoreOptions = {}): Promise<void> {
  if (!name || !name.trim()) {
    throw new Error('Snapshot name is required. List snapshots with: envkit snapshot list');
  }

  const projectRoot = await findProjectRoot(process.cwd());
  // Resolve the snapshot first so we fail before touching the current config.
  const configYaml = await getSnapshotConfig(projectRoot, name.trim());

  const configPath = path.join(projectRoot, '.dev-env.yml');
  const currentExists = await fileExists(configPath);

  if (currentExists && !options.yes && isInteractive()) {
    const answer = await prompts(
      {
        type: 'confirm',
        name: 'value',
        message: `This overwrites your current .dev-env.yml (a backup snapshot will be saved). Continue?`,
        initial: true,
      },
      { onCancel: () => process.exit(0) }
    );
    if (!answer.value) {
      logger.info('Restore cancelled.');
      return;
    }
  }

  // Auto-backup the current config so a restore is never destructive.
  if (currentExists) {
    const currentYaml = await readFile(configPath);
    const backup = await createSnapshot(projectRoot, `pre-restore-${timestamp()}`, currentYaml);
    logger.info(`Backed up current config to snapshot "${backup.name}".`);
  }

  await writeFile(configPath, configYaml);

  logger.success(`Restored snapshot "${name.trim()}" to .dev-env.yml`);
}

export async function runSnapshotDelete(name: string): Promise<void> {
  if (!name || !name.trim()) {
    throw new Error('Snapshot name is required. List snapshots with: envkit snapshot list');
  }

  const projectRoot = await findProjectRoot(process.cwd());
  await deleteSnapshot(projectRoot, name.trim());

  logger.success(`Deleted snapshot "${name.trim()}".`);
}
