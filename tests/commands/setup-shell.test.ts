import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { spawnSync } from 'child_process';

// Real processes through the built CLI (jest cannot import the ESM-only execa): the point is that
// the same command means the same thing on every OS.
const cli = path.resolve(__dirname, '../../dist/cli/index.js');
const runSetup = (cwd: string, args: string[] = []): { status: number | null; output: string } => {
  const r = spawnSync(process.execPath, [cli, 'setup', ...args], { cwd, encoding: 'utf-8' });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
};
describe('setup runs commands through the platform shell', () => {
  let root: string;

  // `w.js <file> <text>` appends text to file; quoted node path works in both sh and cmd.exe.
  const node = `"${process.execPath}"`;
  const write = (file: string, text: string): string => `${node} w.js ${file} ${text}`;

  // A JSON string is a valid YAML scalar, so backslashes and quotes in the command need no extra care.
  const writeConfig = (command: string): Promise<void> =>
    fs.writeFile(
      path.join(root, '.dev-env.yml'),
      ['name: shell-test', 'dependencies:', '  - type: custom', `    command: ${JSON.stringify(command)}`, ''].join('\n')
    );

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-shell-')));
    await fs.writeFile(
      path.join(root, 'w.js'),
      "require('fs').appendFileSync(process.argv[2], process.argv.slice(3).join(' '));\n"
    );
  });

  afterEach(async () => {
    await fs.remove(root).catch(() => {});
  });

  it('supports && chaining (runs both parts)', async () => {
    await writeConfig(`${write('chain.txt', 'a')} && ${write('chain.txt', 'b')}`);
    expect(runSetup(root).status).toBe(0);
    expect(await fs.readFile(path.join(root, 'chain.txt'), 'utf-8')).toBe('ab');
  });

  it('stops the chain when the first command fails', async () => {
    await fs.writeFile(path.join(root, 'fail.js'), 'process.exit(3);\n');
    await writeConfig(`${node} fail.js && ${write('never.txt', 'x')}`);
    expect(runSetup(root).status).not.toBe(0);
    expect(await fs.pathExists(path.join(root, 'never.txt'))).toBe(false);
  });

  it('keeps quoted arguments containing spaces together', async () => {
    await writeConfig(`${node} w.js out.txt "two words"`);
    expect(runSetup(root).status).toBe(0);
    expect(await fs.readFile(path.join(root, 'out.txt'), 'utf-8')).toBe('two words');
  });

  it('rejects an empty command, also in a dry run', async () => {
    await writeConfig('   ');
    for (const args of [[], ['--dry-run']]) {
      const r = runSetup(root, args);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('Empty command');
    }
  });
});
