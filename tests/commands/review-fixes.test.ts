import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import prompts from 'prompts';
import * as init from '../../src/commands/init';
import * as fileOps from '../../src/utils/file-ops';
import { runInit } from '../../src/commands/init';
import { runGenerate } from '../../src/commands/generate';
import { runShareImport } from '../../src/commands/share';
import { confirmOverwrite, GENERATED_MARKER } from '../../src/utils/overwrite';
import { reserveSnapshotName, listSnapshots } from '../../src/core/snapshot/storage';
import { ServiceSchema } from '../../src/types/config';
import { logger } from '../../src/utils/logger';

/** Create a directory symlink (a junction on Windows, which needs no privileges); false if not possible. */
async function trySymlinkDir(target: string, link: string): Promise<boolean> {
  try {
    await fs.symlink(target, link, 'junction');
    return true;
  } catch {
    return false;
  }
}

describe('review fixes', () => {
  let root: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-review-')));
    process.chdir(root);
    jest.spyOn(init, 'isInteractive').mockReturnValue(false);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  describe('docker.output_file', () => {
    const writeConfig = (docker: string): Promise<void> =>
      fs.writeFile(path.join(root, '.dev-env.yml'), ['name: t', 'databases:', '  - type: redis', docker, ''].join('\n'));

    it('an empty value falls back to docker-compose.yml instead of naming the project root', async () => {
      await writeConfig('docker:\n  output_file: ""');
      await runGenerate({});
      expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(true);
    });

    it('a symlinked directory cannot redirect the configured output outside the project', async () => {
      const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-outside-')));
      try {
        if (!(await trySymlinkDir(outside, path.join(root, 'linked')))) return; // cannot create links here
        await writeConfig('docker:\n  output_file: linked/compose.yml');
        await expect(runGenerate({})).rejects.toThrow(/resolves outside .* symbolic link/);
        expect(await fs.pathExists(path.join(outside, 'compose.yml'))).toBe(false);
      } finally {
        await fs.remove(outside).catch(() => {});
      }
    });

    it('the same holds for an explicit relative --output', async () => {
      const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-outside-')));
      try {
        if (!(await trySymlinkDir(outside, path.join(root, 'linked')))) return;
        await writeConfig('docker:\n  enabled: true');
        await expect(runGenerate({ output: 'linked/x.yml' })).rejects.toThrow(/symbolic link/);
        expect(await fs.pathExists(path.join(outside, 'x.yml'))).toBe(false);
      } finally {
        await fs.remove(outside).catch(() => {});
      }
    });

    it('an ordinary nested directory that does not exist yet is still fine', async () => {
      await writeConfig('docker:\n  output_file: deploy/compose.yml');
      await runGenerate({});
      expect(await fs.pathExists(path.join(root, 'deploy', 'compose.yml'))).toBe(true);
    });
  });

  describe('envkit header detection', () => {
    const target = (): string => path.join(root, 'out.yml');

    it('a file that only quotes the marker further down is not treated as generated', async () => {
      await fs.writeFile(target(), `services: {}\n# note: ${GENERATED_MARKER} is how ours start\n`);
      await expect(confirmOverwrite(target(), { displayName: 'out.yml', regenerable: true })).rejects.toThrow(/--force/);
    });

    it('a file that starts with the header (even after a BOM) is regenerable', async () => {
      await fs.writeFile(target(), `﻿# ${GENERATED_MARKER} (docker compose). Re-run.\nservices: {}\n`);
      await expect(confirmOverwrite(target(), { displayName: 'out.yml', regenerable: true })).resolves.toBe(true);
    });

    it('only the beginning of a very large file is read', async () => {
      const big = `# ${GENERATED_MARKER} (x)\n` + 'a: 1\n'.repeat(2_000_000); // ~10 MB
      await fs.writeFile(target(), big);
      await expect(confirmOverwrite(target(), { displayName: 'out.yml', regenerable: true })).resolves.toBe(true);
    });
  });

  describe('atomic snapshot names', () => {
    it('concurrent reservations never share a name', async () => {
      const names = await Promise.all(Array.from({ length: 8 }, () => reserveSnapshotName(root, 'pre-import-x')));
      expect(new Set(names).size).toBe(8);
      for (const name of names) {
        expect(await fs.pathExists(path.join(root, '.devkit', 'snapshots', name))).toBe(true);
      }
    });

    it('two overlapping forced imports each keep their own backup', async () => {
      await fs.writeFile(path.join(root, '.dev-env.yml'), 'name: original\n');
      await fs.writeFile(path.join(root, 'a.yml'), 'name: a\n');
      await fs.writeFile(path.join(root, 'b.yml'), 'name: b\n');
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'queueMicrotask'] }).setSystemTime(
        new Date('2030-01-01T00:00:00Z')
      );
      try {
        await Promise.all([runShareImport('a.yml', { force: true }), runShareImport('b.yml', { force: true })]);
      } finally {
        jest.useRealTimers();
      }
      const names = (await listSnapshots(root)).map((s) => s.name).sort();
      expect(names).toEqual(['pre-import-2030-01-01T00-00-00', 'pre-import-2030-01-01T00-00-00-2']);
    });

    it('an alias (symlink) of .dev-env.yml is backed up before being replaced', async () => {
      await fs.writeFile(path.join(root, '.dev-env.yml'), 'name: original\n');
      await fs.writeFile(path.join(root, 'incoming.yml'), 'name: imported\n');
      try {
        await fs.symlink(path.join(root, '.dev-env.yml'), path.join(root, 'alias.yml'), 'file');
      } catch {
        return; // symlinks need privileges on some systems
      }
      await runShareImport('incoming.yml', { force: true, output: 'alias.yml' });
      expect(await listSnapshots(root)).toHaveLength(1);
    });
  });

  describe('wizard', () => {
    const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
    const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
    const tty = { out: stdout.isTTY, in: stdin.isTTY };
    beforeEach(() => {
      stdout.isTTY = true;
      stdin.isTTY = true;
      (init.isInteractive as unknown as jest.Mock).mockReturnValue(true);
    });
    afterEach(() => {
      stdout.isTTY = tty.out;
      stdin.isTTY = tty.in;
    });

    it('stores the service type in lowercase (Docker image names must be lowercase)', async () => {
      prompts.inject(['svc', '1.0.0', false, false, true, 'RabbitMQ', '3.12', 5672, 15672, false, false, false]);
      await runInit(root);
      const text = await fs.readFile(path.join(root, '.dev-env.yml'), 'utf-8');
      expect(text).toContain('type: rabbitmq');
      expect(text).not.toContain('RabbitMQ');
    });

    it('never replaces a .env.example that appears while the prompt is open', async () => {
      // Simulate the race: the existence check (before the prompt) says "absent", the file exists by write time.
      await fs.writeFile(path.join(root, '.env.example'), 'KEEP=me\n');
      const realExists = fileOps.fileExists;
      jest.spyOn(fileOps, 'fileExists').mockImplementation(async (p: string) =>
        p.endsWith('.env.example') ? false : realExists(p)
      );
      prompts.inject([
        'app', '1.0.0', false,
        true, 'postgresql', 'main', '16', 5432, '${DB_USER}', '${DB_PASSWORD}', 'myapp',
        false, false, false, false, false, false,
        true,
      ]);
      await runInit(root);
      expect(await fs.readFile(path.join(root, '.env.example'), 'utf-8')).toBe('KEEP=me\n');
    });
  });

  it('ServiceSchema leaves host undefined when omitted', () => {
    expect(ServiceSchema.parse({ type: 'rabbitmq', port: 5672 }).host).toBeUndefined();
  });
});
