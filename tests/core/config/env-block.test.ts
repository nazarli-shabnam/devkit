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

  it('validate --strict passes for the same config', async () => {
    process.chdir(tempDir);
    await expect(runValidate({ strict: true })).resolves.toBeUndefined();
  });

  it('still warns for a variable defined nowhere', async () => {
    await fs.writeFile(path.join(tempDir, '.dev-env.yml'), 'name: x\nenv:\n  URL: http://${NOPE_X}/\n');
    const loaded = await loadConfig(tempDir);
    expect(loaded.env.URL).toBe('http://${NOPE_X}/');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('NOPE_X'));
  });

  describe('pass-through entries that name themselves', () => {
    afterEach(() => {
      delete process.env.ENVBLK_TOKEN;
      delete process.env.ENVBLK_PATH;
    });

    it('still reads ${X} from the ambient environment when the block says X: ${X}', async () => {
      process.env.ENVBLK_TOKEN = 'from-dotenv';
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), ['name: x', 'env:', '  ENVBLK_TOKEN: ${ENVBLK_TOKEN}', ''].join('\n'));
      const loaded = await loadConfig(tempDir);
      expect(loaded.env.ENVBLK_TOKEN).toBe('from-dotenv');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('appends to the ambient value instead of repeating the suffix', async () => {
      process.env.ENVBLK_PATH = '/usr/bin';
      await fs.writeFile(path.join(tempDir, '.dev-env.yml'), ['name: x', 'env:', '  ENVBLK_PATH: ${ENVBLK_PATH}:/extra', ''].join('\n'));
      const loaded = await loadConfig(tempDir);
      expect(loaded.env.ENVBLK_PATH).toBe('/usr/bin:/extra');
    });
  });
});
