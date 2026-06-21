import * as path from 'path';
import * as yaml from 'js-yaml';
import { findProjectRoot, loadConfig, loadEnvFile, findUnresolvedVars } from '../core/config/loader';
import { checkConfigWarnings } from '../core/config/validator';
import type { DevEnvConfig } from '../types/config';
import { fileExists, readFile } from '../utils/file-ops';
import { logger, LogLevel } from '../utils/logger';

export interface ValidateOptions {
  /** When true, treat warnings and unresolved ${VAR} references as failures (non-zero exit). */
  strict?: boolean;
}

/**
 * Load and validate .dev-env.yml (and .env) without running setup/generate or
 * the init wizard. Intended for CI and pre-commit checks.
 *
 * Throws (→ exit 1 via the CLI handler) when the config is missing/invalid, or
 * when --strict is set and the config has warnings or unresolved variables.
 */
export async function runValidate(options: ValidateOptions = {}): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const configPath = path.join(projectRoot, '.dev-env.yml');

  if (!(await fileExists(configPath))) {
    throw new Error(
      `Configuration file not found: ${configPath}\n` +
      `Run \`envkit init\` to create one, or create a .dev-env.yml file in your project root.`
    );
  }

  // Detect unresolved ${VAR} references against the raw (pre-resolution) YAML.
  await loadEnvFile(projectRoot);
  const raw = yaml.load(await readFile(configPath), { schema: yaml.DEFAULT_SCHEMA });
  const unresolved = findUnresolvedVars(raw);

  // Full schema validation (throws with readable issues on failure). loadConfig
  // resolves ${VAR} and would re-warn for each unset one, which we already report
  // in aggregate below, so silence its per-occurrence warnings during this call.
  const prevLevel = logger.getLevel();
  logger.setLevel(LogLevel.ERROR);
  try {
    await loadConfig(projectRoot);
  } finally {
    logger.setLevel(prevLevel);
  }

  if (unresolved.length > 0) {
    logger.warn(
      `Unresolved environment variable(s): ${unresolved.join(', ')}\n` +
      'Define them in .env or your shell environment.'
    );
  }

  // Surface non-fatal config warnings (hardcoded secrets, port conflicts, ...).
  // Check the RAW config so correctly-externalized secrets (still `${VAR}` here)
  // are not mistaken for hardcoded ones after resolution.
  const warnings = checkConfigWarnings((raw ?? {}) as DevEnvConfig);

  if (options.strict && (unresolved.length > 0 || warnings.length > 0)) {
    throw new Error(
      `Validation failed (--strict): ${warnings.length} warning(s), ` +
      `${unresolved.length} unresolved variable(s).`
    );
  }

  logger.success(`${configPath} is valid.`);
}
