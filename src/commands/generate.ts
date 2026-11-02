import * as path from 'path';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
import { checkConfigWarnings } from '../core/config/validator';
import { generateComposeContent } from '../core/docker/compose-generator';
import { logger } from '../utils/logger';
import { writeFile } from '../utils/file-ops';
import { displayPath, resolveOutputPath } from '../utils/paths';

export interface GenerateOptions {
  output?: string;
  dryRun?: boolean;
}

function getTemplatesDir(): string {
  return path.resolve(__dirname, '../../templates');
}

export async function runGenerate(options: GenerateOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config = await loadConfigOrPromptInit(projectRoot);
  checkConfigWarnings(config);

  if (config.docker?.enabled === false) {
    logger.info('Docker generation is disabled in config (docker.enabled: false).');
    return;
  }

  const outPath = resolveOutputPath(options.output, 'docker-compose.yml', projectRoot);

  const templatesDir = getTemplatesDir();
  const content = generateComposeContent(config, templatesDir);

  if (options.dryRun) {
    // Print to stdout without writing, so it can be inspected or piped.
    process.stdout.write(content.endsWith('\n') ? content : content + '\n');
    return;
  }

  await writeFile(outPath, content);
  logger.success(`Wrote ${displayPath(outPath)}`);
}
