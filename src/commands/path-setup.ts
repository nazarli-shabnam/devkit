import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import prompts from 'prompts';
import { detectOS, getHomeDirectory, getTempDirectory } from '../utils/platform';
import { logger } from '../utils/logger';
import { isInteractive } from './init';

function getNpmGlobalBin(): string {
  try {
    const out = execSync('npm bin -g', { encoding: 'utf-8' });
    return out.trim();
  } catch {
    throw new Error(
      'Could not get npm global bin path. Make sure npm is installed and in your PATH.'
    );
  }
}

function isInPath(pathToCheck: string): boolean {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const parts = pathEnv.split(sep).map((p) => p.trim());
  const normalized = path.normalize(pathToCheck);
  return parts.some((p) => path.normalize(p) === normalized || p === pathToCheck);
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

function addToPathUnix(binPath: string): void {
  const home = getHomeDirectory();
  const exportLine = `\nexport PATH="$PATH:${binPath}"\n`;
  const candidates = [path.join(home, '.zshrc'), path.join(home, '.bashrc'), path.join(home, '.profile')];
  let target: string | null = null;
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      target = f;
      break;
    }
  }
  if (!target) {
    target = path.join(home, '.profile');
  }
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
  } catch {
    // e.g. local install or npm not in PATH during postinstall — do nothing
    return;
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
    { onCancel: () => process.exit(0) }
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
