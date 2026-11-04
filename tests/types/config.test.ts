import {
  DependencySchema,
  DatabaseSchema,
  ServiceSchema,
  HealthCheckSchema,
  SnapshotConfigSchema,
  DockerConfigSchema,
  DevEnvConfigSchema,
} from '../../src/types/config';

describe('config schemas', () => {
  describe('DependencySchema', () => {
    it('accepts valid dependency', () => {
      const dep = { type: 'npm', command: 'npm install', path: '.' };
      expect(DependencySchema.parse(dep)).toEqual(dep);
    });

    it('defaults path to .', () => {
      expect(DependencySchema.parse({ type: 'pip', command: 'pip install' })).toMatchObject({
        type: 'pip',
        command: 'pip install',
        path: '.',
      });
    });

    it('rejects invalid type', () => {
      expect(() =>
        DependencySchema.parse({ type: 'invalid', command: 'x' })
      ).toThrow();
    });
  });

  describe('DatabaseSchema', () => {
    it('accepts valid database config', () => {
      const db = {
        type: 'postgresql',
        name: 'mydb',
        port: 5432,
        user: 'u',
        password: 'p',
        database: 'db',
      };
      expect(DatabaseSchema.parse(db)).toMatchObject(db);
    });

    it('accepts host but does not invent one (it is not used by envkit)', () => {
      expect(DatabaseSchema.parse({ type: 'redis', port: 6379 }).host).toBeUndefined();
      expect(DatabaseSchema.parse({ type: 'redis', host: 'db.local' }).host).toBe('db.local');
    });
  });

  describe('ServiceSchema', () => {
    it('accepts service with optional fields', () => {
      const svc = { type: 'rabbitmq', port: 5672, management_port: 15672 };
      expect(ServiceSchema.parse(svc)).toMatchObject(svc);
    });

    it('requires type', () => {
      expect(() => ServiceSchema.parse({ port: 5672 })).toThrow();
    });
  });

  describe('HealthCheckSchema', () => {
    it('accepts connection_string or url', () => {
      expect(
        HealthCheckSchema.parse({ name: 'db', type: 'postgresql', connection_string: 'postgres://...' })
      ).toHaveProperty('connection_string', 'postgres://...');
      expect(
        HealthCheckSchema.parse({ name: 'r', type: 'redis', url: 'redis://localhost' })
      ).toHaveProperty('url', 'redis://localhost');
    });

    it('rejects missing name or type', () => {
      expect(() => HealthCheckSchema.parse({ type: 'postgresql' })).toThrow();
      expect(() => HealthCheckSchema.parse({ name: 'db' })).toThrow();
    });
  });

  describe('SnapshotConfigSchema', () => {
    it('defaults include_databases and include_volumes to true', () => {
      const parsed = SnapshotConfigSchema.parse({});
      expect(parsed.include_databases).toBe(true);
      expect(parsed.include_volumes).toBe(true);
    });

    it('defaults exclude_paths', () => {
      const parsed = SnapshotConfigSchema.parse({});
      expect(parsed.exclude_paths).toContain('node_modules');
      expect(parsed.exclude_paths).toContain('.git');
    });
  });

  describe('DockerConfigSchema', () => {
    it('defaults enabled, output_file, network_name', () => {
      const parsed = DockerConfigSchema.parse({});
      expect(parsed.enabled).toBe(true);
      expect(parsed.output_file).toBe('docker-compose.yml');
      expect(parsed.network_name).toBe('dev-network');
    });
  });

  describe('DevEnvConfigSchema', () => {
    it('accepts minimal valid config', () => {
      const config = { name: 'my-project' };
      const parsed = DevEnvConfigSchema.parse(config);
      expect(parsed.name).toBe('my-project');
      expect(parsed.dependencies).toEqual([]);
      expect(parsed.databases).toEqual([]);
      expect(parsed.services).toEqual([]);
      expect(parsed.env).toEqual({});
      expect(parsed.health_checks).toEqual([]);
    });

    it('accepts full config with all sections', () => {
      const config = {
        name: 'app',
        version: '1.0.0',
        dependencies: [{ type: 'npm', command: 'npm install', path: '.' }],
        databases: [{ type: 'postgresql', port: 5432, database: 'app' }],
        services: [{ type: 'redis', port: 6379 }],
        env: { NODE_ENV: 'development' },
        health_checks: [{ name: 'db', type: 'postgresql', connection_string: 'postgres://localhost' }],
        snapshot: { include_databases: true, exclude_paths: ['.git'] },
        docker: { enabled: true },
      };
      const parsed = DevEnvConfigSchema.parse(config);
      expect(parsed.name).toBe('app');
      expect(parsed.dependencies).toHaveLength(1);
      expect(parsed.databases).toHaveLength(1);
      expect(parsed.services).toHaveLength(1);
      expect(parsed.health_checks).toHaveLength(1);
    });

    it('rejects config without name', () => {
      expect(() => DevEnvConfigSchema.parse({})).toThrow();
      expect(() => DevEnvConfigSchema.parse({ version: '1.0.0' })).toThrow();
    });
  });

describe('numeric and version coercion', () => {
  it('accepts numeric strings for ports and retries (e.g. resolved ${VAR})', () => {
    const db = DatabaseSchema.parse({ type: 'postgresql', port: '5433' });
    expect(db.port).toBe(5433);
    const svc = ServiceSchema.parse({ type: 'rabbitmq', port: '5672', management_port: ' 15672 ' });
    expect(svc.port).toBe(5672);
    expect(svc.management_port).toBe(15672);
    expect(HealthCheckSchema.parse({ name: 'x', type: 'redis', retries: '3' }).retries).toBe(3);
  });

  it('still rejects non-numeric, fractional, empty and out-of-range ports', () => {
    for (const port of ['abc', '', '12.5', 12.5, -1, '70000', null]) {
      expect(() => DatabaseSchema.parse({ type: 'redis', port })).toThrow();
    }
  });

  it('does not coerce an unresolved ${VAR} placeholder', () => {
    expect(() => DatabaseSchema.parse({ type: 'redis', port: '${DB_PORT}' })).toThrow();
  });

  it('accepts numeric versions and converts them to strings', () => {
    expect(DatabaseSchema.parse({ type: 'redis', version: 7 }).version).toBe('7');
    expect(ServiceSchema.parse({ type: 'rabbitmq', version: 3.12 }).version).toBe('3.12');
    expect(DevEnvConfigSchema.parse({ name: 'x', version: 1 }).version).toBe('1');
  });

  it('leaves ports and versions optional', () => {
    const db = DatabaseSchema.parse({ type: 'redis' });
    expect(db.port).toBeUndefined();
    expect(db.version).toBeUndefined();
  });
});
});
