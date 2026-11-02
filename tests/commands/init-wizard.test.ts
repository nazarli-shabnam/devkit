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
  const originalStdinTTY = process.stdin.isTTY;

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    // Force interactive so runInit drives the wizard.
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    tempDir = path.join(require('os').tmpdir(), `devkit-initw-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.stdout.isTTY = originalTTY;
    process.stdin.isTTY = originalStdinTTY;
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

  it('captures a service from wizard answers without writing inert options', async () => {
    prompts.inject([
      'svc-app', '1.0.0',
      false,                                  // addDeps?
      false,                                  // addDb?
      true,                                   // addService?
      'rabbitmq', '3.12', 5672, 15672,        // service: type, version, port, management port
      false,                                  // addService? (stop)
      false,                                  // addEnv?
      false,                                  // dockerEnabled?
    ]);

    await runInit(tempDir);

    const text = await fs.readFile(path.join(tempDir, '.dev-env.yml'), 'utf-8');
    const parsed = DevEnvConfigSchema.parse(yaml.load(text));
    expect(parsed.services?.[0]).toMatchObject({ type: 'rabbitmq', port: 5672, management_port: 15672 });
    expect(text).not.toMatch(/^\s*host:/m);
  });

  it('captures a database from wizard answers without writing inert options', async () => {
    // db prompt sequence after type select: name, version, port, user, password (redis: no database name)
    prompts.inject([
      'db-app', '1.0.0',
      false,                             // addDeps?
      true, 'redis',                     // addDb? + type
      'cache', '7', 6379, '', '',        // db: name, version, port, user, password
      false,                             // add migrations?
      false,                             // add seed?
      false,                             // addDb? (stop)
      false,                             // addService?
      false,                             // addEnv?
      false,                             // dockerEnabled?
    ]);

    await runInit(tempDir);

    const configPath = path.join(tempDir, '.dev-env.yml');
    const text = await fs.readFile(configPath, 'utf-8');
    const parsed = DevEnvConfigSchema.parse(yaml.load(text));
    expect(parsed.databases?.[0]?.type).toBe('redis');
    // options envkit does not use are no longer written
    expect(text).not.toMatch(/^\s*host:/m);
    expect(text).not.toMatch(/^snapshot:/m);
    expect(text).not.toMatch(/connection_string|^\s*url:/m);
  });
});
