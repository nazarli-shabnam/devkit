import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runGenerate } from '../../src/commands/generate';
import { logger } from '../../src/utils/logger';

describe('generate honours docker.output_file', () => {
  let root: string;
  let sub: string;
  const originalCwd = process.cwd();
  const writeConfig = (docker: string): Promise<void> =>
    fs.writeFile(path.join(root, '.dev-env.yml'), ['name: t', 'databases:', '  - type: redis', docker, ''].join('\n'));

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-outfile-')));
    sub = path.join(root, 'sub');
    await fs.ensureDir(sub);
    process.chdir(sub);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('writes to the configured path, relative to the project root', async () => {
    await writeConfig('docker:\n  output_file: deploy/compose.yml');
    await runGenerate({});
    expect(await fs.pathExists(path.join(root, 'deploy', 'compose.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(false);
  });

  it('--output wins over the config (and is relative to the current directory)', async () => {
    await writeConfig('docker:\n  output_file: deploy/compose.yml');
    await runGenerate({ output: 'explicit.yml' });
    expect(await fs.pathExists(path.join(sub, 'explicit.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'deploy', 'compose.yml'))).toBe(false);
  });

  it('keeps docker-compose.yml when nothing is configured', async () => {
    await writeConfig('docker:\n  enabled: true');
    await runGenerate({});
    expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(true);
  });

  it.each(['../outside.yml', '/etc/envkit-test.yml', 'C:/Windows/envkit-test.yml'])(
    'rejects a configured path that leaves the project (%s)',
    async (target) => {
      await writeConfig(`docker:\n  output_file: ${target}`);
      await expect(runGenerate({})).rejects.toThrow(/docker\.output_file .* must be a path inside the project/);
    }
  );

  it('does not apply the project-only rule to an explicit --output', async () => {
    await writeConfig('docker:\n  output_file: ../outside.yml');
    await runGenerate({ output: 'fine.yml' });
    expect(await fs.pathExists(path.join(sub, 'fine.yml'))).toBe(true);
  });
});
