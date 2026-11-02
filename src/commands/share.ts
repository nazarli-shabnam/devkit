import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfigOrPromptInit, loadRawConfig } from '../core/config/loader';
import { DevEnvConfig, DevEnvConfigSchema } from '../types/config';
import { fileExists, readFile, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';

function validateOutputPath(outPath: string, baseDir: string): void {
  const resolved = path.resolve(baseDir, outPath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error(`Output path "${outPath}" would write outside the working directory. Use an absolute path if intended.`);
  }
}


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

/**
 * Walk the validated (resolved) config; wherever the file as written held a `${...}` reference,
 * use the written text instead of the resolved value. The result has the resolved config's shape
 * (known keys only), so nothing the schema stripped can leak through.
 */
export function restoreReferences(resolved: unknown, raw: unknown): unknown {
  if (Array.isArray(resolved)) {
    const rawItems = Array.isArray(raw) ? raw : [];
    return resolved.map((item, i) => restoreReferences(item, rawItems[i]));
  }
  if (resolved !== null && typeof resolved === 'object') {
    const rawObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(resolved as Record<string, unknown>).map(([key, value]) => [key, restoreReferences(value, rawObject[key])])
    );
  }
  return typeof raw === 'string' && raw.includes('${') ? raw : resolved;
}

export interface ShareExportOptions {
  output?: string;
}

export async function runShareExport(options: ShareExportOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  // The validated config decides which keys exist (unknown keys are dropped by the schema)...
  const config = await loadConfigOrPromptInit(projectRoot);
  // ...but string values go back to what the file says, so a ${VAR} reference stays a reference
  // and a secret used anywhere (commands, health checks, hosts, ...) is never baked in as its value.
  const withReferences = restoreReferences(config, await loadRawConfig(projectRoot)) as DevEnvConfig;

  const sanitized = sanitizeConfigForShare(withReferences);
  const yamlContent = yaml.dump(sanitized, { lineWidth: -1 });

  const outputFile = (options.output?.trim() || 'dev-env.shared.yml');
  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(process.cwd(), outputFile);

  if (!path.isAbsolute(outputFile)) {
    validateOutputPath(outputFile, process.cwd());
  }

  await writeFile(outPath, yamlContent);
  logger.success(`Exported sanitized config to ${outputFile}`);
}

export interface ShareImportOptions {
  output?: string;
  validateOnly?: boolean;
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

  const outputFile = (options.output?.trim() || '.dev-env.yml');
  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(process.cwd(), outputFile);

  if (!path.isAbsolute(outputFile)) {
    validateOutputPath(outputFile, process.cwd());
  }

  const yamlContent = yaml.dump(parsed.data, { lineWidth: -1 });
  await writeFile(outPath, yamlContent);
  logger.success(`Imported config to ${outputFile}`);
}
