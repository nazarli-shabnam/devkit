import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';

const projectRoot = path.resolve(__dirname, '../..');
const cliSrc = path.join(projectRoot, 'src', 'cli', 'index.ts');
const cliDist = path.join(projectRoot, 'dist', 'cli', 'index.js');

function runCli(args: string[], cwd?: string): string {
  const useCwd = cwd ?? projectRoot;
  const useDist = fs.pathExistsSync(cliDist);
  const cmd = useDist
    ? `node "${cliDist}" ${args.map((a) => `"${a}"`).join(' ')}`
    : `npx ts-node "${cliSrc}" ${args.map((a) => `"${a}"`).join(' ')}`;
  return execSync(cmd, { cwd: useCwd, encoding: 'utf-8' }).trim();
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

  it('snapshot list runs without error', () => {
    const out = runCli(['snapshot', 'list']);
    expect(out).toBeDefined();
    expect(typeof out).toBe('string');
  });

  it('snapshot create creates snapshot in .devkit/snapshots when run from project with .dev-env.yml', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-create-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const configYaml = 'name: e2e-app\nversion: "1.0.0"\ndatabases: []';
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), configYaml);
    try {
      const out = runCli(['snapshot', 'create', 'e2e-snap'], tempDir);
      expect(out).toMatch(/e2e-snap|created|Created/);
      const snapshotDir = path.join(tempDir, '.devkit', 'snapshots', 'e2e-snap');
      expect(fs.pathExistsSync(snapshotDir)).toBe(true);
      expect(fs.pathExistsSync(path.join(snapshotDir, 'metadata.json'))).toBe(true);
      expect(fs.pathExistsSync(path.join(snapshotDir, 'dev-env.yml'))).toBe(true);
      const saved = fs.readFileSync(path.join(snapshotDir, 'dev-env.yml'), 'utf-8');
      expect(saved).toBe(configYaml);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('generate --help shows output option', () => {
    const out = runCli(['generate', '--help']);
    expect(out).toMatch(/-o|output/);
    expect(out).toContain('generate');
  });

  it('setup --help shows skip and dry-run options', () => {
    const out = runCli(['setup', '--help']);
    expect(out).toMatch(/skip-deps|skip-db|dry-run/);
  });
});
