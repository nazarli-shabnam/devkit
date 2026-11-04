import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runGenerate } from '../../src/commands/generate';
import { runSetup } from '../../src/commands/setup';
import { runValidate } from '../../src/commands/validate';
import { checkConfigWarnings } from '../../src/core/config/validator';
import type { DevEnvConfig } from '../../src/types/config';
import { logger } from '../../src/utils/logger';

const SECRET_WARNING = /Hardcoded secrets/;

describe('hardcoded-secret warning with ${VAR} + .env', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  let warn: jest.SpyInstance;

  const writeProject = async (config: string): Promise<void> => {
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), config);
    await fs.writeFile(path.join(tempDir, '.env'), 'DB_USER_X=admin\nDB_PASSWORD_X=s3cr3t\nAPI_TOKEN_X=tok\n');
    process.chdir(tempDir);
  };

  const externalized = [
    'name: t',
    'databases:',
    '  - type: postgresql',
    '    user: ${DB_USER_X}',
    '    password: ${DB_PASSWORD_X}',
    'env:',
    '  API_TOKEN: ${API_TOKEN_X}',
    '',
  ].join('\n');

  const hardcoded = externalized.replace('${DB_PASSWORD_X}', 'plain-text');

  beforeEach(async () => {
    warn = jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    tempDir = path.join(os.tmpdir(), `devkit-secrets-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    delete process.env.DB_USER_X;
    delete process.env.DB_PASSWORD_X;
    delete process.env.API_TOKEN_X;
    jest.restoreAllMocks();
  });

  it('generate does not warn when secrets come from .env', async () => {
    await writeProject(externalized);
    await runGenerate({ dryRun: true });
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(SECRET_WARNING));
  });

  it('setup does not warn when secrets come from .env', async () => {
    await writeProject(externalized);
    await runSetup({ dryRun: true });
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(SECRET_WARNING));
  });

  it('generate and setup still warn for a genuinely hardcoded password', async () => {
    await writeProject(hardcoded);
    await runGenerate({ dryRun: true });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(SECRET_WARNING));
    warn.mockClear();
    await runSetup({ dryRun: true });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(SECRET_WARNING));
  });

  it('validate agrees with setup/generate in both cases', async () => {
    await writeProject(externalized);
    await expect(runValidate({ strict: true })).resolves.toBeUndefined();
    await writeProject(hardcoded);
    await expect(runValidate({ strict: true })).rejects.toThrow(/--strict/);
  });

  describe('checkConfigWarnings(config, raw)', () => {
    const resolved = {
      name: 't',
      databases: [{ type: 'postgresql', user: 'admin', password: 's3cr3t', host: 'localhost' }],
      env: { API_TOKEN: 'tok' },
    } as unknown as DevEnvConfig;

    it('treats resolved values as hardcoded when only the resolved config is given', () => {
      expect(checkConfigWarnings(resolved).some((w) => SECRET_WARNING.test(w))).toBe(true);
    });

    it('does not when the raw config shows they were ${VAR} references', () => {
      const raw = {
        name: 't',
        databases: [{ type: 'postgresql', user: '${U}', password: '${P}' }],
        env: { API_TOKEN: '${T}' },
      } as unknown as DevEnvConfig;
      expect(checkConfigWarnings(resolved, raw).some((w) => SECRET_WARNING.test(w))).toBe(false);
    });
  });
});
