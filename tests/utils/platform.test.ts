import * as path from 'path';
import * as os from 'os';
import {
  detectOS,
  isWindows,
  getShell,
  getPathSeparator,
  normalizePath,
  getExecutableExtension,
  joinPaths,
  resolvePath,
  getHomeDirectory,
  getTempDirectory,
} from '../../src/utils/platform';

describe('platform utils', () => {
  describe('detectOS', () => {
    it('returns windows | macos | linux', () => {
      const platform = detectOS();
      expect(['windows', 'macos', 'linux']).toContain(platform);
    });
  });

  describe('isWindows', () => {
    it('returns boolean matching process.platform', () => {
      expect(isWindows()).toBe(process.platform === 'win32');
    });
  });

  describe('getShell', () => {
    it('returns powershell or cmd on Windows, bash otherwise', () => {
      const shell = getShell();
      if (process.platform === 'win32') {
        expect(['powershell', 'cmd']).toContain(shell);
      } else {
        expect(shell).toBe('bash');
      }
    });
  });

  describe('getPathSeparator', () => {
    it('returns path.sep', () => {
      expect(getPathSeparator()).toBe(path.sep);
    });
  });

  describe('normalizePath', () => {
    it('normalizes path', () => {
      expect(normalizePath('foo/bar/..')).toBe(path.normalize('foo/bar/..'));
    });
  });

  describe('getExecutableExtension', () => {
    it('returns .exe on Windows, empty string otherwise', () => {
      const ext = getExecutableExtension();
      if (process.platform === 'win32') {
        expect(ext).toBe('.exe');
      } else {
        expect(ext).toBe('');
      }
    });
  });

  describe('joinPaths', () => {
    it('joins paths with path.join', () => {
      expect(joinPaths('a', 'b', 'c')).toBe(path.join('a', 'b', 'c'));
    });
  });

  describe('resolvePath', () => {
    it('resolves paths', () => {
      expect(resolvePath('foo')).toBe(path.resolve('foo'));
    });
  });

  describe('getHomeDirectory', () => {
    it('returns os.homedir()', () => {
      expect(getHomeDirectory()).toBe(os.homedir());
    });
  });

  describe('getTempDirectory', () => {
    it('returns os.tmpdir()', () => {
      expect(getTempDirectory()).toBe(os.tmpdir());
    });
  });
});
