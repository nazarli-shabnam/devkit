import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import { runShareExport } from '../../src/commands/share';
import { logger } from '../../src/utils/logger';

describe('share export keeps ${VAR} references instead of resolved secrets', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(os.tmpdir(), `devkit-share-raw-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(
      path.join(tempDir, '.env'),
      'SHARE_TOKEN=tok-abc123\nSHARE_DB_HOST=prod-db.internal\nSHARE_HC_PW=hcsecret\n'
    );
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    for (const k of ['SHARE_TOKEN', 'SHARE_DB_HOST', 'SHARE_HC_PW']) delete process.env[k];
    jest.restoreAllMocks();
  });

  it('does not write resolved secret values from commands, hosts or health checks', async () => {
    const config = [
      'name: t',
      'dependencies:',
      '  - type: custom',
      '    command: echo hi --token ${SHARE_TOKEN}',
      'databases:',
      '  - type: postgresql',
      '    host: ${SHARE_DB_HOST}',
      '    migrations:',
      '      - path: .',
      '        command: migrate --token ${SHARE_TOKEN}',
      '    seed:',
      '      command: seed --token ${SHARE_TOKEN}',
      'health_checks:',
      '  - name: pg',
      '    type: postgresql',
      '    test: PGPASSWORD=${SHARE_HC_PW} pg_isready',
      '',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), config);

    await runShareExport({ output: 'out.yml' });
    const text = await fs.readFile(path.join(tempDir, 'out.yml'), 'utf-8');

    for (const secret of ['tok-abc123', 'prod-db.internal', 'hcsecret']) {
      expect(text).not.toContain(secret);
    }
    const out = yaml.load(text) as any;
    expect(out.dependencies[0].command).toBe('echo hi --token ${SHARE_TOKEN}');
    expect(out.databases[0].host).toBe('${SHARE_DB_HOST}');
    expect(out.databases[0].migrations[0].command).toBe('migrate --token ${SHARE_TOKEN}');
    expect(out.databases[0].seed.command).toBe('seed --token ${SHARE_TOKEN}');
    expect(out.health_checks[0].test).toBe('PGPASSWORD=${SHARE_HC_PW} pg_isready');
  });

  it('still masks db user/password and env values', async () => {
    const config = [
      'name: t',
      'databases:',
      '  - type: postgresql',
      '    user: realuser',
      '    password: realpass',
      'env:',
      '  API_KEY: realkey',
      '',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), config);

    await runShareExport({ output: 'out.yml' });
    const text = await fs.readFile(path.join(tempDir, 'out.yml'), 'utf-8');
    expect(text).not.toMatch(/realuser|realpass|realkey/);
    expect(text).toContain('${DB_USER}');
    expect(text).toContain('${DB_PASSWORD}');
    expect(text).toContain('API_KEY: ${API_KEY}');
  });
});
