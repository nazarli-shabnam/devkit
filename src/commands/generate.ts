import * as path from 'path';
import { findProjectRoot, loadConfigOrPromptInit, loadRawConfig } from '../core/config/loader';
import type { DevEnvConfig } from '../types/config';
import { checkConfigWarnings } from '../core/config/validator';
import { generateComposeContent } from '../core/docker/compose-generator';
import { logger } from '../utils/logger';
import { writeFile } from '../utils/file-ops';
import { assertRealPathInside, displayPath, isInsideDir, resolveOutputPath } from '../utils/paths';
import { confirmOverwrite, generatedHeader } from '../utils/overwrite';

export interface GenerateOptions {
  output?: string;
  dryRun?: boolean;
  /** Overwrite an existing file that envkit did not generate. */
  force?: boolean;
}

/** `${NAME}` references left in generated compose text (`$${NAME}` escapes excluded). */
function composeVariables(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
  return [...names];
}

function getTemplatesDir(): string {
  return path.resolve(__dirname, '../../templates');
}

export async function runGenerate(options: GenerateOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config = await loadConfigOrPromptInit(projectRoot, { offerInit: !options.dryRun });
  // The file as written: tells ${VAR} secrets from literals, and lets the compose keep references.
  const writtenConfig = await loadRawConfig(projectRoot);
  checkConfigWarnings(config, writtenConfig as DevEnvConfig);

  if (config.docker?.enabled === false) {
    logger.info('Docker generation is disabled in config (docker.enabled: false).');
    return;
  }

  // No --output: the config's docker.output_file, relative to the project root. It comes from a
  // file that may have been shared by someone else, so it must stay inside the project.
  // (`||`, not `??`: an empty string must fall back to the default instead of naming the project root.)
  const configuredName = config.docker?.output_file?.trim() || 'docker-compose.yml';
  if (!options.output?.trim()) {
    const configuredPath = path.resolve(projectRoot, configuredName);
    if (path.isAbsolute(configuredName) || !isInsideDir(configuredPath, projectRoot)) {
      throw new Error(`docker.output_file "${configuredName}" must be a path inside the project. Use --output to write elsewhere.`);
    }
    // ...and a symlinked directory inside the project must not redirect the write out of it.
    assertRealPathInside(configuredPath, projectRoot, `docker.output_file "${configuredName}"`);
  }
  const outPath = resolveOutputPath(options.output, configuredName, projectRoot);

  const templatesDir = getTemplatesDir();
  const content = generatedHeader('docker compose') + generateComposeContent(config, templatesDir, writtenConfig);

  if (options.dryRun) {
    // Print to stdout without writing, so it can be inspected or piped.
    process.stdout.write(content.endsWith('\n') ? content : content + '\n');
    return;
  }

  if (!(await confirmOverwrite(outPath, { force: options.force, displayName: displayPath(outPath), regenerable: true }))) {
    logger.info('Cancelled. The existing file was left unchanged.');
    return;
  }

  await writeFile(outPath, content);
  logger.success(`Wrote ${displayPath(outPath)}`);

  const variables = composeVariables(content);
  if (variables.length > 0) {
    logger.info(
      `The compose file refers to ${variables.join(', ')}: Compose reads them from a .env file next to it or from your shell, ` +
        'so keep .env alongside docker-compose.yml (and out of version control).'
    );
  }
}
