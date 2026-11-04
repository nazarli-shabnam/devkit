import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { loadConfig } from '../../../src/core/config/loader';
import { logger } from '../../../src/utils/logger';

describe('loadConfig explains problems with the file itself', () => {
  let root: string;
  const write = (text: string): Promise<void> => fs.writeFile(path.join(root, '.dev-env.yml'), text);

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-fileerr-'));
  });
  afterEach(async () => {
    await fs.remove(root).catch(() => {});
    jest.restoreAllMocks();
  });

  it.each([['an empty file', ''], ['only whitespace', '   \n\n'], ['only comments', '# todo\n'], ['a null document', '~\n']])(
    'says the config is empty for %s',
    async (_label, text) => {
      await write(text);
      const error = await loadConfig(root).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/is empty\. Add at least a name/);
      expect((error as Error).message).toContain('name: my-project');
      expect((error as Error).message).not.toMatch(/Required/);
    }
  );

  it('says a list or a plain value is not a settings mapping', async () => {
    await write('- a\n- b\n');
    await expect(loadConfig(root)).rejects.toThrow(/must be a mapping of settings .* not a list/);
    await write('just text\n');
    await expect(loadConfig(root)).rejects.toThrow(/must be a mapping of settings .* not a single value/);
  });

  it('still reports ordinary schema problems with their field path', async () => {
    await write('version: "1"\n');
    await expect(loadConfig(root)).rejects.toThrow(/- name: Required/);
  });
});
