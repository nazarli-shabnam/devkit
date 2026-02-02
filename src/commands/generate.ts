import * as path from 'path';
import { findProjectRoot, loadConfig } from '../core/config/loader';
import { checkConfigWarnings } from '../core/config/validator';
import { generateComposeContent } from '../core/docker/compose-generator';
import { logger } from '../utils/logger';
import { writeFile } from '../utils/file-ops';

export interface GenerateOptions {
  output?: string;
}

function getTemplatesDir(): string {
  return path.resolve(__dirname, '../../templates');
}

export async function runGenerate(options: GenerateOptions = {}): Promise<void> {
  const outputFile = options.output ?? 'docker-compose.yml';

  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config = await loadConfig(projectRoot);
  checkConfigWarnings(config);

  if (config.docker?.enabled === false) {
    logger.info('Docker generation is disabled in config (docker.enabled: false).');
    return;
  }

  const templatesDir = getTemplatesDir();
  const content = generateComposeContent(config, templatesDir);
  const outPath = path.resolve(projectRoot, outputFile);

  await writeFile(outPath, content);
  logger.success(`Wrote ${outputFile}`);
}
