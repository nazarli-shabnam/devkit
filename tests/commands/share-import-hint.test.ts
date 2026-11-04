import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { runShareImport } from '../../src/commands/share';
import { logger } from '../../src/utils/logger';

describe('share import lists the variables the config expects', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(os.tmpdir(), `devkit-share-hint-${Date.now()}-${Math.floor(performance.now())}`);
    await fs.ensureDir(tempDir);
    process.chdir(tempDir);
    delete process.env.HINT_DB_USER_X;
    delete process.env.HINT_DB_PASSWORD_X;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    delete process.env.HINT_DB_PASSWORD_X;
    jest.restoreAllMocks();
  });

  const shared = ['name: t', 'databases:', '  - type: redis', '    user: ${HINT_DB_USER_X}', '    password: ${HINT_DB_PASSWORD_X}', ''].join('\n');

  it('names every variable that is not set', async () => {
    await fs.writeFile(path.join(tempDir, 'shared.yml'), shared);
    await runShareImport('shared.yml', { output: 'imported.yml' });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('HINT_DB_USER_X, HINT_DB_PASSWORD_X'));
  });

  it('omits variables that are already defined, and says nothing when all are', async () => {
    process.env.HINT_DB_PASSWORD_X = 'set';
    await fs.writeFile(path.join(tempDir, 'shared.yml'), shared);
    await runShareImport('shared.yml', { validateOnly: true });
    const message = (logger.info as jest.Mock).mock.calls.map((c) => c[0]).join('\n');
    expect(message).toContain('HINT_DB_USER_X');
    expect(message).not.toContain('HINT_DB_PASSWORD_X');

    (logger.info as jest.Mock).mockClear();
    await fs.writeFile(path.join(tempDir, 'shared.yml'), 'name: t\n');
    await runShareImport('shared.yml', { validateOnly: true });
    expect(logger.info).not.toHaveBeenCalled();
  });
});
