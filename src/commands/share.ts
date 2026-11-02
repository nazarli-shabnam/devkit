import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfigOrPromptInit, loadRawConfig, loadEnvFile, findUnresolvedVars } from '../core/config/loader';
import { isSecretEnvKey } from '../core/config/validator';
import { DevEnvConfig, DevEnvConfigSchema } from '../types/config';
import { fileExists, readFile, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';

function validateOutputPath(outPath: string, baseDir: string): void {
  const resolved = path.resolve(baseDir, outPath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error(`Output path "${outPath}" would write outside the working directory. Use an absolute path if intended.`);
  }
}


/** A value that is exactly one `${VAR}` reference (already safe to share). */
const SINGLE_REFERENCE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const isReference = (value: string): boolean => SINGLE_REFERENCE.test(value);

/** `ID` for a placeholder name: upper-cased, non-alphanumerics collapsed to `_`. */
const placeholderId = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Does this URL-like string carry literal credentials (userinfo or a secret-looking query
 * parameter)? `${VAR}` references do not count: they are exactly what we want to share.
 * Returns undefined when the string is not URL-like at all.
 */
function hasLiteralCredentials(value: string): boolean | undefined {
  const match = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)([^#]*)/.exec(value);
  if (!match) return undefined;

  const authority = match[1];
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    const userinfo = authority.slice(0, at).replace(/\$\{[^}]*\}/g, '').replace(/:/g, '');
    if (userinfo !== '') return true;
  }

  const query = match[2].split('?')[1] ?? '';
  return query
    .split('&')
    .some((pair) => {
      const [key, val = ''] = pair.split('=');
      return /password|secret|token|key|auth/i.test(key) && val !== '' && !isReference(val);
    });
}

/**
 * Prepare a config for sharing: credentials and secret-looking values are replaced by `${VAR}`
 * placeholders, everything else is kept. Values that are already a plain reference are kept as is
 * (so the original variable names survive); literals get a placeholder that is unique per
 * database / health check, so different credentials never collapse into one variable.
 */
export function sanitizeConfigForShare(config: DevEnvConfig): DevEnvConfig {
  const databaseCount = config.databases?.length ?? 0;
  const healthCheckCount = config.health_checks?.length ?? 0;

  const out: DevEnvConfig = {
    ...config,
    dependencies: config.dependencies?.map((d) => ({ ...d })) ?? [],
    databases: config.databases?.map((db, index) => {
      const { password, user, ...rest } = db;
      const sanitized: typeof db = { ...rest };
      // A single database keeps the short, conventional names.
      const infix = databaseCount > 1 ? `${placeholderId(db.name ?? `${db.type}_${index + 1}`)}_` : '';
      if (user) sanitized.user = isReference(user) ? user : `\${DB_${infix}USER}`;
      if (password !== undefined) sanitized.password = isReference(password) ? password : `\${DB_${infix}PASSWORD}`;
      return sanitized;
    }) ?? [],
    services: config.services?.map((s) => ({ ...s })) ?? [],
    // Only values that look like secrets are masked; ordinary settings (NODE_ENV, ...) stay usable.
    env: Object.fromEntries(
      Object.entries(config.env ?? {}).map(([key, value]) => {
        const secret = isSecretEnvKey(key) || hasLiteralCredentials(value) === true;
        return [key, secret && !isReference(value) ? `\${${key}}` : value];
      })
    ),
    health_checks: config.health_checks?.map((h) => {
      const { connection_string, url, ...rest } = h;
      const sanitized: typeof h = { ...rest };
      const infix = healthCheckCount > 1 ? `${placeholderId(h.name)}_` : '';
      if (connection_string) {
        // Non-URL formats (e.g. "Server=x;Password=y") cannot be inspected, so they are always masked.
        const literal = hasLiteralCredentials(connection_string) ?? true;
        sanitized.connection_string = literal ? `\${${infix}CONNECTION_STRING}` : connection_string;
      }
      if (url) {
        const literal = hasLiteralCredentials(url) ?? url.includes('@');
        sanitized.url = literal ? `\${${infix || 'HEALTH_CHECK_'}URL}` : url;
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

  // Tell the user which variables the shared file expects them to provide.
  await loadEnvFile(await findProjectRoot(process.cwd()));
  const missing = findUnresolvedVars(raw);
  if (missing.length > 0) {
    logger.info(`This config references variables that are not set here: ${missing.join(', ')}. Define them in .env or your shell.`);
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
