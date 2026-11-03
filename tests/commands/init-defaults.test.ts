import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import prompts from 'prompts';
import {
  runInit,
  databasePrompts,
  servicePrompts,
  DATABASE_DEFAULTS,
  SERVICE_DEFAULTS,
  referencedVariables,
} from '../../src/commands/init';
import { generateComposeContent } from '../../src/core/docker/compose-generator';
import { DevEnvConfigSchema } from '../../src/types/config';
import { logger } from '../../src/utils/logger';

const names = (list: prompts.PromptObject[]): string[] => list.map((p) => String(p.name));
const initialOf = (list: prompts.PromptObject[], name: string): unknown => list.find((p) => p.name === name)?.initial;

describe('databasePrompts: per-type questions and defaults', () => {
  it('only offers versions that exist as images (no "15" for redis/mysql/mongo)', () => {
    expect(initialOf(databasePrompts('postgresql'), 'version')).toBe('16');
    expect(initialOf(databasePrompts('mysql'), 'version')).toBe('8');
    expect(initialOf(databasePrompts('mariadb'), 'version')).toBe('11');
    expect(initialOf(databasePrompts('mongodb'), 'version')).toBe('7');
    expect(initialOf(databasePrompts('redis'), 'version')).toBe('7');
  });

  it('uses the right default port per type', () => {
    expect(initialOf(databasePrompts('postgresql'), 'port')).toBe(5432);
    expect(initialOf(databasePrompts('mysql'), 'port')).toBe(3306);
    expect(initialOf(databasePrompts('mongodb'), 'port')).toBe(27017);
    expect(initialOf(databasePrompts('redis'), 'port')).toBe(6379);
  });

  it('redis has a password but no user or database name', () => {
    expect(names(databasePrompts('redis'))).toEqual(['name', 'version', 'port', 'password']);
  });

  it('sqlite asks for a file, not port/user/password/version', () => {
    const list = databasePrompts('sqlite');
    expect(names(list)).toEqual(['name', 'database']);
    expect(initialOf(list, 'database')).toBe('./dev.sqlite3');
  });

  it('every database type is covered', () => {
    expect(Object.keys(DATABASE_DEFAULTS).sort()).toEqual(['mariadb', 'mongodb', 'mysql', 'postgresql', 'redis', 'sqlite']);
  });
});

describe('servicePrompts: defaults follow the service type', () => {
  it('rabbitmq gets its ports and a management port question', () => {
    const list = servicePrompts(SERVICE_DEFAULTS.rabbitmq);
    expect(initialOf(list, 'port')).toBe(5672);
    expect(initialOf(list, 'management_port')).toBe(15672);
  });

  it('other services do not inherit rabbitmq ports', () => {
    const redis = servicePrompts(SERVICE_DEFAULTS.redis);
    expect(initialOf(redis, 'port')).toBe(6379);
    expect(names(redis)).not.toContain('management_port');
    const unknown = servicePrompts({});
    expect(initialOf(unknown, 'port')).toBeUndefined();
    expect(initialOf(unknown, 'version')).toBeUndefined();
    expect(names(unknown)).toEqual(['version', 'port']);
  });
});

describe('referencedVariables', () => {
  it('lists each ${VAR} once, in order', () => {
    expect(referencedVariables('a: ${B}\nc: x${A}y ${B}')).toEqual(['B', 'A']);
    expect(referencedVariables('no vars')).toEqual([]);
  });
});

describe('wizard end to end', () => {
  let root: string;
  const stdout = process.stdout as NodeJS.WriteStream & { isTTY?: boolean };
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const original = { out: stdout.isTTY, in: stdin.isTTY };
  const common = ['app', '1.0.0', false]; // name, version, addDeps?
  const readConfig = async (): Promise<ReturnType<typeof DevEnvConfigSchema.parse>> =>
    DevEnvConfigSchema.parse(yaml.load(await fs.readFile(path.join(root, '.dev-env.yml'), 'utf-8')));
  const postgres = ['postgresql', 'main', '16', 5432, '${DB_USER}', '${DB_PASSWORD}', 'myapp'];
  const tail = [false, false, false, false, false, false]; // migrations, seed, more dbs, services, env, docker

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-wizdef-'));
    stdout.isTTY = true;
    stdin.isTTY = true;
  });
  afterEach(async () => {
    stdout.isTTY = original.out;
    stdin.isTTY = original.in;
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('pressing Enter through a redis database yields an image that exists (redis:7)', async () => {
    prompts.inject([...common, true, 'redis', 'cache', '7', 6379, '', ...tail]);
    await runInit(root);
    const config = await readConfig();
    expect(config.databases[0]).toMatchObject({ type: 'redis', version: '7', port: 6379 });
    expect(config.databases[0].user).toBeUndefined();
    const compose = generateComposeContent(config, path.resolve(__dirname, '../../templates'));
    expect(compose).toContain('image: redis:7');
    expect(await fs.pathExists(path.join(root, '.env.example'))).toBe(false); // no ${VAR} used
  });

  it('sqlite stores a file path and no port/user/password', async () => {
    prompts.inject([...common, true, 'sqlite', 'local', './data/app.db', ...tail]);
    await runInit(root);
    const db = (await readConfig()).databases[0];
    expect(db).toMatchObject({ type: 'sqlite', database: './data/app.db' });
    expect(db.port).toBeUndefined();
    expect(db.user).toBeUndefined();
    expect(db.password).toBeUndefined();
  });

  it('a redis service does not get rabbitmq ports', async () => {
    prompts.inject([...common, false, true, 'redis', '7', 6379, false, false, false]);
    await runInit(root);
    const service = (await readConfig()).services[0];
    expect(service).toMatchObject({ type: 'redis', version: '7', port: 6379 });
    expect(service.management_port).toBeUndefined();
  });

  it('offers a .env.example listing the variables the config uses', async () => {
    prompts.inject([...common, true, ...postgres, ...tail, true]);
    await runInit(root);
    const example = await fs.readFile(path.join(root, '.env.example'), 'utf-8');
    expect(example.split('\n').filter(Boolean)).toEqual(['DB_USER=', 'DB_PASSWORD=']);
  });

  it('declining writes nothing; an existing .env.example is never touched', async () => {
    prompts.inject([...common, true, ...postgres, ...tail, false]);
    await runInit(root);
    expect(await fs.pathExists(path.join(root, '.env.example'))).toBe(false);

    await fs.remove(path.join(root, '.dev-env.yml'));
    await fs.writeFile(path.join(root, '.env.example'), 'KEEP=me\n');
    prompts.inject([...common, true, ...postgres, ...tail]);
    await runInit(root);
    expect(await fs.readFile(path.join(root, '.env.example'), 'utf-8')).toBe('KEEP=me\n');
  });
});
