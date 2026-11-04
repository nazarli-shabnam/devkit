import Handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs';
import type { DevEnvConfig, Database, Service, HealthCheck } from '../../types/config';
import { logger } from '../../utils/logger';

export interface ComposeService {
  name: string;
  image: string;
  version?: string;
  ports: string[];
  env: Record<string, string>;
  /** Pre-rendered YAML-safe `KEY=value` list items (double-quoted, `$` escaped for Compose), set at render time */
  envLines?: string[];
  /**
   * Credentials the user wrote as `${VAR}` references. They are emitted as written so Compose reads
   * the value from `.env`/the environment when the stack starts, instead of the secret being baked
   * into the generated file. Takes precedence over `env` for the same key.
   */
  composeEnv?: Record<string, string>;
  /** `image[:version]`, set at render time */
  imageRef?: string;
  /** Pre-rendered YAML fragment for healthcheck (indented), or undefined to omit */
  healthcheck?: string;
  /** Container data directory to persist in a named volume (databases only) */
  dataDir?: string;
  /** `volume:path` mounts, set at render time */
  volumes?: string[];
}

const DB_IMAGES: Record<string, string> = {
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mongodb: 'mongo',
  redis: 'redis',
  sqlite: '',
};

/** Where each database image keeps its data. */
const DB_DATA_DIRS: Record<string, string> = {
  postgresql: '/var/lib/postgresql/data',
  mysql: '/var/lib/mysql',
  mariadb: '/var/lib/mysql',
  mongodb: '/data/db',
  redis: '/data',
};

const DB_HEALTHCHECK_TESTS: Record<string, string[]> = {
  postgresql: ['CMD-SHELL', 'pg_isready'],
  mysql: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
  mariadb: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
  mongodb: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"],
  redis: ['CMD', 'redis-cli', 'ping'],
};

/**
 * Render one `KEY=value` environment entry as a double-quoted YAML scalar.
 * JSON string syntax is valid YAML, so quotes/colons/`#` in values stay literal;
 * A literal `$` is doubled because Compose would otherwise interpolate it, but a plain `${NAME}`
 * is kept: it is a reference that was left unresolved (the variable was unset when generating),
 * and Compose can still fill it in from its own environment/`.env` when the stack starts.
 */
export function renderEnvEntry(key: string, value: string): string {
  const composeValue = value.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$/g, (token) => (token === '$' ? '$$' : token));
  return JSON.stringify(`${key}=${composeValue}`);
}

/**
 * Turn a credential as written in .dev-env.yml into text Compose understands: `${VAR}`,
 * `${VAR:-default}` and `$${...}` already are Compose syntax and are kept; any other `$` is doubled.
 */
export function toComposeValue(written: string): string {
  return written.replace(/\$\$\{[^}]*\}|\$\{[^}]*\}|\$/g, (token) => (token === '$' ? '$$' : token));
}

/** A `KEY=value` list item whose value is already Compose-ready (no further escaping). */
export function renderComposeEntry(key: string, composeValue: string): string {
  return JSON.stringify(`${key}=${composeValue}`);
}

function renderHealthcheckFragment(test: string[], hc?: HealthCheck): string {
  const interval = hc?.interval ?? '10s';
  const timeout = hc?.timeout ?? '5s';
  const retries = hc?.retries ?? 5;
  return [
    `      test: ${JSON.stringify(test)}`,
    `      interval: ${JSON.stringify(String(interval))}`,
    `      timeout: ${JSON.stringify(String(timeout))}`,
    `      retries: ${retries}`,
  ].join('\n');
}

/**
 * Build a healthcheck YAML fragment (indented) for a service.
 * Resolution order:
 *   1. A matching `health_checks` entry that specifies a raw `test` command (any service, incl. generic ones).
 *   2. A matching entry whose `type` is a known database type.
 *   3. (databases only) Built-in defaults for the known database `serviceType`.
 *
 * `allowTypeDefault` gates step 3: it is true for databases (a postgres container
 * should get pg_isready automatically) but false for generic services, so a
 * service that merely happens to be typed e.g. "redis" does not silently inherit
 * a `redis-cli` healthcheck its image may not support. Generic services only get
 * a healthcheck they explicitly declared via `health_checks`.
 */
function buildHealthcheckForService(
  serviceName: string,
  serviceType: string,
  healthChecks: HealthCheck[] | undefined,
  allowTypeDefault: boolean
): string | undefined {
  const matched = healthChecks?.find(
    (h) => h.name === serviceName || h.type === serviceType
  );

  if (matched?.test) {
    // Compose interpolates `${...}` in the file on the host; `$$` makes the container's own
    // shell see a literal `$` (so `$${POSTGRES_USER}` in the config expands inside the container).
    return renderHealthcheckFragment(['CMD-SHELL', matched.test.replace(/\$/g, '$$$$')], matched);
  }

  if (matched && DB_HEALTHCHECK_TESTS[matched.type]) {
    return renderHealthcheckFragment(DB_HEALTHCHECK_TESTS[matched.type], matched);
  }

  if (!allowTypeDefault) return undefined;

  const test = DB_HEALTHCHECK_TESTS[serviceType];
  if (!test) return undefined;
  return renderHealthcheckFragment(test, matched);
}

/**
 * Compose service names must match `[a-zA-Z0-9][a-zA-Z0-9_.-]*`. Anything else
 * (slashes from namespaced images, spaces, ...) becomes `_`.
 */
export function toServiceName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^[^a-zA-Z0-9]+/, '');
  return cleaned || 'service';
}

function databaseToComposeService(
  db: Database,
  index: number,
  healthChecks: HealthCheck[] | undefined,
  written?: { user?: unknown; password?: unknown }
): ComposeService | null {
  const image = DB_IMAGES[db.type];
  if (!image) return null;

  const DB_DEFAULT_PORTS: Record<string, number> = {
    postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017, redis: 6379,
  };
  const name = toServiceName(db.name ?? `${db.type}_${index + 1}`.replace(/-/g, '_'));
  if (db.name && name !== db.name) {
    logger.warn(`Database name "${db.name}" is not a valid Compose service name; using "${name}".`);
  }
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

  // Where the user wrote ${VAR} for a credential, keep the reference instead of its resolved value.
  const composeEnv: Record<string, string> = {};
  const refFor = (value: unknown): string | undefined =>
    typeof value === 'string' && value.includes('${') ? toComposeValue(value) : undefined;
  const userRef = refFor(written?.user);
  const passwordRef = refFor(written?.password);
  const userKeys = ['POSTGRES_USER', 'MYSQL_USER', 'MONGO_INITDB_ROOT_USERNAME'];
  const passwordKeys = ['POSTGRES_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MONGO_INITDB_ROOT_PASSWORD'];
  for (const key of Object.keys(env)) {
    if (userRef !== undefined && userKeys.includes(key)) composeEnv[key] = userRef;
    if (passwordRef !== undefined && passwordKeys.includes(key)) composeEnv[key] = passwordRef;
  }

  const healthcheck = buildHealthcheckForService(db.name ?? name, db.type, healthChecks, true);

  return {
    name,
    image,
    version: db.version,
    ports,
    env,
    composeEnv,
    healthcheck,
    dataDir: DB_DATA_DIRS[db.type],
  };
}

function serviceToComposeService(
  svc: Service,
  index: number,
  healthChecks: HealthCheck[] | undefined
): ComposeService {
  const name = toServiceName(`${svc.type}_${index + 1}`.replace(/-/g, '_'));
  const ports: string[] = [];
  if (svc.port) ports.push(`${svc.port}:${svc.port}`);
  if (svc.management_port) ports.push(`${svc.management_port}:${svc.management_port}`);
  const healthcheck = buildHealthcheckForService(name, svc.type, healthChecks, false);
  return {
    name,
    image: svc.type,
    version: svc.version,
    ports,
    env: {},
    healthcheck,
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

/**
 * @param writtenConfig the config as written (see `loadRawConfig`). Database credentials written as
 *   `${VAR}` stay references in the output; without it every value is the resolved one.
 */
export function generateComposeContent(config: DevEnvConfig, templatesDir: string, writtenConfig?: unknown): string {
  const writtenDatabases = (writtenConfig as { databases?: unknown } | null | undefined)?.databases;
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

  const skipped: string[] = [];
  config.databases?.forEach((db, i) => {
    const writtenDb = Array.isArray(writtenDatabases) ? (writtenDatabases[i] as { user?: unknown; password?: unknown } | undefined) : undefined;
    const s = databaseToComposeService(db, i, healthChecks, writtenDb);
    if (s) {
      s.name = deduplicateName(s.name);
      services.push(s);
    } else {
      skipped.push(db.name ?? `${db.type}_${i + 1}`);
    }
  });

  if (skipped.length > 0) {
    logger.warn(
      `Skipped ${skipped.length} database(s) with no Docker image (e.g. sqlite): ${skipped.join(', ')}. ` +
      'These run as files, not containers, and are omitted from docker-compose.'
    );
  }

  config.services?.forEach((svc, i) => {
    const s = serviceToComposeService(svc, i, healthChecks);
    s.name = deduplicateName(s.name);
    services.push(s);
  });

  // Named volumes keep database data across `docker compose down`/`up` (opt out: docker.persist_data: false).
  const volumeNames: string[] = [];
  if (config.docker?.persist_data !== false) {
    for (const svc of services) {
      if (!svc.dataDir) continue;
      const volume = `${svc.name}_data`;
      svc.volumes = [`${volume}:${svc.dataDir}`];
      // postgres:18+ moved its default data dir and refuses a mount at the old path unless
      // PGDATA points there, so pin it (valid for every version).
      if (svc.image === 'postgres') svc.env.PGDATA = svc.dataDir;
      volumeNames.push(volume);
    }
  }

  const networkName = config.docker?.network_name ?? 'dev-network';
  const literalPasswords = new Set<string>();

  const template = loadComposeTemplate(templatesDir);
  // noEscape: output is YAML, not HTML; HTML-escaping would corrupt values like `p&ss=w'rd`.
  const compiled = Handlebars.compile(template, { noEscape: true });
  for (const s of services) {
    const composeEnv = s.composeEnv ?? {};
    s.envLines = Object.entries(s.env).map(([k, v]) =>
      k in composeEnv ? renderComposeEntry(k, composeEnv[k]) : renderEnvEntry(k, v)
    );
    for (const [k, v] of Object.entries(s.env)) {
      if (!(k in composeEnv) && /(PASSWORD)/.test(k) && v !== '') literalPasswords.add(s.name);
    }
    s.imageRef = s.version ? `${s.image}:${s.version}` : s.image;
  }
  // `yq` emits any free-form string as a double-quoted YAML scalar (JSON syntax is valid YAML),
  // so values can never break out of their line or inject keys.
  if (literalPasswords.size > 0) {
    logger.warn(
      `The generated compose file contains a literal password for: ${[...literalPasswords].join(', ')}. ` +
        'Write it as ${VAR} in .dev-env.yml (and keep the value in .env) so it is not stored in docker-compose.yml.'
    );
  }
  return compiled({ services, networkName, volumeNames }, { helpers: { yq: (v: unknown) => JSON.stringify(String(v)) } });
}
