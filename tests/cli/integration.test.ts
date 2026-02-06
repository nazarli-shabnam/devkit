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

  it('--help prints help with envkit and commands', () => {
    const out = runCli(['--help']);
    expect(out).toMatch(/envkit|dev-env|Local Dev Environment/);
    expect(out).toContain('setup');
    expect(out).toContain('init');
    expect(out).toContain('snapshot');
  });

  it('init --help shows init command', () => {
    const out = runCli(['init', '--help']);
    expect(out).toMatch(/init|\.dev-env\.yml|wizard/);
  });

  it('snapshot --help shows create, list, restore', () => {
    const out = runCli(['snapshot', '--help']);
    expect(out).toMatch(/create|list|restore/);
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

  it('snapshot create without name uses timestamped snapshot name', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-create-unnamed-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: e2e\nversion: "1.0.0"');
    try {
      const out = runCli(['snapshot', 'create'], tempDir);
      expect(out).toMatch(/snapshot-\d{4}-\d{2}-\d{2}T/);
      expect(out).toMatch(/created|Created/);
      const snapshotDirPath = path.join(tempDir, '.devkit', 'snapshots');
      const entries = fs.readdirSync(snapshotDirPath);
      expect(entries.length).toBe(1);
      expect(entries[0]).toMatch(/^snapshot-\d{4}-\d{2}-\d{2}T/);
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

  it('setup --dry-run runs from subdirectory when .dev-env.yml is in parent', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-setup-subdir-${Date.now()}`);
    const subDir = path.join(tempDir, 'sub');
    fs.ensureDirSync(subDir);
    fs.writeFileSync(
      path.join(tempDir, '.dev-env.yml'),
      'name: e2e-setup\nversion: "1.0.0"\ndependencies: []\ndatabases: []'
    );
    try {
      const out = runCli(['setup', '--dry-run'], subDir);
      expect(out).toBeDefined();
      expect(out.toLowerCase()).toMatch(/dry|would|setup/);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('snapshot restore writes snapshot config back to .dev-env.yml', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-restore-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const original = 'name: before\nversion: "1.0.0"\ndatabases: []';
    const restored = 'name: restored\nversion: "2.0.0"\ndatabases: []';
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), original);
    runCli(['snapshot', 'create', 'e2e-backup'], tempDir);
    fs.writeFileSync(
      path.join(tempDir, '.devkit', 'snapshots', 'e2e-backup', 'dev-env.yml'),
      restored
    );
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: changed');
    try {
      const out = runCli(['snapshot', 'restore', 'e2e-backup'], tempDir);
      expect(out).toMatch(/Restored|e2e-backup|\.dev-env\.yml/);
      const current = fs.readFileSync(path.join(tempDir, '.dev-env.yml'), 'utf-8');
      expect(current).toBe(restored);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('share export writes sanitized config to dev-env.shared.yml', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-share-export-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const config = [
      'name: e2e-share',
      'version: "1.0.0"',
      'databases:',
      '  - type: postgresql',
      '    port: 5432',
      '    user: myuser',
      '    password: secret123',
      '    database: app',
    ].join('\n');
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), config);
    try {
      const out = runCli(['share', 'export'], tempDir);
      expect(out).toMatch(/Exported|dev-env\.shared\.yml/);
      const sharedPath = path.join(tempDir, 'dev-env.shared.yml');
      expect(fs.pathExistsSync(sharedPath)).toBe(true);
      const content = fs.readFileSync(sharedPath, 'utf-8');
      expect(content).toContain('${DB_PASSWORD}');
      expect(content).not.toContain('secret123');
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('share import writes imported config to .dev-env.yml', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-share-import-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: original\nversion: "1.0.0"');
    const shared = 'name: imported-app\nversion: "3.0.0"\ndatabases:\n  - type: redis\n    port: 6379';
    fs.writeFileSync(path.join(tempDir, 'shared.yml'), shared);
    try {
      const out = runCli(['share', 'import', 'shared.yml'], tempDir);
      expect(out).toMatch(/Imported|\.dev-env\.yml/);
      const content = fs.readFileSync(path.join(tempDir, '.dev-env.yml'), 'utf-8');
      expect(content).toMatch(/name:\s*imported-app|imported-app/);
      expect(content).toMatch(/redis|6379/);
    } finally {
      fs.removeSync(tempDir);
    }
  });
});
