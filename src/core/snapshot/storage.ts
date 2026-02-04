import * as path from 'path';
import * as fs from 'fs-extra';
import { fileExists, readFile, readJson, writeFile, writeJson, ensureDir } from '../../utils/file-ops';

export const SNAPSHOT_DIR_NAME = '.devkit';
export const SNAPSHOTS_SUBDIR = 'snapshots';
export const SNAPSHOT_CONFIG_FILENAME = 'dev-env.yml';

export interface SnapshotMeta {
  name: string;
  createdAt: string;
}

export function sanitizeSnapshotName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snapshot';
}

export function getSnapshotDir(projectRoot: string): string {
  return path.join(projectRoot, SNAPSHOT_DIR_NAME, SNAPSHOTS_SUBDIR);
}

export async function createSnapshot(
  projectRoot: string,
  name: string,
  configYaml: string
): Promise<SnapshotMeta> {
  const safeName = sanitizeSnapshotName(name) || 'snapshot';
  const snapshotDir = getSnapshotDir(projectRoot);
  const snapshotPath = path.join(snapshotDir, safeName);
  await ensureDir(snapshotPath);

  const createdAt = new Date().toISOString();
  const meta: SnapshotMeta = { name: safeName, createdAt };

  await writeJson(path.join(snapshotPath, 'metadata.json'), meta, 2);
  await writeFile(path.join(snapshotPath, SNAPSHOT_CONFIG_FILENAME), configYaml);

  return meta;
}

export async function listSnapshots(projectRoot: string): Promise<SnapshotMeta[]> {
  const snapshotDir = getSnapshotDir(projectRoot);
  if (!(await fileExists(snapshotDir))) {
    return [];
  }

  const entries = await fs.readdir(snapshotDir, { withFileTypes: true });
  const results: SnapshotMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(snapshotDir, entry.name, 'metadata.json');
    if (!(await fileExists(metaPath))) continue;
    try {
      const meta = await readJson<SnapshotMeta>(metaPath);
      if (meta?.name && meta?.createdAt) {
        results.push({ name: meta.name, createdAt: meta.createdAt });
      }
    } catch {
      //skip invalid metadata
    }
  }

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}


export async function getSnapshotConfig(projectRoot: string, name: string): Promise<string> {
  const safeName = sanitizeSnapshotName(name) || 'snapshot';
  const snapshotDir = getSnapshotDir(projectRoot);
  const configPath = path.join(snapshotDir, safeName, SNAPSHOT_CONFIG_FILENAME);

  if (!(await fileExists(configPath))) {
    throw new Error(
      `Snapshot "${safeName}" not found. List snapshots with: envkit snapshot list`
    );
  }

  return readFile(configPath);
}
