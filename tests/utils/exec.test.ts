const mockExeca = jest.fn();
jest.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

import { exec, execStdout, commandExists } from '../../src/utils/exec';

describe('exec', () => {
  beforeEach(() => {
    mockExeca.mockReset();
  });

  describe('exec', () => {
    it('runs command and returns result', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
      const result = await exec('node', ['-e', 'console.log("ok")'], { silent: true });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ok');
      expect(mockExeca).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining(['-e', 'console.log("ok")']),
        expect.any(Object)
      );
    });

    it('throws on non-zero exit', async () => {
      const err = new Error('Command failed');
      (err as any).exitCode = 1;
      mockExeca.mockRejectedValue(err);
      await expect(
        exec('node', ['-e', 'process.exit(1)'], { silent: true })
      ).rejects.toThrow();
    });
  });

  describe('execStdout', () => {
    it('returns trimmed stdout', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0, stdout: '  hello  ', stderr: '' });
      const out = await execStdout('node', ['-e', 'console.log("  hello  ")'], { silent: true });
      expect(out).toBe('hello');
    });
  });

  describe('commandExists', () => {
    it('returns true when where/which succeeds', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0, stdout: '/usr/bin/node', stderr: '' });
      expect(await commandExists('node')).toBe(true);
    });

    it('returns false when where/which fails', async () => {
      mockExeca.mockRejectedValue(new Error('not found'));
      expect(await commandExists('nonexistent-command-xyz-123')).toBe(false);
    });
  });
});
