import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runGenerate } from '../../src/commands/generate';
import { runShareExport, runShareImport } from '../../src/commands/share';
import { resolveOutputPath, displayPath } from '../../src/utils/paths';
import { logger } from '../../src/utils/logger';

describe('default outputs go to the project root, explicit ones to the cwd', () => {
  let root: string;
  let sub: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-outroot-')));
    sub = path.join(root, 'sub', 'deep');
    await fs.ensureDir(sub);
    await fs.writeFile(path.join(root, '.dev-env.yml'), 'name: t\ndatabases:\n  - type: redis\n');
    process.chdir(sub);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('generate writes docker-compose.yml to the project root by default', async () => {
    await runGenerate({});
    expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(sub, 'docker-compose.yml'))).toBe(false);
  });

  it('generate -o with a relative path is relative to the current directory', async () => {
    await runGenerate({ output: 'custom.yml' });
    expect(await fs.pathExists(path.join(sub, 'custom.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'custom.yml'))).toBe(false);
  });

  it('share export defaults to the project root; import defaults to the root config', async () => {
    await runShareExport({});
    expect(await fs.pathExists(path.join(root, 'dev-env.shared.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(sub, 'dev-env.shared.yml'))).toBe(false);

    await fs.writeFile(path.join(sub, 'incoming.yml'), 'name: imported\n');
    await runShareImport('incoming.yml', {});
    expect(await fs.readFile(path.join(root, '.dev-env.yml'), 'utf-8')).toContain('name: imported');
    expect(await fs.pathExists(path.join(sub, '.dev-env.yml'))).toBe(false);
  });

  it('share import -o inside the current directory still works and is not the project root', async () => {
    await fs.writeFile(path.join(sub, 'incoming.yml'), 'name: imported\n');
    await runShareImport('incoming.yml', { output: 'local.yml' });
    expect(await fs.pathExists(path.join(sub, 'local.yml'))).toBe(true);
  });
});

describe('resolveOutputPath / displayPath', () => {
  const root = path.resolve('/work/proj');
  const cwd = path.join(root, 'sub');

  it('uses the project root for the default (also for an empty or blank --output)', () => {
    expect(resolveOutputPath(undefined, 'a.yml', root, cwd)).toBe(path.join(root, 'a.yml'));
    expect(resolveOutputPath('  ', 'a.yml', root, cwd)).toBe(path.join(root, 'a.yml'));
  });

  it('resolves explicit relative paths against cwd, keeps absolute ones, and still guards escapes', () => {
    expect(resolveOutputPath('x/b.yml', 'a.yml', root, cwd)).toBe(path.join(cwd, 'x', 'b.yml'));
    const abs = path.resolve('/elsewhere/c.yml');
    expect(resolveOutputPath(abs, 'a.yml', root, cwd)).toBe(abs);
    expect(() => resolveOutputPath('../b.yml', 'a.yml', root, cwd)).toThrow(/outside the working directory/);
  });

  it('displays paths relative to cwd when inside it, absolute otherwise', () => {
    expect(displayPath(path.join(cwd, 'x', 'b.yml'), cwd)).toBe(path.join('x', 'b.yml'));
    expect(displayPath(path.join(root, 'a.yml'), cwd)).toBe(path.join(root, 'a.yml'));
  });
});
