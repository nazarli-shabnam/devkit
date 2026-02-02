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
export function checkConfigWarnings(config: DevEnvConfig): void {
  // Check for passwords in config (should be in .env)
  const configStr = JSON.stringify(config);
  if (configStr.includes('password') && !configStr.includes('${')) {
    logger.warn(
      'Warning: Passwords detected in configuration file.\n' +
      'Consider using environment variables (${VAR_NAME}) and .env file for secrets.'
    );
  }

  // Check for missing database credentials
  config.databases?.forEach((db, index) => {
    if (db.type === 'postgresql' || db.type === 'mysql' || db.type === 'mariadb') {
      if (!db.user || !db.password) {
        logger.warn(
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
        logger.warn(`Port ${db.port} is used by multiple services. This may cause conflicts.`);
      }
      ports.add(db.port);
    }
  });

  config.services?.forEach(service => {
    if (service.port) {
      if (ports.has(service.port)) {
        logger.warn(`Port ${service.port} is used by multiple services. This may cause conflicts.`);
      }
      ports.add(service.port);
    }
  });
}
