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
  host: z.string().optional().default('localhost'),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  migrations: z.array(z.object({
    path: z.string(),
    command: z.string(),
  })).optional(),
  seed: z.object({
    command: z.string(),
  }).optional(),
});

export type Database = z.infer<typeof DatabaseSchema>;

export const ServiceSchema = z.object({
  type: z.string(),
  version: z.string().optional(),
  port: z.number().optional(),
  host: z.string().optional().default('localhost'),
  management_port: z.number().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;

export const HealthCheckSchema = z.object({
  name: z.string(),
  type: z.string(),
  connection_string: z.string().optional(),
  url: z.string().optional(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

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
