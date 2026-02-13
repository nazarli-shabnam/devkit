import * as path from 'path';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
import { checkConfigWarnings } from '../core/config/validator';
import type { DevEnvConfig, Dependency } from '../types/config';
import { logger } from '../utils/logger';
import { exec } from '../utils/exec';

export interface SetupOptions {
  skipDeps?: boolean;
  skipDb?: boolean;
  dryRun?: boolean;
}

function parseCommand(commandStr: string): { cmd: string; args: string[] } {
  const trimmed = commandStr.trim();
  if (!trimmed) {
    throw new Error('Empty command');
  }

  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);

  if (parts.length === 0) {
    throw new Error('Empty command');
  }
  return { cmd: parts[0], args: parts.slice(1) };
}

async function runDependency(
  dep: Dependency,
  projectRoot: string,
  env: Record<string, string>,
  dryRun: boolean
): Promise<void> {
  const cwd = path.resolve(projectRoot, dep.path);
  const { cmd, args } = parseCommand(dep.command);

  if (dryRun) {
    logger.info(`[dry-run] Would run in ${dep.path}: ${dep.command}`);
    return;
  }

  logger.step(`Installing dependencies (${dep.type}) in ${dep.path}...`);
  await exec(cmd, args, {
    cwd,
    env: { ...process.env, ...env } as Record<string, string>,
    silent: false,
  });
}

export async function runSetup(options: SetupOptions = {}): Promise<void> {
  const { skipDeps = false, skipDb = false, dryRun = false } = options;

  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config: DevEnvConfig = await loadConfigOrPromptInit(projectRoot);
  checkConfigWarnings(config);

  const env = config.env ?? {};

  if (dryRun) {
    logger.info('Dry run: no commands will be executed.');
  }

  if (!skipDeps && config.dependencies && config.dependencies.length > 0) {
    for (const dep of config.dependencies) {
      await runDependency(dep, projectRoot, env, dryRun);
    }
  } else if (skipDeps) {
    logger.debug('Skipping dependency installation (--skip-deps).');
  }

  if (!skipDb && config.databases && config.databases.length > 0) {
    for (const db of config.databases) {
      if (db.migrations?.length) {
        for (const mig of db.migrations) {
          const cwd = path.resolve(projectRoot, mig.path);
          const { cmd, args } = parseCommand(mig.command);
          if (dryRun) {
            logger.info(`[dry-run] Would run migration in ${mig.path}: ${mig.command}`);
          } else {
            logger.step(`Running migration in ${mig.path}...`);
            await exec(cmd, args, {
              cwd,
              env: { ...process.env, ...env } as Record<string, string>,
              silent: false,
            });
          }
        }
      }
      if (db.seed && !dryRun) {
        const { cmd, args } = parseCommand(db.seed.command);
        logger.step(`Running seed (${db.type})...`);
        await exec(cmd, args, {
          cwd: projectRoot,
          env: { ...process.env, ...env } as Record<string, string>,
          silent: false,
        });
      } else if (db.seed && dryRun) {
        logger.info(`[dry-run] Would run seed: ${db.seed.command}`);
      }
    }
  } else if (skipDb) {
    logger.debug('Skipping database setup (--skip-db).');
  }

  if (!dryRun) {
    logger.success(`Setup complete for ${config.name}`);
  }
}
