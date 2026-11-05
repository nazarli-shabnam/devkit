import * as fs from 'fs';
import * as os from 'os';
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

jest.mock('../../src/utils/platform', () => ({
  ...jest.requireActual('../../src/utils/platform'),
  getHomeDirectory: jest.fn(),
}));

import { execSync } from 'child_process';
import prompts from 'prompts';
import { getHomeDirectory } from '../../src/utils/platform';
import { addToPathUnix, runPathSetup } from '../../src/commands/path-setup';

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
    const origStdinTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;

    jest.mocked(prompts as any).mockResolvedValueOnce({ value: false });

    try {
      await runPathSetup();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
    } finally {
      stdout.isTTY = origTTY;
      process.stdin.isTTY = origStdinTTY;
    }
  });
});

describe('addToPathUnix rc file selection', () => {
  const originalShell = process.env.SHELL;
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'envkit-home-'));
    jest.mocked(getHomeDirectory).mockReturnValue(home);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const read = (f: string): string => (fs.existsSync(path.join(home, f)) ? fs.readFileSync(path.join(home, f), 'utf-8') : '');

  it('updates .bashrc, not .zshrc, for a Bash user who has both', () => {
    process.env.SHELL = '/bin/bash';
    fs.writeFileSync(path.join(home, '.zshrc'), '# zsh\n');
    fs.writeFileSync(path.join(home, '.bashrc'), '# bash\n');

    addToPathUnix('/opt/npm/bin');

    expect(read('.bashrc')).toContain('/opt/npm/bin');
    expect(read('.zshrc')).not.toContain('/opt/npm/bin');
  });

  it('updates .zshrc for a Zsh user who has both', () => {
    process.env.SHELL = '/usr/bin/zsh';
    fs.writeFileSync(path.join(home, '.zshrc'), '# zsh\n');
    fs.writeFileSync(path.join(home, '.bashrc'), '# bash\n');

    addToPathUnix('/opt/npm/bin');

    expect(read('.zshrc')).toContain('/opt/npm/bin');
    expect(read('.bashrc')).not.toContain('/opt/npm/bin');
  });

  it('falls back to the first existing rc file for an unknown shell', () => {
    process.env.SHELL = '/usr/bin/fish';
    fs.writeFileSync(path.join(home, '.bashrc'), '# bash\n');

    addToPathUnix('/opt/npm/bin');

    expect(read('.bashrc')).toContain('/opt/npm/bin');
    expect(read('.profile')).toBe('');
  });

  it('does not add the path twice', () => {
    process.env.SHELL = '/bin/bash';
    addToPathUnix('/opt/npm/bin');
    addToPathUnix('/opt/npm/bin');

    expect(read('.bashrc').match(/\/opt\/npm\/bin/g)).toHaveLength(1);
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
