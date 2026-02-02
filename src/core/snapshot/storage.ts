import * as path from 'path';
import * as fs from 'fs-extra';
import { fileExists } from '../../utils/file-ops';
import { readJson } from '../../utils/file-ops';

export const SNAPSHOT_DIR_NAME = '.devkit';
export const SNAPSHOTS_SUBDIR = 'snapshots';

export interface SnapshotMeta {
  name: string;
  createdAt: string;
}

export function getSnapshotDir(projectRoot: string): string {
  return path.join(projectRoot, SNAPSHOT_DIR_NAME, SNAPSHOTS_SUBDIR);
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
