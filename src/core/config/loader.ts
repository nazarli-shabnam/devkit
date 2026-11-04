import * as yaml from 'js-yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';
import prompts from 'prompts';
import { fileExists, readFile } from '../../utils/file-ops';
import { logger } from '../../utils/logger';
import { exitOnCancel, isInteractive } from '../../utils/prompt';
import { DevEnvConfig, DevEnvConfigSchema } from '../../types/config';
import { resolvePath } from '../../utils/platform';
import { runInit } from '../../commands/init';

export async function loadEnvFile(projectRoot: string): Promise<void> {
  const envPath = path.join(projectRoot, '.env');
  
  if (await fileExists(envPath)) {
    dotenv.config({ path: envPath });
    logger.debug(`Loaded environment variables from ${envPath}`);
  } else {
    logger.debug(`No .env file found at ${envPath}`);
  }
}

// `$${VAR}` (escape) | `${VAR}` / `${VAR:-default}`
const ENV_REFERENCE = /\$\$\{([^}]*)\}|\$\{([^}]+)\}/g;

/**
 * Expand `${VAR}` references in a single pass.
 *
 * - `${VAR:-default}` uses `default` when VAR is unset or empty (the default is literal text; nested `${...}` inside it is not supported).
 * - `$${VAR}` is an escape and yields the literal text `${VAR}`.
 * - Names defined in `env` (the config's own `env:` block) are expanded recursively, so they can
 *   reference each other. A reference to a name that is already being expanded (e.g.
 *   `PATH: ${PATH}:/extra` or `TOKEN: ${TOKEN}`) means the ambient value, as in a shell, so
 *   definitions can never recurse forever.
 * - Values coming from the process environment (e.g. `.env`) are inserted verbatim and never
 *   re-expanded, so a secret that happens to contain `${...}` is not mangled.
 */
export function resolveEnvVars(
  value: string,
  env: Record<string, string> = {},
  unresolved?: Set<string>
): string {
  const reportUnset = (name: string): void => {
    if (unresolved) {
      unresolved.add(name);
    } else {
      logger.warn(`Environment variable ${name} is not set`);
    }
  };

  const expand = (text: string, stack: string[]): string =>
    text.replace(ENV_REFERENCE, (match: string, escaped: string | undefined, reference: string) => {
      if (escaped !== undefined) return '${' + escaped + '}';

      const separator = reference.indexOf(':-');
      const name = separator === -1 ? reference : reference.slice(0, separator);
      const fallback = separator === -1 ? undefined : reference.slice(separator + 2);

      const defined = Object.prototype.hasOwnProperty.call(env, name) && !stack.includes(name);
      const resolved: string | undefined = defined ? expand(env[name], [...stack, name]) : process.env[name];

      if (resolved === undefined || (fallback !== undefined && resolved === '')) {
        if (fallback !== undefined) return fallback;
        reportUnset(name);
        return match;
      }
      return resolved;
    });

  return expand(value, []);
}

/**
 * The string values of the config's own `env:` block. ${VAR} references elsewhere in the
 * file (including inside other env values) may point at these. An entry that refers to its own
 * name (`TOKEN: ${TOKEN}`, `PATH: ${PATH}:/extra`) is a pass-through from the ambient
 * environment, so it is left out and resolves from `.env`/the shell as it always did.
 */
function extractLocalEnv(rawConfig: unknown): Record<string, string> {
  const localEnv: Record<string, string> = {};
  const envBlock = (rawConfig as { env?: unknown } | null | undefined)?.env;
  if (envBlock && typeof envBlock === 'object') {
    for (const [k, v] of Object.entries(envBlock)) {
      if (typeof v === 'string' && !v.includes('${' + k + '}')) localEnv[k] = v;
    }
  }
  return localEnv;
}

/**
 * Walk a raw (pre-validation) config object and return the names of all
 * `${VAR}` references that cannot be resolved from process.env or the config's
 * own `env` block. Used by `envkit validate --strict`.
 */
export function findUnresolvedVars(rawConfig: any): string[] {
  const unresolved = new Set<string>();
  const localEnv = extractLocalEnv(rawConfig);

  const walk = (obj: any): void => {
    if (typeof obj === 'string') {
      resolveEnvVars(obj, localEnv, unresolved);
    } else if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(walk);
    }
  };
  walk(rawConfig);

  return [...unresolved];
}

/**
 * Read .dev-env.yml exactly as written (no ${VAR} resolution, no schema defaults).
 * Used to tell secrets that come from ${VAR} apart from literals typed into the file.
 */
export async function loadRawConfig(projectRoot: string = process.cwd()): Promise<unknown> {
  const content = await readFile(path.join(projectRoot, '.dev-env.yml'));
  return yaml.load(content, { schema: yaml.DEFAULT_SCHEMA });
}

export async function loadConfig(projectRoot: string = process.cwd()): Promise<DevEnvConfig> {
  const configPath = path.join(projectRoot, '.dev-env.yml');
  
  if (!(await fileExists(configPath))) {
    throw new Error(
      `Configuration file not found: ${configPath}\n` +
      `Please create a .dev-env.yml file in your project root.`
    );
  }

  try {
    await loadEnvFile(projectRoot);

    const content = await readFile(configPath);
    const rawConfig = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as any;

    const resolvedConfig = resolveEnvVarsInConfig(rawConfig, extractLocalEnv(rawConfig));

    const config = DevEnvConfigSchema.parse(resolvedConfig);

    logger.debug(`Loaded configuration from ${configPath}`);
    return config;
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new Error(
        `Invalid configuration file:\n${issues}\n` +
        `Please check your .dev-env.yml file.`
      );
    }
    
    if (error.name === 'YAMLException' || (error.message && String(error.message).includes('YAML'))) {
      throw new Error(
        `Failed to parse YAML configuration: ${error.message}\n` +
        `Please check the syntax of your .dev-env.yml file.`
      );
    }
    
    throw error;
  }
}

/**
 * Load config, or (when missing) offer to run `envkit init` in interactive terminals.
 *
 * - If `.dev-env.yml` exists: behaves like `loadConfig`.
 * - If missing and not a TTY (or `offerInit: false`): throws with a message suggesting `envkit init`.
 * - If missing and TTY: prompts the user to run init now; on yes, runs init then loads.
 */
export interface LoadOrInitOptions {
  /** Offer to run `envkit init` when there is no config (default: true). Dry runs turn this off: they must not write files. */
  offerInit?: boolean;
}

export async function loadConfigOrPromptInit(
  projectRoot: string = process.cwd(),
  options: LoadOrInitOptions = {}
): Promise<DevEnvConfig> {
  const configPath = path.join(projectRoot, '.dev-env.yml');
  const exists = await fileExists(configPath);
  if (exists) return loadConfig(projectRoot);

  const baseMsg =
    `Configuration file not found: ${configPath}\n` +
    `Run \`envkit init\` to create one, or create a .dev-env.yml file in your project root.`;

  if (options.offerInit === false || !isInteractive()) {
    throw new Error(baseMsg);
  }

  const answer = await prompts(
    {
      type: 'text',
      name: 'value',
      message: 'No .dev-env.yml found. Run `envkit init` now? (Y/n)',
      initial: 'y',
      format: (v) => {
        const s = (v ?? '').trim().toLowerCase();
        if (s === '' || s === 'y' || s === 'yes' || s === '.') return true;
        if (s === 'n' || s === 'no') return false;
        return undefined; // let validate handle
      },
      validate: (v) => {
        const s = (v ?? '').trim().toLowerCase();
        if (s === '' || s === 'y' || s === 'yes' || s === '.' || s === 'n' || s === 'no') return true;
        return 'Please answer y (yes) or n (no)';
      },
    },
    { onCancel: exitOnCancel }
  );

  const runInitNow = answer?.value === true;
  if (!runInitNow) {
    throw new Error(baseMsg);
  }

  await runInit(projectRoot);
  return loadConfig(projectRoot);
}

function resolveEnvVarsInConfig(obj: any, localEnv: Record<string, string>): any {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj, localEnv);
  } else if (Array.isArray(obj)) {
    return obj.map(item => resolveEnvVarsInConfig(item, localEnv));
  } else if (obj !== null && typeof obj === 'object') {
    const resolved: any = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVarsInConfig(value, localEnv);
    }
    return resolved;
  }
  return obj;
}

export async function findProjectRoot(startPath: string = process.cwd()): Promise<string> {
  let currentPath = resolvePath(startPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const configPath = path.join(currentPath, '.dev-env.yml');
    
    if (await fileExists(configPath)) {
      return currentPath;
    }

    const markers = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod'];
    for (const marker of markers) {
      const markerPath = path.join(currentPath, marker);
      if (await fileExists(markerPath)) {
        return currentPath;
      }
    }

    currentPath = path.dirname(currentPath);
  }

  return process.cwd();
}
