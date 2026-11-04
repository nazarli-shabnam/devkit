const mockExeca = jest.fn();
jest.mock('../../src/utils/load-execa.js', () => () =>
  Promise.resolve({ execa: (...args: unknown[]) => mockExeca(...args) })
);

import * as path from 'path';
import * as os from 'os';
import { exec } from '../../src/utils/exec';
import { logger, LogLevel } from '../../src/utils/logger';

describe('exec: missing working directory', () => {
  beforeEach(() => mockExeca.mockReset());

  it('says the directory is missing instead of a misleading spawn ENOENT, and never spawns', async () => {
    const missing = path.join(os.tmpdir(), `devkit-missing-${Date.now()}`, 'nope');
    await expect(exec('npm', ['install'], { cwd: missing })).rejects.toThrow(
      /Working directory not found: .*nope.*"path" setting/
    );
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('does not log a failure line itself (the CLI prints the thrown error once)', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation();
    mockExeca.mockRejectedValue(Object.assign(new Error('Command failed with exit code 1: npm install'), { exitCode: 1 }));
    await expect(exec('npm', ['install'])).rejects.toThrow('Command failed with exit code 1');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('still surfaces captured stdout/stderr when there is any', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation();
    mockExeca.mockRejectedValue(Object.assign(new Error('boom'), { stderr: 'details here' }));
    await expect(exec('x', [])).rejects.toThrow('boom');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('details here'));
    error.mockRestore();
  });
});

describe('logger output format', () => {
  const original = logger.getLevel();
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation();
    warn = jest.spyOn(console, 'warn').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => {
    logger.setLevel(original);
    jest.restoreAllMocks();
  });

  it('prints plain messages by default (no timestamp or level tag)', () => {
    logger.setLevel(LogLevel.INFO);
    logger.info('hello');
    logger.warn('careful');
    logger.error('broken');
    expect(strip(log.mock.calls[0][0])).toBe('hello');
    expect(strip(warn.mock.calls[0][0])).toBe('Warning: careful');
    expect(strip(errorSpy.mock.calls[0][0])).toBe('Error: broken');
  });

  it('does not repeat a label the message already starts with', () => {
    logger.setLevel(LogLevel.INFO);
    logger.warn('Warning: Hardcoded secrets detected');
    expect(strip(warn.mock.calls[0][0])).toBe('Warning: Hardcoded secrets detected');
  });

  it('keeps the timestamped, tagged format in verbose mode', () => {
    logger.setLevel(LogLevel.DEBUG);
    logger.info('hello');
    expect(strip(log.mock.calls[0][0])).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO\] hello$/);
  });
});
