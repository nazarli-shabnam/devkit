import * as path from 'path';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
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
  const outputFile = (options.output?.trim() || 'docker-compose.yml');

  const projectRoot = await findProjectRoot(process.cwd());
  logger.debug(`Project root: ${projectRoot}`);

  const config = await loadConfigOrPromptInit(projectRoot);
  checkConfigWarnings(config);

  if (config.docker?.enabled === false) {
    logger.info('Docker generation is disabled in config (docker.enabled: false).');
    return;
  }

  if (!path.isAbsolute(outputFile)) {
    const resolved = path.resolve(process.cwd(), outputFile);
    if (!resolved.startsWith(process.cwd())) {
      throw new Error(`Output path "${outputFile}" would write outside the working directory. Use an absolute path if intended.`);
    }
  }

  const templatesDir = getTemplatesDir();
  const content = generateComposeContent(config, templatesDir);
  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(process.cwd(), outputFile);

  await writeFile(outPath, content);
  logger.success(`Wrote ${outputFile}`);
}
