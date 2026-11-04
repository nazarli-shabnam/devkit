import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateComposeContent, toComposeValue } from '../../../src/core/docker/compose-generator';
import type { DevEnvConfig } from '../../../src/types/config';
import { logger } from '../../../src/utils/logger';

const templatesDir = path.resolve(__dirname, '../../../templates');

/** `resolved` is what the loader returns (secrets filled in); `written` is the file as typed. */
const render = (resolved: Record<string, unknown>, written?: Record<string, unknown>): any =>
  yaml.load(generateComposeContent({ name: 'app', ...resolved } as DevEnvConfig, templatesDir, written));

describe('database credentials written as ${VAR} stay references in the compose file', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  const resolved = { databases: [{ type: 'postgresql', user: 'admin', password: 's3cr3t', database: 'app' }] };
  const written = { databases: [{ type: 'postgresql', user: '${DB_USER}', password: '${DB_PASSWORD}', database: 'app' }] };

  it('emits the reference, never the resolved secret', () => {
    const text = generateComposeContent({ name: 'app', ...resolved } as DevEnvConfig, templatesDir, written);
    expect(text).not.toContain('s3cr3t');
    expect(text).not.toContain('admin');
    const env = (yaml.load(text) as any).services.postgresql_1.environment;
    expect(env).toEqual(expect.arrayContaining(['POSTGRES_USER=${DB_USER}', 'POSTGRES_PASSWORD=${DB_PASSWORD}', 'POSTGRES_DB=app']));
  });

  it('covers every credential variable of each database type', () => {
    const doc = render(
      {
        databases: [
          { type: 'mysql', user: 'u', password: 'p', database: 'd' },
          { type: 'mongodb', user: 'mu', password: 'mp' },
        ],
      },
      {
        databases: [
          { type: 'mysql', user: '${MY_U}', password: '${MY_P}' },
          { type: 'mongodb', user: '${MO_U}', password: '${MO_P}' },
        ],
      }
    );
    expect(doc.services.mysql_1.environment).toEqual(
      expect.arrayContaining(['MYSQL_ROOT_PASSWORD=${MY_P}', 'MYSQL_USER=${MY_U}', 'MYSQL_PASSWORD=${MY_P}', 'MYSQL_DATABASE=d'])
    );
    expect(doc.services.mongodb_2.environment).toEqual(
      expect.arrayContaining(['MONGO_INITDB_ROOT_USERNAME=${MO_U}', 'MONGO_INITDB_ROOT_PASSWORD=${MO_P}'])
    );
  });

  it('keeps ${VAR:-default}; escapes a lone $ in the same value', () => {
    const doc = render(
      { databases: [{ type: 'postgresql', user: 'u', password: 'pw$x' }] },
      { databases: [{ type: 'postgresql', user: 'u', password: 'pw$x-${SUFFIX:-1}' }] }
    );
    expect(doc.services.postgresql_1.environment).toContain('POSTGRES_PASSWORD=pw$$x-${SUFFIX:-1}');
  });

  it('a literal (not referenced) password is still written, escaped, with a warning', () => {
    const doc = render({ databases: [{ type: 'postgresql', user: 'u', password: 'pa$$' }] }, {
      databases: [{ type: 'postgresql', user: 'u', password: 'pa$$' }],
    });
    expect(doc.services.postgresql_1.environment).toContain('POSTGRES_PASSWORD=pa$$$$');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('literal password for: postgresql_1'));
  });

  it('works per database: only the one written with a reference becomes a reference', () => {
    const doc = render(
      { databases: [{ type: 'postgresql', password: 'a' }, { type: 'mysql', password: 'b' }] },
      { databases: [{ type: 'postgresql', password: '${A}' }, { type: 'mysql', password: 'b' }] }
    );
    expect(doc.services.postgresql_1.environment).toContain('POSTGRES_PASSWORD=${A}');
    expect(doc.services.mysql_2.environment).toContain('MYSQL_ROOT_PASSWORD=b');
  });

  it('without the written config every value is the resolved one (previous behaviour)', () => {
    const doc = render(resolved);
    expect(doc.services.postgresql_1.environment).toContain('POSTGRES_PASSWORD=s3cr3t');
  });

  it('a reference that was unset when generating still ends up as the reference', () => {
    // the loader leaves an unset ${DB_PASSWORD} in the resolved config as-is
    const doc = render({ databases: [{ type: 'postgresql', password: '${DB_PASSWORD}' }] }, written);
    expect(doc.services.postgresql_1.environment).toContain('POSTGRES_PASSWORD=${DB_PASSWORD}');
  });
});

describe('toComposeValue', () => {
  it.each([
    ['${A}', '${A}'],
    ['${A:-x}', '${A:-x}'],
    ['$${A}', '$${A}'],
    ['pw$x', 'pw$$x'],
    ['a${B}c$d', 'a${B}c$$d'],
    ['plain', 'plain'],
  ])('%s -> %s', (input, expected) => {
    expect(toComposeValue(input)).toBe(expected);
  });
});
