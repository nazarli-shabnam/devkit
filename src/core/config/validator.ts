import { DevEnvConfig, DevEnvConfigSchema } from '../../types/config';
import { logger } from '../../utils/logger';

/**
 * Validate configuration object
 */
export function validateConfig(config: any): DevEnvConfig {
  try {
    return DevEnvConfigSchema.parse(config);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => {
        const path = issue.path.join('.');
        return `  - ${path}: ${issue.message}`;
      }).join('\n');
      
      throw new Error(`Configuration validation failed:\n${issues}`);
    }
    throw error;
  }
}

/**
 * Check for common configuration issues and warn
 */
function isLiteralSecret(value: string | undefined): boolean {
  // A real secret is a non-empty string that is not an unresolved ${VAR} placeholder.
  return !!value && !value.includes('${');
}

/**
 * Check for common configuration issues. Each issue is logged as a warning and
 * also returned, so callers (e.g. `validate --strict`) can act on them.
 */
export function checkConfigWarnings(config: DevEnvConfig): string[] {
  const warnings: string[] = [];
  const warn = (msg: string): void => {
    warnings.push(msg);
    logger.warn(msg);
  };

  // Check for hardcoded passwords in known secret locations (should be in .env).
  // Only inspect real secret fields so keys like `password_reset_url` don't false-positive.
  if (config.databases?.some((db) => isLiteralSecret(db.password))) {
    warn(
      'Warning: Passwords detected in configuration file.\n' +
      'Consider using environment variables (${VAR_NAME}) and .env file for secrets.'
    );
  }

  // Check for missing database credentials
  config.databases?.forEach((db, index) => {
    if (db.type === 'postgresql' || db.type === 'mysql' || db.type === 'mariadb') {
      if (!db.user || !db.password) {
        warn(
          `Database ${index + 1} (${db.type}) is missing user or password.\n` +
          'Make sure to set these via environment variables or .env file.'
        );
      }
    }
  });

  // Check for port conflicts
  const ports = new Set<number>();
  config.databases?.forEach(db => {
    if (db.port) {
      if (ports.has(db.port)) {
        warn(`Port ${db.port} is used by multiple services. This may cause conflicts.`);
      }
      ports.add(db.port);
    }
  });

  config.services?.forEach(service => {
    if (service.port) {
      if (ports.has(service.port)) {
        warn(`Port ${service.port} is used by multiple services. This may cause conflicts.`);
      }
      ports.add(service.port);
    }
  });

  return warnings;
}
