import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateComposeContent } from '../../../src/core/docker/compose-generator';
import { resolveEnvVars } from '../../../src/core/config/loader';
import type { DevEnvConfig } from '../../../src/types/config';

const templatesDir = path.resolve(__dirname, '../../../templates');

describe('healthcheck test with a literal ${VAR} meant for the container shell', () => {
  it('survives config resolution and is escaped for Compose', () => {
    // Config text: pg_isready -U $${POSTGRES_USER}  ->  literal ${POSTGRES_USER} after resolution
    const resolvedTest = resolveEnvVars('pg_isready -U $${POSTGRES_USER}');
    expect(resolvedTest).toBe('pg_isready -U ${POSTGRES_USER}');

    const content = generateComposeContent(
      {
        name: 'app',
        services: [{ type: 'postgres', host: 'localhost' }],
        health_checks: [{ name: 'postgres_1', type: 'postgres', test: resolvedTest }],
      } as unknown as DevEnvConfig,
      templatesDir
    );
    const doc = yaml.load(content) as any;
    // `$$` is how Compose spells a literal `$`: the container shell, not the host, expands it.
    expect(doc.services.postgres_1.healthcheck.test).toEqual(['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER}']);
  });

  it('leaves tests without $ untouched', () => {
    const content = generateComposeContent(
      {
        name: 'app',
        services: [{ type: 'rabbitmq', host: 'localhost' }],
        health_checks: [{ name: 'rabbitmq_1', type: 'rabbitmq', test: 'rabbitmq-diagnostics -q ping' }],
      } as unknown as DevEnvConfig,
      templatesDir
    );
    expect((yaml.load(content) as any).services.rabbitmq_1.healthcheck.test).toEqual([
      'CMD-SHELL',
      'rabbitmq-diagnostics -q ping',
    ]);
  });
});
