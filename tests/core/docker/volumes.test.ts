import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateComposeContent } from '../../../src/core/docker/compose-generator';
import type { DevEnvConfig } from '../../../src/types/config';

const templatesDir = path.resolve(__dirname, '../../../templates');
const render = (config: Record<string, unknown>): any =>
  yaml.load(generateComposeContent({ name: 'app', ...config } as DevEnvConfig, templatesDir));

describe('database data volumes', () => {
  const databases = [
    { type: 'postgresql', host: 'localhost' },
    { type: 'mysql', host: 'localhost' },
    { type: 'mariadb', host: 'localhost' },
    { type: 'mongodb', host: 'localhost' },
    { type: 'redis', host: 'localhost' },
  ];

  it('mounts a named data volume on the right directory for each database type', () => {
    const doc = render({ databases });
    expect(doc.services.postgresql_1.volumes).toEqual(['postgresql_1_data:/var/lib/postgresql/data']);
    expect(doc.services.mysql_2.volumes).toEqual(['mysql_2_data:/var/lib/mysql']);
    expect(doc.services.mariadb_3.volumes).toEqual(['mariadb_3_data:/var/lib/mysql']);
    expect(doc.services.mongodb_4.volumes).toEqual(['mongodb_4_data:/data/db']);
    expect(doc.services.redis_5.volumes).toEqual(['redis_5_data:/data']);
  });

  it('pins PGDATA to the mounted path for postgres (postgres 18+ default moved) and only then', () => {
    const on = render({ databases: [{ type: 'postgresql', host: 'localhost' }] });
    expect(on.services.postgresql_1.environment).toContain('PGDATA=/var/lib/postgresql/data');
    const off = render({ databases: [{ type: 'postgresql', host: 'localhost' }], docker: { persist_data: false } });
    expect(off.services.postgresql_1.environment).toBeUndefined();
  });

  it('declares every named volume at the top level', () => {
    const doc = render({ databases });
    expect(Object.keys(doc.volumes).sort()).toEqual(
      ['mariadb_3_data', 'mongodb_4_data', 'mysql_2_data', 'postgresql_1_data', 'redis_5_data'].sort()
    );
  });

  it('uses the (de-duplicated) service name for the volume name', () => {
    const doc = render({
      databases: [
        { type: 'postgresql', name: 'db', host: 'localhost' },
        { type: 'postgresql', name: 'db', host: 'localhost', port: 5433 },
      ],
    });
    expect(Object.keys(doc.volumes)).toEqual(['db_data', 'db_2_data']);
  });

  it('adds no volumes for generic services', () => {
    const doc = render({ services: [{ type: 'rabbitmq', port: 5672, host: 'localhost' }] });
    expect(doc.services.rabbitmq_1.volumes).toBeUndefined();
    expect(doc.volumes).toBeUndefined();
  });

  it('can be disabled with docker.persist_data: false', () => {
    const doc = render({ databases, docker: { persist_data: false } });
    expect(doc.services.postgresql_1.volumes).toBeUndefined();
    expect(doc.volumes).toBeUndefined();
  });

  it('defaults persist_data to true in the schema', () => {
    const { DockerConfigSchema } = require('../../../src/types/config');
    expect(DockerConfigSchema.parse({}).persist_data).toBe(true);
  });
});
