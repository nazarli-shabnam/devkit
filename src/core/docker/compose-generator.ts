import Handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs';
import type { DevEnvConfig, Database, Service, HealthCheck } from '../../types/config';

export interface ComposeService {
  name: string;
  image: string;
  version?: string;
  ports: string[];
  env: Record<string, string>;
  /** Pre-rendered YAML fragment for healthcheck (indented), or undefined to omit */
  healthcheck?: string;
}

const DB_IMAGES: Record<string, string> = {
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mongodb: 'mongo',
  redis: 'redis',
  sqlite: '',
};

/** Build a healthcheck YAML fragment (indented) from config health_checks or DB type defaults */
function buildHealthcheckForService(
  serviceName: string,
  serviceType: string,
  _port: number,
  healthChecks: HealthCheck[] | undefined
): string | undefined {
  const matched = healthChecks?.find(
    (h) => h.name === serviceName || h.type === serviceType
  );
  if (matched?.connection_string || matched?.url) {
    const test =
      matched.type === 'redis'
        ? ['CMD', 'redis-cli', 'ping']
        : matched.type === 'postgresql'
          ? ['CMD-SHELL', 'pg_isready']
          : matched.type === 'mysql' || matched.type === 'mariadb'
            ? ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
            : matched.type === 'mongodb'
              ? ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"]
              : null;
    if (test) {
      const lines = [`      test: ${JSON.stringify(test)}`, '      interval: 10s', '      timeout: 5s', '      retries: 5'];
      return lines.join('\n');
    }
  }
  const defaults: Record<string, string[]> = {
    postgresql: ['CMD-SHELL', 'pg_isready'],
    mysql: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
    mariadb: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
    mongodb: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"],
    redis: ['CMD', 'redis-cli', 'ping'],
  };
  const test = defaults[serviceType];
  if (!test) return undefined;
  const lines = [`      test: ${JSON.stringify(test)}`, '      interval: 10s', '      timeout: 5s', '      retries: 5'];
  return lines.join('\n');
}

function databaseToComposeService(
  db: Database,
  index: number,
  healthChecks: HealthCheck[] | undefined
): ComposeService | null {
  const image = DB_IMAGES[db.type];
  if (!image) return null;

  const DB_DEFAULT_PORTS: Record<string, number> = {
    postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017, redis: 6379,
  };
  const name = db.name ?? `${db.type}_${index + 1}`.replace(/-/g, '_');
  const port = db.port ?? DB_DEFAULT_PORTS[db.type] ?? 5432;
  const ports = [`${port}:${port}`];

  const env: Record<string, string> = {};
  if (db.type === 'postgresql') {
    if (db.user) env.POSTGRES_USER = db.user;
    if (db.password) env.POSTGRES_PASSWORD = db.password;
    if (db.database) env.POSTGRES_DB = db.database;
  } else if (db.type === 'mysql' || db.type === 'mariadb') {
    if (db.password) env.MYSQL_ROOT_PASSWORD = db.password;
    if (db.database) env.MYSQL_DATABASE = db.database;
    if (db.user) env.MYSQL_USER = db.user;
    if (db.password && db.user) env.MYSQL_PASSWORD = db.password;
  } else if (db.type === 'mongodb') {
    if (db.user) env.MONGO_INITDB_ROOT_USERNAME = db.user;
    if (db.password) env.MONGO_INITDB_ROOT_PASSWORD = db.password;
    if (db.database) env.MONGO_INITDB_DATABASE = db.database;
  }

  const healthcheck = buildHealthcheckForService(name, db.type, port, healthChecks);

  return {
    name,
    image,
    version: db.version,
    ports,
    env,
    healthcheck,
  };
}

function serviceToComposeService(svc: Service, index: number): ComposeService {
  const name = `${svc.type}_${index + 1}`.replace(/-/g, '_');
  const ports: string[] = [];
  if (svc.port) ports.push(`${svc.port}:${svc.port}`);
  if (svc.management_port) ports.push(`${svc.management_port}:${svc.management_port}`);
  return {
    name,
    image: svc.type,
    version: svc.version,
    ports,
    env: {},
  };
}

function loadComposeTemplate(templatesDir: string): string {
  const templatePath = path.join(templatesDir, 'docker-compose.hbs');
  try {
    return fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Docker Compose template not found at ${templatePath}. ${msg}`
    );
  }
}

export function generateComposeContent(config: DevEnvConfig, templatesDir: string): string {
  const services: ComposeService[] = [];
  const usedNames = new Set<string>();

  function deduplicateName(name: string): string {
    let candidate = name;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${name}_${suffix}`;
      suffix++;
    }
    usedNames.add(candidate);
    return candidate;
  }

  const healthChecks = config.health_checks;

  config.databases?.forEach((db, i) => {
    const s = databaseToComposeService(db, i, healthChecks);
    if (s) {
      s.name = deduplicateName(s.name);
      services.push(s);
    }
  });

  config.services?.forEach((svc, i) => {
    const s = serviceToComposeService(svc, i);
    s.name = deduplicateName(s.name);
    services.push(s);
  });

  const networkName = config.docker?.network_name ?? 'dev-network';

  const template = loadComposeTemplate(templatesDir);
  const compiled = Handlebars.compile(template);
  return compiled({ services, networkName });
}
