import * as path from 'path';
import * as fs from 'fs-extra';
import { runValidate } from '../../src/commands/validate';
import { logger } from '../../src/utils/logger';

describe('validate command', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(require('os').tmpdir(), `devkit-validate-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  it('throws when .dev-env.yml is not found', async () => {
    process.chdir(tempDir);
    await expect(runValidate()).rejects.toThrow(/Configuration file not found|\.dev-env\.yml/);
  });

  it('succeeds on a valid config', async () => {
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: ok\nversion: "1.0.0"\ndatabases: []');
    process.chdir(tempDir);

    await expect(runValidate()).resolves.toBeUndefined();
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('is valid'));
  });

  it('throws on an invalid config (missing required name)', async () => {
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'version: "1.0.0"');
    process.chdir(tempDir);

    await expect(runValidate()).rejects.toThrow(/Invalid configuration|name/);
  });

  it('warns on unresolved ${VAR} references but succeeds without --strict', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: app\nenv:\n  TOKEN: ${MISSING_TOKEN}'
    );
    process.chdir(tempDir);

    await expect(runValidate()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MISSING_TOKEN'));
  });

  it('fails with --strict when there are unresolved variables', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: app\nenv:\n  TOKEN: ${MISSING_TOKEN}'
    );
    process.chdir(tempDir);

    await expect(runValidate({ strict: true })).rejects.toThrow(/--strict|unresolved/);
  });

  it('does not flag a correctly-externalized secret as hardcoded under --strict', async () => {
    // Regression: checkConfigWarnings must run on the raw config so that a
    // ${DB_PASSWORD} resolved from .env is not mistaken for a hardcoded secret.
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      [
        'name: app',
        'databases:',
        '  - type: postgresql',
        '    port: 5432',
        '    user: ${DB_USER}',
        '    password: ${DB_PASSWORD}',
        '    database: app',
      ].join('\n')
    );
    await fs.writeFile(path.join(tempDir, '.env'), 'DB_USER=u\nDB_PASSWORD=secret123\n');
    process.chdir(tempDir);

    await expect(runValidate({ strict: true })).resolves.toBeUndefined();
  });

  it('resolves a variable defined in the config env block', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: app\nenv:\n  BASE: hello\n  DERIVED: ${BASE}-world'
    );
    process.chdir(tempDir);

    await expect(runValidate({ strict: true })).resolves.toBeUndefined();
  });
});
