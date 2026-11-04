import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import prompts from 'prompts';
import { exitOnCancel, isInteractive, CANCEL_EXIT_CODE } from '../../src/utils/prompt';
import { runInit } from '../../src/commands/init';
import { logger } from '../../src/utils/logger';

describe('cancelling a prompt exits non-zero', () => {
  const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const original = { out: stdout.isTTY, in: stdin.isTTY };
  let exit: jest.SpyInstance;
  let tempDir: string;

  beforeEach(async () => {
    // process.exit must not really exit; throwing lets us stop the flow like exit would.
    exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-cancel-'));
  });

  afterEach(async () => {
    stdout.isTTY = original.out;
    stdin.isTTY = original.in;
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  it('exitOnCancel exits with 130, not 0', () => {
    expect(() => exitOnCancel()).toThrow(`exit:${CANCEL_EXIT_CODE}`);
    expect(CANCEL_EXIT_CODE).toBe(130);
    expect(exit).not.toHaveBeenCalledWith(0);
  });

  it('aborting the init wizard exits 130 and writes no config', async () => {
    stdout.isTTY = true;
    stdin.isTTY = true;
    prompts.inject([new Error('aborted')]); // an injected Error simulates Ctrl+C
    await expect(runInit(tempDir)).rejects.toThrow('exit:130');
    expect(await fs.pathExists(path.join(tempDir, '.dev-env.yml'))).toBe(false);
  });

  describe('isInteractive needs a terminal on both ends', () => {
    it.each([
      [true, true, true],
      [true, false, false],
      [false, true, false],
      [false, false, false],
    ])('stdout=%s stdin=%s -> %s', (out, inn, expected) => {
      stdout.isTTY = out;
      stdin.isTTY = inn;
      expect(isInteractive()).toBe(expected);
    });
  });
});
