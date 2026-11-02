import type { ExecaReturnValue } from 'execa';
import { logger } from './logger';
import { isWindows } from './platform';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
  /**
   * Run `command` through the platform shell (`/bin/sh` or `cmd.exe`) instead of spawning it
   * directly, so `&&`, pipes, redirects and `VAR=x cmd` work. Default: spawn directly.
   */
  shell?: boolean | string;
}

async function getExeca() {
  const loadExeca = require('./load-execa.js');
  const m = await loadExeca();
  return m.execa;
}

export async function exec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecaReturnValue<string>> {
  const { cwd, env, silent = false, shell } = options;

  if (!silent) {
    logger.debug(`Executing: ${command} ${args.join(' ')}`);
  }

  const execa = await getExeca();
  try {
    const result = await execa(command, args, {
      cwd,
      env,
      shell: shell ?? false,
      stdio: silent ? 'pipe' : 'inherit',
    });

    return result;
  } catch (error: any) {
    if (!silent) {
      logger.error(`Command failed: ${command} ${args.join(' ')}`);
      if (error.stdout) {
        logger.error(`Stdout: ${error.stdout}`);
      }
      if (error.stderr) {
        logger.error(`Stderr: ${error.stderr}`);
      }
    }
    throw error;
  }
}


 //Execute a command and return stdout

export async function execStdout(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<string> {
  const result = await exec(command, args, { ...options, silent: true });
  return result.stdout.trim();
}


 //Check if a command exists in PATH

export async function commandExists(command: string): Promise<boolean> {
  try {
    if (isWindows()) {
      await execStdout('where', [command], { silent: true });
    } else {
      await execStdout('which', [command], { silent: true });
    }
    return true;
  } catch {
    return false;
  }
}
