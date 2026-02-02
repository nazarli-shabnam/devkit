import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';

const projectRoot = path.resolve(__dirname, '../..');
const cliSrc = path.join(projectRoot, 'src', 'cli', 'index.ts');
const cliDist = path.join(projectRoot, 'dist', 'cli', 'index.js');

function runCli(args: string[]): string {
  const useDist = fs.pathExistsSync(cliDist);
  const cmd = useDist
    ? `node "${cliDist}" ${args.map((a) => `"${a}"`).join(' ')}`
    : `npx ts-node "${cliSrc}" ${args.map((a) => `"${a}"`).join(' ')}`;
  return execSync(cmd, { cwd: projectRoot, encoding: 'utf-8' }).trim();
}

describe('CLI integration', () => {
  it('--version prints version', () => {
    const out = runCli(['--version']);
    expect(out).toMatch(/\d+\.\d+\.\d+/);
  });

  it('--help prints help with devkit and commands', () => {
    const out = runCli(['--help']);
    expect(out).toMatch(/devkit|dev-env|Local Dev Environment/);
    expect(out).toContain('setup');
    expect(out).toContain('snapshot');
  });
});
