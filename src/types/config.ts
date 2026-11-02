import { z } from 'zod';

export const DependencySchema = z.object({
  type: z.enum(['npm', 'yarn', 'pnpm', 'pip', 'pipenv', 'poetry', 'cargo', 'go', 'custom']),
  command: z.string(),
  path: z.string().optional().default('.'),
});

export type Dependency = z.infer<typeof DependencySchema>;


export const DatabaseSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'sqlite']),
  name: z.string().optional(),
  version: z.string().optional(),
  port: z.number().optional(),
  /** Not used by envkit; accepted so existing configs keep loading. */
  host: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  migrations: z.array(z.object({
    path: z.string(),
    command: z.string(),
  })).optional(),
  seed: z.object({
    command: z.string(),
    path: z.string().optional().default('.'),
  }).optional(),
});

export type Database = z.infer<typeof DatabaseSchema>;

export const ServiceSchema = z.object({
  type: z.string(),
  version: z.string().optional(),
  port: z.number().optional(),
  /** Not used by envkit; accepted so existing configs keep loading. */
  host: z.string().optional(),
  management_port: z.number().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;

export const HealthCheckSchema = z.object({
  name: z.string(),
  type: z.string(),
  /** Not used by envkit; accepted so existing configs keep loading. */
  connection_string: z.string().optional(),
  /** Not used by envkit; accepted so existing configs keep loading. */
  url: z.string().optional(),
  /** Optional raw shell command run as a Docker CMD-SHELL healthcheck test (used for generic services). */
  test: z.string().optional(),
  interval: z.string().optional(),
  timeout: z.string().optional(),
  retries: z.number().optional(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

/** Not used by envkit (snapshots copy .dev-env.yml only); accepted so existing configs keep loading. */
export const SnapshotConfigSchema = z.object({
  include_databases: z.boolean().optional().default(true),
  include_volumes: z.boolean().optional().default(true),
  exclude_paths: z.array(z.string()).optional().default(['node_modules', '.git']),
});

export type SnapshotConfig = z.infer<typeof SnapshotConfigSchema>;

export const DockerConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  output_file: z.string().optional().default('docker-compose.yml'),
  network_name: z.string().optional().default('dev-network'),
});

export type DockerConfig = z.infer<typeof DockerConfigSchema>;

export const DevEnvConfigSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  dependencies: z.array(DependencySchema).optional().default([]),
  databases: z.array(DatabaseSchema).optional().default([]),
  services: z.array(ServiceSchema).optional().default([]),
  env: z.record(z.string()).optional().default({}),
  health_checks: z.array(HealthCheckSchema).optional().default([]),
  snapshot: SnapshotConfigSchema.optional(),
  docker: DockerConfigSchema.optional(),
});

export type DevEnvConfig = z.infer<typeof DevEnvConfigSchema>;
