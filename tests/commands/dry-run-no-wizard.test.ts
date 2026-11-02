import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import prompts from 'prompts';
import * as init from '../../src/commands/init';
import { runSetup } from '../../src/commands/setup';
import { runGenerate } from '../../src/commands/generate';
import { logger } from '../../src/utils/logger';

describe('--dry-run never launches the init wizard (it must not write files)', () => {
  let root: string;
  const originalCwd = process.cwd();
  const originalTty = process.stdout.isTTY;
  let runInit: jest.SpyInstance;

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-dryrun-')));
    process.chdir(root);
    // Pretend to be a terminal: that is the only situation in which the wizard is offered.
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    runInit = jest.spyOn(init, 'runInit').mockImplementation(async () => undefined);
  });

  afterEach(async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalTty, configurable: true });
    process.chdir(originalCwd);
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('setup --dry-run fails with the init hint instead of prompting', async () => {
    await expect(runSetup({ dryRun: true })).rejects.toThrow(/envkit init/);
    expect(runInit).not.toHaveBeenCalled();
  });

  it('generate --dry-run fails with the init hint instead of prompting', async () => {
    await expect(runGenerate({ dryRun: true })).rejects.toThrow(/envkit init/);
    expect(runInit).not.toHaveBeenCalled();
  });

  it('without --dry-run the wizard is still offered (control)', async () => {
    prompts.inject(['y']);
    await expect(runSetup({})).rejects.toThrow(); // runInit is mocked, so there is still no config
    expect(runInit).toHaveBeenCalledTimes(1);
  });
});
