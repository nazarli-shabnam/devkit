import Handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs';
import type { DevEnvConfig, Database, Service } from '../../types/config';

export interface ComposeService {
  name: string;
  image: string;
  version?: string;
  ports: string[];
  env: Record<string, string>;
}

const DB_IMAGES: Record<string, string> = {
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mongodb: 'mongo',
  redis: 'redis',
  sqlite: '',
};

function databaseToComposeService(db: Database, index: number): ComposeService | null {
  const image = DB_IMAGES[db.type];
  if (!image) return null;

  const name = db.name ?? `${db.type}_${index + 1}`.replace(/-/g, '_');
  const port = db.port ?? (db.type === 'postgresql' ? 5432 : db.type === 'redis' ? 6379 : db.type === 'mysql' || db.type === 'mariadb' ? 3306 : 27017);
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

  return {
    name,
    image,
    version: db.version,
    ports,
    env,
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
  return fs.readFileSync(templatePath, 'utf-8');
}

export function generateComposeContent(config: DevEnvConfig, templatesDir: string): string {
  const services: ComposeService[] = [];

  config.databases?.forEach((db, i) => {
    const s = databaseToComposeService(db, i);
    if (s) services.push(s);
  });

  config.services?.forEach((svc, i) => {
    services.push(serviceToComposeService(svc, i));
  });

  const networkName = config.docker?.network_name ?? 'dev-network';

  const template = loadComposeTemplate(templatesDir);
  const compiled = Handlebars.compile(template);
  return compiled({ services, networkName });
}
