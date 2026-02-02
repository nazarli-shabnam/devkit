import { execa, ExecaReturnValue } from 'execa';
import { logger } from './logger';
import { isWindows, getShell } from './platform';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
  shell?: boolean | string;
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

  try {
    const result = await execa(command, args, {
      cwd,
      env,
      shell: useShell ? (isWindows() ? getShell() : true) : false,
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
