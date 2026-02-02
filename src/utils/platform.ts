import * as os from 'os';
import * as path from 'path';

export type Platform = 'windows' | 'macos' | 'linux';

 //Detect the operating system

export function detectOS(): Platform {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return 'windows';
  } else if (platform === 'darwin') {
    return 'macos';
  } else {
    return 'linux';
  }
}

 //Check if running on Windows

export function isWindows(): boolean {
  return process.platform === 'win32';
}

 //Get the appropriate shell for the platform

export function getShell(): string {
  if (isWindows()) {
    // Prefer PowerShell, fallback to cmd
    return process.env.SHELL?.includes('powershell') || process.env.PSModulePath
      ? 'powershell'
      : 'cmd';
  }
  return 'bash';
}

 //Get path separator for the platform

export function getPathSeparator(): string {
  return path.sep;
}

 //Normalize a path for the current platform

export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

 //Get executable extension for the platform

export function getExecutableExtension(): string {
  return isWindows() ? '.exe' : '';
}

 //Join paths in a platform-agnostic way

export function joinPaths(...paths: string[]): string {
  return path.join(...paths);
}

 //Resolve a path relative to the current working directory

export function resolvePath(...paths: string[]): string {
  return path.resolve(...paths);
}

 //Get the home directory for the current user

export function getHomeDirectory(): string {
  return os.homedir();
}

 //Get temporary directory for the platform

export function getTempDirectory(): string {
  return os.tmpdir();
}
