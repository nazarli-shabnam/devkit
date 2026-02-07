#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { detectOS } from '../utils/platform';
import * as fs from 'fs';
import * as path from 'path';

const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

import { runSetup } from '../commands/setup';
import { runGenerate } from '../commands/generate';
import { runInit, isInteractive } from '../commands/init';
import { runSnapshotCreate, runSnapshotList, runSnapshotRestore } from '../commands/snapshot';
import { runShareExport, runShareImport } from '../commands/share';
import { runPathSetup } from '../commands/path-setup';
import { findProjectRoot } from '../core/config/loader';

const program = new Command();

program
  .name('envkit')
  .description('Local Dev Environment Manager - One-command project setup and environment management')
  .version(version);

program
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress output')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      logger.setLevel(0);
    } else if (thisCommand.opts().quiet) {
      logger.setLevel(3);
    }

    const os = detectOS();
    logger.debug(`Running on ${os}`);
  });

program
  .command('init')
  .description('Create .dev-env.yml interactively (wizard)')
  .action(async () => {
    try {
      if (!isInteractive()) {
        logger.error('Run `envkit init` in a terminal to create a config file.');
        process.exit(1);
      }
      const projectRoot = await findProjectRoot();
      await runInit(projectRoot);
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Init failed');
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Set up the development environment')
  .option('--skip-deps', 'Skip dependency installation')
  .option('--skip-db', 'Skip database setup')
  .option('--dry-run', 'Preview changes without executing')
  .action(async (options) => {
    try {
      await runSetup({
        skipDeps: options.skipDeps,
        skipDb: options.skipDb,
        dryRun: options.dryRun,
      });
    } catch (err: any) {
      logger.error(err.message ?? 'Setup failed');
      process.exit(1);
    }
  });

const snapshotCommand = program
  .command('snapshot')
  .description('Manage environment snapshots');

snapshotCommand
  .command('create')
  .description('Create a new snapshot')
  .argument('[name]', 'Snapshot name')
  .action(async (name) => {
    try {
      await runSnapshotCreate(name);
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Snapshot create failed');
      process.exit(1);
    }
  });

snapshotCommand
  .command('list')
  .description('List all snapshots')
  .action(async () => {
    try {
      await runSnapshotList();
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Snapshot list failed');
      process.exit(1);
    }
  });

snapshotCommand
  .command('restore')
  .description('Restore .dev-env.yml from a snapshot')
  .argument('<name>', 'Snapshot name')
  .action(async (name) => {
    try {
      await runSnapshotRestore(name);
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Snapshot restore failed');
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('Generate docker-compose.yml from configuration')
  .option('-o, --output <file>', 'Output file path', 'docker-compose.yml')
  .action(async (options) => {
    try {
      await runGenerate({ output: options.output });
    } catch (err: any) {
      logger.error(err.message ?? 'Generate failed');
      process.exit(1);
    }
  });

const shareCommand = program
  .command('share')
  .description('Share development environments');

shareCommand
  .command('export')
  .description('Export sanitized configuration for sharing (no secrets)')
  .option('-o, --output <file>', 'Output file path', 'dev-env.shared.yml')
  .action(async (options) => {
    try {
      await runShareExport({ output: options.output });
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Share export failed');
      process.exit(1);
    }
  });

shareCommand
  .command('import')
  .description('Import shared configuration into project')
  .argument('<file>', 'Configuration file to import')
  .option('-o, --output <file>', 'Output file path', '.dev-env.yml')
  .action(async (file, options) => {
    try {
      await runShareImport(file, { output: options.output });
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Share import failed');
      process.exit(1);
    }
  });

program
  .command('path-setup')
  .alias('pathsetup')
  .description('Add envkit to your PATH so you can run "envkit" from any folder')
  .action(async () => {
    try {
      await runPathSetup();
    } catch (err: unknown) {
      logger.error((err as Error).message ?? 'Path setup failed');
      process.exit(1);
    }
  });

program.parseAsync().catch((error: any) => {
  if (error.code !== 'commander.helpDisplayed' && error.code !== 'commander.help') {
    logger.error(error.message || 'An error occurred');
    process.exit(1);
  }
});
