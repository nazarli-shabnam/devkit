import type { ExecaReturnValue } from 'execa';
import { logger } from './logger';
import { fileExists } from './file-ops';
import { isWindows, getShell } from './platform';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
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

  // On Windows, use shell for commands that might need it
  const useShell = shell !== undefined ? shell : isWindows();

  if (!silent) {
    logger.debug(`Executing: ${command} ${args.join(' ')}`);
  }

  // Node reports a missing cwd as ENOENT for the *command* ("spawn npm ENOENT"), which sends people
  // looking for a missing tool. Say what is actually wrong.
  if (cwd && !(await fileExists(cwd))) {
    throw new Error(`Working directory not found: ${cwd}. Check the "path" setting of this command in .dev-env.yml.`);
  }

  const execa = await getExeca();
  try {
    const result = await execa(command, args, {
      cwd,
      env,
      shell: useShell ? (isWindows() ? getShell() : true) : false,
      stdio: silent ? 'pipe' : 'inherit',
    });

    return result;
  } catch (error: any) {
    // The thrown error already says which command failed and how ("Command failed with exit code
    // 1: npm install"); the CLI prints it once. Only add what that message does not contain.
    if (!silent) {
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
