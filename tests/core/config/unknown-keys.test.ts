import { findUnknownKeys, formatUnknownKey } from '../../../src/core/config/unknown-keys';

describe('findUnknownKeys', () => {
  it('returns nothing for a fully known config', () => {
    const raw = {
      name: 'x',
      version: '1',
      dependencies: [{ type: 'npm', command: 'npm i', path: '.' }],
      databases: [{ type: 'postgresql', port: 1, migrations: [{ path: '.', command: 'x' }], seed: { command: 'y' } }],
      services: [{ type: 'redis', management_port: 2 }],
      env: { ANYTHING: 'goes', not_checked: '1' },
      health_checks: [{ name: 'a', type: 'b', retries: 3 }],
      snapshot: { include_databases: true },
      docker: { enabled: true, network_name: 'n' },
    };
    expect(findUnknownKeys(raw)).toEqual([]);
  });

  it('flags a misspelled top-level key with a suggestion', () => {
    const [u] = findUnknownKeys({ name: 'x', dependancies: [] });
    expect(u).toMatchObject({ path: '', key: 'dependancies', suggestion: 'dependencies' });
    expect(formatUnknownKey(u)).toBe('Unknown config key "dependancies" is ignored. Did you mean "dependencies"?');
  });

  it('reports nested keys with their path, including array items', () => {
    const found = findUnknownKeys({
      name: 'x',
      databases: [{ type: 'redis' }, { type: 'postgresql', pasword: 'x', seed: { comand: 'y', command: 'z' } }],
      docker: { enabeld: true },
    });
    expect(found.map((u) => `${u.path}:${u.key}:${u.suggestion}`)).toEqual([
      'databases[1]:pasword:password',
      'databases[1].seed:comand:command',
      'docker:enabeld:enabled',
    ]);
  });

  it('gives no suggestion when nothing is close', () => {
    const [u] = findUnknownKeys({ name: 'x', zzzzzzzz: 1 });
    expect(u.suggestion).toBeUndefined();
    expect(formatUnknownKey(u)).toBe('Unknown config key "zzzzzzzz" is ignored.');
  });

  it('does not inspect free-form env keys and ignores non-object input', () => {
    expect(findUnknownKeys({ name: 'x', env: { whatever_KEY: 'v' } })).toEqual([]);
    expect(findUnknownKeys(undefined)).toEqual([]);
    expect(findUnknownKeys('string')).toEqual([]);
    expect(findUnknownKeys({ name: 'x', databases: 'not-an-array' })).toEqual([]);
  });
});
