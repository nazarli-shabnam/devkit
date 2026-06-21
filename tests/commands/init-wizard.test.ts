import * as path from 'path';
import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import prompts from 'prompts';
import { runInit } from '../../src/commands/init';
import { DevEnvConfigSchema } from '../../src/types/config';
import { logger } from '../../src/utils/logger';

describe('init wizard (runInit)', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  const originalTTY = process.stdout.isTTY;

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    // Force interactive so runInit drives the wizard.
    process.stdout.isTTY = true;
    tempDir = path.join(require('os').tmpdir(), `devkit-initw-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.stdout.isTTY = originalTTY;
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  it('builds a valid .dev-env.yml from wizard answers (minimal flow)', async () => {
    // Order: name, version, addDeps?, addDb?, addService?, addEnv?, dockerEnabled?
    prompts.inject(['my-app', '2.1.0', false, false, false, true, true]);

    await runInit(tempDir);

    const configPath = path.join(tempDir, '.dev-env.yml');
    expect(await fs.pathExists(configPath)).toBe(true);
    const parsed = DevEnvConfigSchema.parse(yaml.load(await fs.readFile(configPath, 'utf-8')));
    expect(parsed.name).toBe('my-app');
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.env).toMatchObject({ NODE_ENV: 'development' });
    expect(parsed.docker?.enabled).toBe(true);
  });

  it('captures a database with a health check from wizard answers', async () => {
    // name, version, addDeps?, addDb?(yes), dbType, dbFields..., then addDb?(no) etc.
    // db prompt sequence after type select: name, port, user, password, database, migrations?, seed?
    // To stay robust we drive a redis DB which has the fewest follow-ups.
    prompts.inject([
      'db-app', '1.0.0',
      false,                                   // addDeps?
      true, 'redis',                           // addDb? + type
      'cache', '7', 6379, 'localhost', '', '', // db: name, version, port, host, user, password
      false,                                   // add migrations?
      false,                                   // add seed?
      false,                                   // addDb? (stop)
      false,                                   // addService?
      false,                                   // addEnv?
      false,                                   // dockerEnabled?
      true,                                    // add health check?
    ]);

    await runInit(tempDir);

    const configPath = path.join(tempDir, '.dev-env.yml');
    const parsed = DevEnvConfigSchema.parse(yaml.load(await fs.readFile(configPath, 'utf-8')));
    expect(parsed.databases?.[0]?.type).toBe('redis');
    expect(parsed.health_checks?.some((h) => h.type === 'redis')).toBe(true);
  });
});
