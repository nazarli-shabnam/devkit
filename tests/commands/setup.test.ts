import * as path from 'path';
import * as fs from 'fs-extra';
import { runSetup } from '../../src/commands/setup';
import { exec as execFn } from '../../src/utils/exec';

jest.mock('../../src/utils/exec', () => ({
  exec: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

describe('setup command', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = path.join(require('os').tmpdir(), `devkit-setup-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.mocked(execFn).mockClear();
  });

  it('throws when .dev-env.yml is not found', async () => {
    process.chdir(tempDir);
    await expect(runSetup({ dryRun: true })).rejects.toThrow(/Configuration file not found|\.dev-env\.yml/);
  });

  it('runs dry-run without executing commands when config is valid', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: setup-test\nversion: "1.0.0"\ndependencies: []\ndatabases: []'
    );
    process.chdir(tempDir);

    await runSetup({ dryRun: true });
    expect(execFn).not.toHaveBeenCalled();
  });
});
