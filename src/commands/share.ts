import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfig } from '../core/config/loader';
import { DevEnvConfig, DevEnvConfigSchema } from '../types/config';
import { fileExists, readFile, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';


export function sanitizeConfigForShare(config: DevEnvConfig): DevEnvConfig {
  const out: DevEnvConfig = {
    ...config,
    dependencies: config.dependencies?.map((d) => ({ ...d })) ?? [],
    databases: config.databases?.map((db) => {
      const { password, user, ...rest } = db;
      const sanitized: typeof db = { ...rest };
      if (user) sanitized.user = '${DB_USER}';
      if (password !== undefined) sanitized.password = '${DB_PASSWORD}';
      return sanitized;
    }) ?? [],
    services: config.services?.map((s) => ({ ...s })) ?? [],
    env: config.env && Object.keys(config.env).length > 0
      ? Object.fromEntries(
          Object.keys(config.env).map((k) => [k, `\${${k}}`])
        )
      : {},
    health_checks: config.health_checks?.map((h) => {
      const { connection_string, url, ...rest } = h;
      const sanitized: typeof h = { ...rest };
      if (connection_string) sanitized.connection_string = '${CONNECTION_STRING}';
      if (url && (url.includes('://') && url.includes('@'))) sanitized.url = '${HEALTH_CHECK_URL}';
      else if (url) sanitized.url = url;
      return sanitized;
    }) ?? [],
  };
  return out;
}

export interface ShareExportOptions {
  output?: string;
}

export async function runShareExport(options: ShareExportOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const config = await loadConfig(projectRoot);

  const sanitized = sanitizeConfigForShare(config);
  const yamlContent = yaml.dump(sanitized, { lineWidth: -1 });

  const outputFile = options.output ?? 'dev-env.shared.yml';
  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(projectRoot, outputFile);

  await writeFile(outPath, yamlContent);
  logger.success(`Exported sanitized config to ${outputFile}`);
}

export interface ShareImportOptions {
  output?: string;
}

export async function runShareImport(filePath: string, options: ShareImportOptions = {}): Promise<void> {
  if (!(await fileExists(filePath))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(filePath);
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML in ${filePath}: ${msg}`);
  }

  const parsed = DevEnvConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid dev-env config in ${filePath}:\n${issues}`);
  }

  const projectRoot = await findProjectRoot(process.cwd());
  const outputFile = options.output ?? '.dev-env.yml';
  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(projectRoot, outputFile);

  const yamlContent = yaml.dump(parsed.data, { lineWidth: -1 });
  await writeFile(outPath, yamlContent);
  logger.success(`Imported config to ${outputFile}`);
}
