import * as path from 'path';
import * as yaml from 'js-yaml';
import prompts from 'prompts';
import { fileExists, readJson, writeFile } from '../utils/file-ops';
import { logger } from '../utils/logger';
import { exitOnCancel, isInteractive as terminalAvailable } from '../utils/prompt';
import {
  DevEnvConfig,
  DevEnvConfigSchema,
  type Dependency,
  type Database,
  type Service,
} from '../types/config';

const DEPENDENCY_TYPES = ['npm', 'yarn', 'pnpm', 'pip', 'pipenv', 'poetry', 'cargo', 'go', 'custom'] as const;
const DATABASE_TYPES = ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'sqlite'] as const;

const DEFAULT_DEPENDENCY_COMMANDS: Record<string, string> = {
  npm: 'npm install',
  yarn: 'yarn install',
  pnpm: 'pnpm install',
  pip: 'pip install -r requirements.txt',
  pipenv: 'pipenv install',
  poetry: 'poetry install',
  cargo: 'cargo build',
  go: 'go mod download',
  custom: '',
};

export function isInteractive(): boolean {
  return terminalAvailable();
}

export async function getDefaultProjectName(projectRoot: string): Promise<string> {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = await readJson<{ name?: string }>(pkgPath);
      if (pkg?.name && typeof pkg.name === 'string') {
        return pkg.name.trim() || path.basename(projectRoot);
      }
    } catch {
      // ignore
    }
  }
  return path.basename(projectRoot) || 'my-project';
}

async function runWizard(projectRoot: string): Promise<DevEnvConfig> {
  const defaultName = await getDefaultProjectName(projectRoot);

  const basic = await prompts(
    [
      {
        type: 'text',
        name: 'name',
        message: 'Config name (used in messages like "Setup complete for …")',
        initial: defaultName,
        validate: (v) => (v?.trim() ? true : 'Name is required'),
      },
      {
        type: 'text',
        name: 'version',
        message: 'Version (optional)',
        initial: '1.0.0',
      },
    ],
    { onCancel: exitOnCancel }
  );

  const addDeps = await prompts(
    {
      type: 'confirm',
      name: 'value',
      message: 'Add dependencies? (optional)',
      initial: true,
    },
    { onCancel: exitOnCancel }
  );

  const dependencies: Dependency[] = [];
  if (addDeps.value) {
    const depTypes = await prompts(
      {
        type: 'multiselect',
        name: 'types',
        message: 'Choose dependency type(s)',
        choices: DEPENDENCY_TYPES.map((t) => ({ title: t, value: t })),
        min: 1,
      },
      { onCancel: exitOnCancel }
    );
    for (const type of depTypes.types as string[]) {
      const cmd = await prompts(
        [
          {
            type: 'text',
            name: 'path',
            message: `Path for ${type}`,
            initial: '.',
          },
          {
            type: 'text',
            name: 'command',
            message: `Command for ${type}`,
            initial: DEFAULT_DEPENDENCY_COMMANDS[type] ?? '',
          },
        ],
        { onCancel: exitOnCancel }
      );
      if (cmd.command?.trim()) {
        dependencies.push({ type: type as Dependency['type'], command: cmd.command.trim(), path: cmd.path?.trim() || '.' });
      }
    }
  }

  const databases: Database[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const addDb = await prompts(
      {
        type: 'confirm',
        name: 'value',
        message: databases.length === 0 ? 'Add a database? (optional)' : 'Add another database?',
        initial: databases.length === 0 ? false : false,
      },
      { onCancel: exitOnCancel }
    );
    if (!addDb.value) break;

    const dbChoice = await prompts(
      {
        type: 'select',
        name: 'type',
        message: 'Database type',
        choices: [...DATABASE_TYPES.map((t) => ({ title: t, value: t })), { title: 'None', value: 'none' }],
      },
      { onCancel: exitOnCancel }
    );
    if (dbChoice.type === 'none') break;

    const DB_DEFAULT_PORTS: Record<string, number> = {
      postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017, redis: 6379, sqlite: 0,
    };
    const dbPrompts: prompts.PromptObject[] = [
      { type: 'text', name: 'name', message: 'Database name (optional)', initial: 'db' },
      { type: 'text', name: 'version', message: 'Version (e.g. 15 for Postgres)', initial: '15' },
      { type: 'number', name: 'port', message: 'Port', initial: DB_DEFAULT_PORTS[dbChoice.type] ?? 5432 },
      { type: 'text', name: 'user', message: 'User (use ${DB_USER} for .env)', initial: '${DB_USER}' },
      { type: 'text', name: 'password', message: 'Password (use ${DB_PASSWORD} for .env)', initial: '${DB_PASSWORD}' },
    ];
    if (dbChoice.type !== 'redis' && dbChoice.type !== 'sqlite') {
      dbPrompts.push({ type: 'text', name: 'database', message: 'Database name', initial: 'myapp' });
    }
    const dbAnswers = await prompts(dbPrompts, { onCancel: exitOnCancel });
    const db: Database = {
      type: dbChoice.type as Database['type'],
      name: dbAnswers.name || undefined,
      version: dbAnswers.version || undefined,
      port: dbAnswers.port,
      user: dbAnswers.user || undefined,
      password: dbAnswers.password || undefined,
      database: dbAnswers.database || undefined,
    };
    const addMigrations = await prompts(
      { type: 'confirm', name: 'value', message: 'Add migrations?', initial: false },
      { onCancel: exitOnCancel }
    );
    if (addMigrations.value) {
      const mig = await prompts(
        [
          { type: 'text', name: 'path', message: 'Migrations path', initial: './migrations' },
          { type: 'text', name: 'command', message: 'Migrations command', initial: 'npm run migrate' },
        ],
        { onCancel: exitOnCancel }
      );
      db.migrations = [{ path: mig.path || './migrations', command: mig.command || 'npm run migrate' }];
    }
    const addSeed = await prompts(
      { type: 'confirm', name: 'value', message: 'Add seed command?', initial: false },
      { onCancel: exitOnCancel }
    );
    if (addSeed.value) {
      const seedCmd = await prompts(
        [
          { type: 'text', name: 'command', message: 'Seed command', initial: 'npm run seed' },
          { type: 'text', name: 'path', message: 'Seed path', initial: '.' },
        ],
        { onCancel: exitOnCancel }
      );
      db.seed = { command: seedCmd.command || 'npm run seed', path: seedCmd.path?.trim() || '.' };
    }
    databases.push(db);
  }

  const services: Service[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const addService = await prompts(
      {
        type: 'confirm',
        name: 'value',
        message: services.length === 0 ? 'Add a service (e.g. RabbitMQ, Redis)? (optional)' : 'Add another service?',
        initial: false,
      },
      { onCancel: exitOnCancel }
    );
    if (!addService.value) break;

    const svc = await prompts(
      [
        { type: 'text', name: 'type', message: 'Service type', initial: 'rabbitmq' },
        { type: 'text', name: 'version', message: 'Version', initial: '3.12' },
        { type: 'number', name: 'port', message: 'Port', initial: 5672 },
        { type: 'number', name: 'management_port', message: 'Management port (optional, 0 to skip)', initial: 15672 },
      ],
      { onCancel: exitOnCancel }
    );
    if (svc.type?.trim()) {
      services.push({
        type: svc.type.trim(),
        version: svc.version || undefined,
        port: svc.port,
        ...(svc.management_port && svc.management_port > 0 ? { management_port: svc.management_port } : {}),
      });
    }
  }

  const addEnv = await prompts(
    { type: 'confirm', name: 'value', message: 'Add environment variables? (optional)', initial: true },
    { onCancel: exitOnCancel }
  );

  let env: Record<string, string> = {};
  if (addEnv.value) {
    env = { NODE_ENV: 'development' };
    if (databases.length > 0 && databases[0].type === 'postgresql') {
      const db = databases[0];
      env.DATABASE_URL = `postgresql://\${DB_USER}:\${DB_PASSWORD}@localhost:${db.port || 5432}/${db.database || 'myapp'}`;
    }
  }

  const dockerEnabled = await prompts(
    { type: 'confirm', name: 'value', message: 'Enable Docker Compose generation? (optional)', initial: true },
    { onCancel: exitOnCancel }
  );

  const docker = dockerEnabled.value
    ? { enabled: true, output_file: 'docker-compose.yml', network_name: 'dev-network' }
    : { enabled: false, output_file: 'docker-compose.yml', network_name: 'dev-network' };

  const raw: DevEnvConfig = {
    name: basic.name?.trim() || defaultName,
    version: basic.version?.trim() || '1.0.0',
    dependencies,
    databases,
    services,
    env,
    health_checks: [],
    docker,
  };

  const parsed = DevEnvConfigSchema.parse(raw);
  return parsed;
}

/**
 * Run the init wizard and write `.dev-env.yml` in the project root.
 * Exported for use by the CLI and by loadConfigOrPromptInit.
 */
export async function runInit(projectRoot: string): Promise<void> {
  if (!isInteractive()) {
    logger.error('No config found. Run `envkit init` in a terminal to create one.');
    throw new Error('Not in an interactive terminal. Run `envkit init` in a terminal to create a config file.');
  }

  const configPath = path.join(projectRoot, '.dev-env.yml');
  if (await fileExists(configPath)) {
    const overwrite = await prompts(
      { type: 'confirm', name: 'value', message: 'File .dev-env.yml already exists. Overwrite?', initial: false },
      { onCancel: exitOnCancel }
    );
    if (!overwrite.value) {
      logger.info('Skipped. Existing .dev-env.yml was not changed.');
      return;
    }
  }

  const config = await runWizard(projectRoot);
  const yamlContent = yaml.dump(config, { lineWidth: -1 });
  await writeFile(configPath, yamlContent);
  logger.success(`Created ${configPath}`);
}
