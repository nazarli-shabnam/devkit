import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { loadConfig, findUnresolvedVars } from '../../../src/core/config/loader';
import { runValidate } from '../../../src/commands/validate';
import { logger } from '../../../src/utils/logger';

describe('${VAR} references to the config env: block', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  const config = [
    'name: x',
    'env:',
    '  HOST: db.local',
    '  URL: postgres://${HOST}/app',
    'databases:',
    '  - type: redis',
    '    host: ${HOST}',
    '',
  ].join('\n');

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(os.tmpdir(), `devkit-envblock-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), config);
    delete process.env.HOST;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  it('loadConfig resolves references to variables defined in the env block (no warning)', async () => {
    const loaded = await loadConfig(tempDir);
    expect(loaded.env.URL).toBe('postgres://db.local/app');
    expect(loaded.databases[0].host).toBe('db.local');
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('HOST'));
  });

  it('agrees with findUnresolvedVars (nothing unresolved)', async () => {
    const yaml = require('js-yaml');
    expect(findUnresolvedVars(yaml.load(config))).toEqual([]);
  });

  it('validate --strict passes and the resolved value matches', async () => {
    process.chdir(tempDir);
    await expect(runValidate({ strict: true })).resolves.toBeUndefined();
  });

  it('still warns for a variable defined nowhere', async () => {
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x\nenv:\n  URL: http://${NOPE_X}/\n');
    const loaded = await loadConfig(tempDir);
    expect(loaded.env.URL).toBe('http://${NOPE_X}/');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('NOPE_X'));
  });
});
