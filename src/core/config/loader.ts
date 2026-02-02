import * as yaml from 'js-yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileExists, readFile } from '../../utils/file-ops';
import { logger } from '../../utils/logger';
import { DevEnvConfig, DevEnvConfigSchema } from '../../types/config';
import { resolvePath } from '../../utils/platform';

export async function loadEnvFile(projectRoot: string): Promise<void> {
  const envPath = path.join(projectRoot, '.env');
  
  if (await fileExists(envPath)) {
    dotenv.config({ path: envPath });
    logger.debug(`Loaded environment variables from ${envPath}`);
  } else {
    logger.debug(`No .env file found at ${envPath}`);
  }
}

/**
 * Resolve environment variable references in strings
 * Supports ${VAR_NAME} syntax
 */
export function resolveEnvVars(value: string, env: Record<string, string> = {}): string {
  const mergedEnv = { ...process.env, ...env };
  
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = mergedEnv[varName];
    if (value === undefined) {
      logger.warn(`Environment variable ${varName} is not set`);
      return match;
    }
    return value;
  });
}

 //Load and parse .dev-env.yml configuration file

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
    const rawConfig = yaml.load(content) as any;

    const resolvedConfig = resolveEnvVarsInConfig(rawConfig);

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
    
    if (error.message.includes('YAMLException')) {
      throw new Error(
        `Failed to parse YAML configuration: ${error.message}\n` +
        `Please check the syntax of your .dev-env.yml file.`
      );
    }
    
    throw error;
  }
}

function resolveEnvVarsInConfig(obj: any): any {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(item => resolveEnvVarsInConfig(item));
  } else if (obj !== null && typeof obj === 'object') {
    const resolved: any = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVarsInConfig(value);
    }
    return resolved;
  }
  return obj;
}

 //Find project root by looking for .dev-env.yml or other project markers

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
