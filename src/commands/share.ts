import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfigOrPromptInit } from '../core/config/loader';
import { DevEnvConfig, DevEnvConfigSchema } from '../types/config';
import { fileExists, readFile, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';
import { displayPath, resolveOutputPath } from '../utils/paths';
import { confirmOverwrite, generatedHeader } from '../utils/overwrite';
import { createSnapshot, uniqueSnapshotName } from '../core/snapshot/storage';


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
      if (url) {
        let hasCredentials = false;
        try {
          const parsed = new URL(url);
          hasCredentials = !!(parsed.username || parsed.password);
          if (!hasCredentials) {
            // Check query params for common credential keys
            for (const key of parsed.searchParams.keys()) {
              if (/password|secret|token|key|auth/i.test(key)) {
                hasCredentials = true;
                break;
              }
            }
          }
        } catch {
          // Not a valid URL — check for @ as fallback (e.g. user:pass@host)
          hasCredentials = url.includes('@');
        }
        sanitized.url = hasCredentials ? '${HEALTH_CHECK_URL}' : url;
      }
      return sanitized;
    }) ?? [],
  };
  return out;
}

export interface ShareExportOptions {
  output?: string;
  /** Overwrite an existing file that envkit did not generate. */
  force?: boolean;
}

export async function runShareExport(options: ShareExportOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const config = await loadConfigOrPromptInit(projectRoot);

  const sanitized = sanitizeConfigForShare(config);
  // Ensure sanitized output still validates (e.g. schema hasn't drifted)
  DevEnvConfigSchema.parse(sanitized);
  const yamlContent = generatedHeader('envkit share export') + yaml.dump(sanitized, { lineWidth: -1 });

  const outPath = resolveOutputPath(options.output, 'dev-env.shared.yml', projectRoot);
  if (!(await confirmOverwrite(outPath, { force: options.force, displayName: displayPath(outPath), regenerable: true }))) {
    logger.info('Cancelled. The existing file was left unchanged.');
    return;
  }

  await writeFile(outPath, yamlContent);
  logger.success(`Exported sanitized config to ${displayPath(outPath)}`);
}

export interface ShareImportOptions {
  output?: string;
  validateOnly?: boolean;
  /** Overwrite an existing target without asking (a backup of the project config is still saved). */
  force?: boolean;
}

export async function runShareImport(filePath: string, options: ShareImportOptions = {}): Promise<void> {
  if (!(await fileExists(filePath))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(filePath);
  let raw: unknown;
  try {
    raw = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA });
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

  if (options.validateOnly) {
    logger.success(`${filePath} is a valid dev-env config.`);
    return;
  }

  const projectRoot = await findProjectRoot(process.cwd());
  const outPath = resolveOutputPath(options.output, '.dev-env.yml', projectRoot);

  if (!(await confirmOverwrite(outPath, { force: options.force, displayName: displayPath(outPath) }))) {
    logger.info('Cancelled. The existing file was left unchanged.');
    return;
  }
  // Importing replaces the project config; keep what was there recoverable via `snapshot restore`.
  // (path.relative compares like the filesystem does, e.g. case-insensitively on Windows)
  if (path.relative(path.join(projectRoot, '.dev-env.yml'), outPath) === '' && (await fileExists(outPath))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = await createSnapshot(
      projectRoot,
      await uniqueSnapshotName(projectRoot, `pre-import-${stamp}`),
      await readFile(outPath)
    );
    logger.info(`Backed up current config to snapshot "${backup.name}".`);
  }

  const yamlContent = yaml.dump(parsed.data, { lineWidth: -1 });
  await writeFile(outPath, yamlContent);
  logger.success(`Imported config to ${displayPath(outPath)}`);
}
