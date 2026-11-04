import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runGenerate } from '../../src/commands/generate';
import { logger } from '../../src/utils/logger';

describe('generate keeps secrets out of docker-compose.yml', () => {
  let root: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-gensecret-')));
    await fs.writeFile(path.join(root, '.env'), 'GEN_DB_USER=admin\nGEN_DB_PASSWORD=s3cr3t-value\n');
    await fs.writeFile(
      path.join(root, '.dev-env.yml'),
      [
        'name: t',
        'databases:',
        '  - type: postgresql',
        '    user: ${GEN_DB_USER}',
        '    password: ${GEN_DB_PASSWORD}',
        '    database: app',
        '',
      ].join('\n')
    );
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    delete process.env.GEN_DB_USER;
    delete process.env.GEN_DB_PASSWORD;
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it('writes ${VAR} references, not the values from .env', async () => {
    await runGenerate({});
    const compose = await fs.readFile(path.join(root, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('POSTGRES_PASSWORD=${GEN_DB_PASSWORD}');
    expect(compose).toContain('POSTGRES_USER=${GEN_DB_USER}');
    expect(compose).not.toContain('s3cr3t-value');
  });

  it('tells the user where Compose will read the variables from', async () => {
    await runGenerate({});
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/GEN_DB_USER, GEN_DB_PASSWORD.*\.env/));
  });

  it('--dry-run prints the same reference-only output', async () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runGenerate({ dryRun: true });
    const printed = out.mock.calls.map((c) => String(c[0])).join('');
    expect(printed).toContain('POSTGRES_PASSWORD=${GEN_DB_PASSWORD}');
    expect(printed).not.toContain('s3cr3t-value');
  });
});
