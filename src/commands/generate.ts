import * as path from 'path';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
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

function getTemplatesDir(): string {
  return path.resolve(__dirname, '../../templates');
}

export async function runGenerate(options: GenerateOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config = await loadConfigOrPromptInit(projectRoot, { offerInit: !options.dryRun });
  checkConfigWarnings(config);

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
  const content = generatedHeader('docker compose') + generateComposeContent(config, templatesDir);

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
}
