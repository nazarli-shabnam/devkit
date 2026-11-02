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

function assertCommand(command: string): void {
  if (!command.trim()) {
    throw new Error('Empty command');
  }
}

/**
 * Run a configured command through the platform shell (`/bin/sh -c` on macOS/Linux, `cmd.exe`
 * on Windows), so what users type in `.dev-env.yml` (`npm run a && npm run b`, env prefixes,
 * quoting) behaves like it does in their terminal. The same file means the same thing everywhere
 * except for the shell's own syntax.
 */
async function runCommand(command: string, cwd: string, env: Record<string, string>): Promise<void> {
  await exec(command, [], {
    cwd,
    env: { ...process.env, ...env } as Record<string, string>,
    shell: true,
    silent: false,
  });
}

async function runDependency(
  dep: Dependency,
  projectRoot: string,
  env: Record<string, string>,
  dryRun: boolean
): Promise<void> {
  const cwd = path.resolve(projectRoot, dep.path);
  assertCommand(dep.command);

  if (dryRun) {
    logger.info(`[dry-run] Would run in ${dep.path}: ${dep.command}`);
    return;
  }

  logger.step(`Installing dependencies (${dep.type}) in ${dep.path}...`);
  await runCommand(dep.command, cwd, env);
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
          assertCommand(mig.command);
          if (dryRun) {
            logger.info(`[dry-run] Would run migration in ${mig.path}: ${mig.command}`);
          } else {
            logger.step(`Running migration in ${mig.path}...`);
            await runCommand(mig.command, cwd, env);
          }
        }
      }
      if (db.seed && !dryRun) {
        const seedPath = db.seed.path ?? '.';
        const cwd = path.resolve(projectRoot, seedPath);
        assertCommand(db.seed.command);
        logger.step(`Running seed (${db.type}) in ${seedPath}...`);
        await runCommand(db.seed.command, cwd, env);
      } else if (db.seed && dryRun) {
        logger.info(`[dry-run] Would run seed in ${db.seed.path ?? '.'}: ${db.seed.command}`);
      }
    }
  } else if (skipDb) {
    logger.debug('Skipping database setup (--skip-db).');
  }

  if (!dryRun) {
    logger.success(`Setup complete for ${config.name}`);
  }
}
