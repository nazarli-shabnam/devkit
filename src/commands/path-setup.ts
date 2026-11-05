import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import prompts from 'prompts';
import { detectOS, getHomeDirectory, getTempDirectory } from '../utils/platform';
import { logger } from '../utils/logger';
import { exitOnCancel } from '../utils/prompt';
import { isInteractive } from './init';

/**
 * Where npm puts global executables: `<prefix>/bin` on macOS/Linux, the prefix itself on Windows.
 * (`npm bin -g` was removed in npm 9, so the prefix is asked for instead; `npm prefix -g` works
 * on every npm version.)
 */
function getNpmGlobalBin(): string {
  let prefix: string;
  try {
    prefix = execSync('npm prefix -g', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const reason = err instanceof Error ? ` (${err.message.split('\n')[0]})` : '';
    throw new Error(
      `Could not find npm's global install location${reason}. Make sure npm is installed and on your PATH.`
    );
  }
  if (!prefix) {
    throw new Error("Could not find npm's global install location: `npm prefix -g` printed nothing.");
  }
  return process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

/** npm runs `postinstall` automatically; there a failure must not print errors or fail the install. */
const isPostinstall = (): boolean => process.env.npm_lifecycle_event === 'postinstall';

function isInPath(pathToCheck: string): boolean {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const parts = pathEnv.split(sep).map((p) => p.trim());
  const normalized = path.normalize(pathToCheck);
  if (process.platform === 'win32') {
    const normalizedLower = normalized.toLowerCase();
    return parts.some((p) => path.normalize(p).toLowerCase() === normalizedLower);
  }
  return parts.some((p) => path.normalize(p) === normalized);
}

function addToPathWindows(binPath: string): void {
  const scriptPath = path.join(getTempDirectory(), `envkit-path-setup-${Date.now()}.ps1`);
  const script = `
param([string]$PathToAdd)
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($current -and -not $current.EndsWith(';')) { $current += ';' }
$newPath = $current + $PathToAdd
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
`.trim();
  fs.writeFileSync(scriptPath, script);
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PathToAdd "${binPath.replace(/"/g, '`"')}"`, {
      stdio: 'pipe',
    });
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // ignore
    }
  }
}

export function addToPathUnix(binPath: string): void {
  // Validate binPath to prevent shell metacharacter injection in rc files
  if (/[`$"\\;|&!(){}]/.test(binPath)) {
    throw new Error(`Unsafe characters in bin path: ${binPath}`);
  }
  const home = getHomeDirectory();
  const exportLine = `\nexport PATH="$PATH:${binPath}"\n`;
  // Update the rc file of the shell the user actually runs; otherwise a user with both
  // .zshrc and .bashrc would get the wrong one. Unknown shells fall back to the first file that exists.
  const shellRc: Record<string, string> = { zsh: '.zshrc', bash: '.bashrc' };
  const preferred = shellRc[path.basename(process.env.SHELL || '')];
  const candidates = [preferred, '.zshrc', '.bashrc', '.profile']
    .filter((f): f is string => Boolean(f))
    .map((f) => path.join(home, f));
  const target =
    (preferred ? candidates[0] : candidates.find((f) => fs.existsSync(f))) ?? path.join(home, '.profile');
  let content = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '';
  if (content.includes(binPath)) {
    return;
  }
  content += exportLine;
  fs.writeFileSync(target, content);
}

export async function runPathSetup(): Promise<void> {
  let binPath: string;
  try {
    binPath = getNpmGlobalBin();
  } catch (err) {
    // During `npm install` npm may not be reachable the way we expect: stay quiet there.
    // When the user ran `envkit path-setup` themselves, tell them why nothing happened.
    if (isPostinstall()) return;
    throw err;
  }

  if (isInPath(binPath)) {
    logger.info('envkit is already on your PATH.');
    return;
  }

  if (!isInteractive()) {
    logger.info(`To use 'envkit' from any folder, add this to your PATH:\n  ${binPath}`);
    logger.info('Or run "envkit path-setup" in an interactive terminal to add it automatically.');
    return;
  }

  const { value: agree } = await prompts(
    {
      type: 'confirm',
      name: 'value',
      message: `Add envkit to your PATH?\n  ${binPath}\n\nThis lets you run "envkit" from any folder. (y/n)`,
      initial: true,
    },
    { onCancel: exitOnCancel }
  );

  if (!agree) {
    logger.info('Skipped. You can run "envkit path-setup" again later or add the path manually.');
    return;
  }

  const os = detectOS();
  try {
    if (os === 'windows') {
      addToPathWindows(binPath);
    } else {
      addToPathUnix(binPath);
    }
    logger.success('PATH updated. Restart your terminal (or open a new one) for "envkit" to be available.');
  } catch (err) {
    logger.error((err as Error).message ?? 'Failed to update PATH.');
    throw err;
  }
}
