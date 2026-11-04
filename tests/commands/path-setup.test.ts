import * as path from 'path';
import { logger } from '../../src/utils/logger';

// We need to test the internal functions, so we import the module and
// re-export internals via a test helper approach.
// Since the functions are not exported, we test runPathSetup behavior
// and also test isInPath-like logic indirectly.

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('prompts', () => jest.fn());

import { execSync } from 'child_process';
import prompts from 'prompts';
import { runPathSetup } from '../../src/commands/path-setup';

describe('path-setup command', () => {
  const originalPath = process.env.PATH;

  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    jest.restoreAllMocks();
    jest.mocked(execSync).mockReset();
    jest.mocked(prompts as any).mockReset();
  });

  // npm prefix -g prints the prefix; the bin dir is <prefix>/bin (POSIX) or the prefix itself (Windows).
  const binFor = (prefix: string): string => (process.platform === 'win32' ? prefix : path.join(prefix, 'bin'));

  it('asks npm for its prefix (npm bin -g no longer exists) and derives the bin dir', async () => {
    const prefix = path.resolve('/usr/local');
    jest.mocked(execSync).mockReturnValue(prefix + '\n');
    process.env.PATH = binFor(prefix) + path.delimiter + '/usr/bin';

    await runPathSetup();
    expect(execSync).toHaveBeenCalledWith('npm prefix -g', expect.any(Object));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('already on your PATH'));
  });

  it('tells the user when the global location cannot be determined (explicit run)', async () => {
    jest.mocked(execSync).mockImplementation(() => {
      throw new Error('npm not found');
    });

    await expect(runPathSetup()).rejects.toThrow(/Could not find npm's global install location/);
  });

  it('rejects an empty prefix', async () => {
    jest.mocked(execSync).mockReturnValue('  \n');
    await expect(runPathSetup()).rejects.toThrow(/printed nothing/);
  });

  it('stays silent when npm cannot be queried during postinstall', async () => {
    const previous = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = 'postinstall';
    jest.mocked(execSync).mockImplementation(() => {
      throw new Error('npm not found');
    });
    try {
      await expect(runPathSetup()).resolves.toBeUndefined();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = previous;
    }
  });

  it('logs "already on PATH" when bin path is in PATH', async () => {
    const prefix = path.resolve('/usr/local/lib/node');
    jest.mocked(execSync).mockReturnValue(prefix + '\n');
    process.env.PATH = binFor(prefix) + path.delimiter + '/usr/bin';

    await runPathSetup();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('already on your PATH'));
  });

  it('shows manual instructions when not interactive (no TTY)', async () => {
    const fakeBin = '/some/unique/path/bin';
    jest.mocked(execSync).mockReturnValue(fakeBin + '\n');
    process.env.PATH = '/usr/bin';

    const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
    const origTTY = stdout.isTTY;
    stdout.isTTY = false;

    try {
      await runPathSetup();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(fakeBin));
    } finally {
      stdout.isTTY = origTTY;
    }
  });

  it('does nothing when user declines the prompt', async () => {
    const fakeBin = '/some/nonexistent/path/bin';
    jest.mocked(execSync).mockReturnValue(fakeBin + '\n');
    process.env.PATH = '/usr/bin';

    const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
    const origTTY = stdout.isTTY;
    stdout.isTTY = true;

    jest.mocked(prompts as any).mockResolvedValueOnce({ value: false });

    try {
      await runPathSetup();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
    } finally {
      stdout.isTTY = origTTY;
    }
  });
});

describe('path-setup Windows case-insensitive comparison', () => {
  it('detects path regardless of case on win32', async () => {
    // Test the logic by checking that a path differing only in case is detected
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const fakeBin = 'C:\\Users\\Test\\AppData\\npm';
    jest.mocked(execSync).mockReturnValue(fakeBin + '\n');
    process.env.PATH = 'c:\\users\\test\\appdata\\npm;C:\\Windows\\System32';

    jest.spyOn(logger, 'info').mockImplementation();

    try {
      await runPathSetup();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('already on your PATH'));
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });
});
