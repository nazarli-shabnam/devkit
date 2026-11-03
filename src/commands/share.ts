import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfigOrPromptInit, loadRawConfig, loadEnvFile } from '../core/config/loader';
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

/** Placeholder-name fragment: upper-cased, non-alphanumerics collapsed to `_`. */
const placeholderId = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * One placeholder id per entry, guaranteed distinct: names that differ only by case/punctuation
 * (`main-db` / `main_db`), explicit-vs-generated names, and names with no usable characters
 * all get a numeric suffix instead of sharing a variable.
 */
function uniqueIds(names: string[], fallback: (index: number) => string): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = placeholderId(name) || fallback(index);
    let candidate = base;
    for (let n = 2; used.has(candidate); n++) candidate = `${base}_${n}`;
    used.add(candidate);
    return candidate;
  });
}

/**
 * Does this URL-like string carry literal credentials? Everything before the LAST `@` counts as
 * userinfo, so passwords containing an unencoded `/`, `?` or `#` are still caught (this errs on
 * the side of masking). `${VAR}` references are not credentials: they are what we want to share.
 * Returns undefined when the string is not URL-like at all.
 */
/**
 * Only a plain `${VAR}` is a safe stand-in for a credential. `${VAR:-secret}` carries a literal
 * default, so it is not stripped and still counts as a credential.
 */
const PLAIN_REFERENCES = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const SECRET_PAIR_KEY = /password|passwd|pwd|secret|token|key|auth/i;

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function hasLiteralCredentials(value: string): boolean | undefined {
  // Not anchored: `jdbc:postgresql://user:pw@host/db` and `prefix=mongodb://...` carry a URL too.
  const match = /[A-Za-z][A-Za-z0-9+.-]*:\/\/([\s\S]*)$/.exec(value);
  if (!match) return undefined;

  const rest = match[1];
  const at = rest.lastIndexOf('@');
  if (at !== -1 && rest.slice(0, at).replace(PLAIN_REFERENCES, '').replace(/:/g, '') !== '') return true;

  // Secret-looking key=value pairs anywhere after the authority: query, fragment, `;` parameters.
  const hasSecretPair = rest.split(/[?#&;]/).slice(1).some((pair) => {
    const [rawKey, val = ''] = pair.split('=');
    return SECRET_PAIR_KEY.test(safeDecode(rawKey)) && val !== '' && !isReference(val);
  });
  if (hasSecretPair) return true;

  // Finding a URL *inside* other text (`Server=h;Password=x;Url=http://ok/`) proves nothing about
  // the text around it, so only a value that really is a (possibly `jdbc:`-prefixed) URL is vouched
  // for. Anything else is an unknown format and callers treat it conservatively.
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:)+\/\//.test(value.trimStart()) ? false : undefined;
}

/** Credentials embedded in free-form text: `user:pass@host` or `password=...` style pairs. */
function looksLikeEmbeddedCredentials(value: string): boolean {
  if (hasLiteralCredentials(value) === true) return true;
  // `scheme://...` values were fully judged above; this catches `user:pass@host` without a scheme.
  if (!value.includes('://') && /[^\s/@:=;,]+:[^\s@]+@/.test(value.replace(PLAIN_REFERENCES, ''))) return true;
  const pair = /(?:^|[;&,\s?])(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*=\s*([^;&\s]*)/i.exec(value);
  return pair !== null && pair[1] !== '' && !isReference(pair[1]);
}

/**
 * Env keys that name a secret. Deliberately broad (substring, case-insensitive): a false positive
 * only costs the importer one variable to fill in, a false negative leaks a secret.
 */
const SECRET_KEY = /pass|pwd|secret|token|key|auth|credential|private|signature|cert|dsn|salt|session/i;
const SECRET_KEY_SEGMENT = /(^|[^a-z])(pat|sk|pk)([^a-z]|$)/i;
const looksLikeSecretKey = (key: string): boolean => SECRET_KEY.test(key) || SECRET_KEY_SEGMENT.test(key);

/**
 * Prepare a config for sharing: credentials and secret-looking values are replaced by `${VAR}`
 * placeholders, everything else is kept. Values that are already a plain reference are kept as is
 * (so the original variable names survive); literals get a placeholder that is unique per
 * database / health check, so different credentials never collapse into one variable.
 */
export function sanitizeConfigForShare(config: DevEnvConfig): DevEnvConfig {
  const databases = config.databases ?? [];
  const healthChecks = config.health_checks ?? [];
  // A single entry keeps the short, conventional names; several get a unique infix.
  const databaseIds = databases.length > 1
    ? uniqueIds(databases.map((db, i) => db.name ?? `${db.type}_${i + 1}`), (i) => `DB_${i + 1}`)
    : [];
  const healthCheckIds = healthChecks.length > 1
    ? uniqueIds(healthChecks.map((h) => h.name), (i) => `CHECK_${i + 1}`)
    : [];

  const out: DevEnvConfig = {
    ...config,
    dependencies: config.dependencies?.map((d) => ({ ...d })) ?? [],
    databases: databases.map((db, index) => {
      const { password, user, ...rest } = db;
      const sanitized: typeof db = { ...rest };
      const infix = databaseIds.length > 0 ? `${databaseIds[index]}_` : '';
      if (user) sanitized.user = isReference(user) ? user : `\${DB_${infix}USER}`;
      if (password !== undefined) sanitized.password = isReference(password) ? password : `\${DB_${infix}PASSWORD}`;
      return sanitized;
    }),
    services: config.services?.map((s) => ({ ...s })) ?? [],
    // Secret-looking keys and values with embedded credentials are masked; ordinary settings
    // (NODE_ENV, LOG_LEVEL, ...) stay usable for the importer.
    env: Object.fromEntries(
      Object.entries(config.env ?? {}).map(([key, value]) => {
        const secret = looksLikeSecretKey(key) || looksLikeEmbeddedCredentials(value);
        return [key, secret && !isReference(value) ? `\${${key}}` : value];
      })
    ),
    health_checks: healthChecks.map((h, index) => {
      const { connection_string, url, ...rest } = h;
      const sanitized: typeof h = { ...rest };
      const infix = healthCheckIds.length > 0 ? `${healthCheckIds[index]}_` : '';
      if (connection_string) {
        // Non-URL formats (e.g. "Server=x;Password=y") cannot be inspected, so they are always masked.
        const literal = hasLiteralCredentials(connection_string) ?? true;
        sanitized.connection_string = literal ? `\${${infix}CONNECTION_STRING}` : connection_string;
      }
      if (url) {
        const literal = hasLiteralCredentials(url) ?? (url.includes('@') || looksLikeEmbeddedCredentials(url));
        sanitized.url = literal ? `\${${infix || 'HEALTH_CHECK_'}URL}` : url;
      }
      return sanitized;
    }),
  };
  return out;
}

/**
 * Variables a config expects the user to provide: every `${NAME}` it references that is not set
 * in the environment, has no `:-default`, and is not defined by the config's own `env:` block.
 * A block entry that names itself (`API_KEY: ${API_KEY}`) is a pass-through placeholder, not a
 * definition, so it still counts as required.
 */
export function requiredVariables(raw: unknown): string[] {
  const defined = new Set<string>();
  const envBlock = (raw as { env?: unknown } | null | undefined)?.env;
  if (envBlock && typeof envBlock === 'object') {
    for (const [key, value] of Object.entries(envBlock)) {
      if (typeof value === 'string' && !value.includes(`\${${key}}`)) defined.add(key);
    }
  }

  const required = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      // `$${VAR}` is an escape (literal text), so it is skipped; `${VAR:-x}` has its own default.
      for (const m of node.matchAll(/(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g)) {
        if (m[2] === undefined && process.env[m[1]] === undefined && !defined.has(m[1])) required.add(m[1]);
      }
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node !== null && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(raw);
  return [...required];
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
  const missing = requiredVariables(raw);
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
