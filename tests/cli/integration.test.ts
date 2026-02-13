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

  it('generate writes docker-compose.yml when config has docker enabled', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-generate-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const config = [
      'name: e2e-generate',
      'version: "1.0.0"',
      'databases:',
      '  - type: postgresql',
      '    port: 5432',
      '  - type: redis',
      '    port: 6379',
      'docker:',
      '  enabled: true',
      '  output_file: docker-compose.yml',
    ].join('\n');
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), config);
    try {
      runCli(['generate'], tempDir);
      const composePath = path.join(tempDir, 'docker-compose.yml');
      expect(fs.pathExistsSync(composePath)).toBe(true);
      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toMatch(/version:|services:/);
      expect(content).toMatch(/postgres|redis/);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('generate -o writes to custom path', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-generate-o-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(
      path.join(tempDir, '.dev-env.yml'),
      'name: e2e\ndatabases:\n  - type: redis\n    port: 6379\ndocker:\n  enabled: true'
    );
    try {
      runCli(['generate', '-o', 'my-compose.yml'], tempDir);
      expect(fs.pathExistsSync(path.join(tempDir, 'my-compose.yml'))).toBe(true);
      expect(fs.pathExistsSync(path.join(tempDir, 'docker-compose.yml'))).toBe(false);
    } finally {
      fs.removeSync(tempDir);
    }
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

  it('share export -o writes to custom path', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-share-export-o-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: e2e\nversion: "1.0.0"\ndatabases: []');
    try {
      runCli(['share', 'export', '-o', 'custom-shared.yml'], tempDir);
      expect(fs.pathExistsSync(path.join(tempDir, 'custom-shared.yml'))).toBe(true);
      const content = fs.readFileSync(path.join(tempDir, 'custom-shared.yml'), 'utf-8');
      expect(content).toMatch(/name:\s*e2e/);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('share import -o writes to custom path', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-share-import-o-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const shared = 'name: imported-via-o\nversion: "1.0.0"\ndatabases: []';
    fs.writeFileSync(path.join(tempDir, 'in.yml'), shared);
    try {
      runCli(['share', 'import', 'in.yml', '-o', 'custom-config.yml'], tempDir);
      expect(fs.pathExistsSync(path.join(tempDir, 'custom-config.yml'))).toBe(true);
      const content = fs.readFileSync(path.join(tempDir, 'custom-config.yml'), 'utf-8');
      expect(content).toMatch(/imported-via-o/);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('snapshot list shows created snapshot name', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-list-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: e2e\nversion: "1.0.0"');
    runCli(['snapshot', 'create', 'list-test-snap'], tempDir);
    try {
      const out = runCli(['snapshot', 'list'], tempDir);
      expect(out).toContain('list-test-snap');
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('path-setup --help shows path-setup description', () => {
    const out = runCli(['path-setup', '--help']);
    expect(out).toMatch(/path|PATH|envkit/i);
  });

  it('share export then import roundtrip preserves config structure', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-roundtrip-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    const config = [
      'name: roundtrip-app',
      'version: "2.0.0"',
      'databases:',
      '  - type: postgresql',
      '    port: 5432',
      '    user: ${DB_USER}',
      '    password: ${DB_PASSWORD}',
      '    database: mydb',
      'services:',
      '  - type: rabbitmq',
      '    port: 5672',
    ].join('\n');
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), config);
    try {
      runCli(['share', 'export', '-o', 'roundtrip-shared.yml'], tempDir);
      expect(fs.pathExistsSync(path.join(tempDir, 'roundtrip-shared.yml'))).toBe(true);
      fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: overwritten');
      runCli(['share', 'import', 'roundtrip-shared.yml', '-o', '.dev-env.yml'], tempDir);
      const imported = fs.readFileSync(path.join(tempDir, '.dev-env.yml'), 'utf-8');
      expect(imported).toMatch(/name:\s*roundtrip-app|roundtrip-app/);
      expect(imported).toMatch(/postgresql|5432/);
      expect(imported).toMatch(/rabbitmq|5672/);
      expect(imported).toContain('${DB_USER}');
      expect(imported).toContain('${DB_PASSWORD}');
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('share export writes to current working directory when run from subdir', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-export-cwd-${Date.now()}`);
    const subDir = path.join(tempDir, 'sub', 'deep');
    fs.ensureDirSync(subDir);
    fs.writeFileSync(
      path.join(tempDir, '.dev-env.yml'),
      'name: cwd-test\nversion: "1.0.0"\ndatabases: []'
    );
    try {
      runCli(['share', 'export', '-o', 'exported-from-sub.yml'], subDir);
      const inCwd = path.join(subDir, 'exported-from-sub.yml');
      const inRoot = path.join(tempDir, 'exported-from-sub.yml');
      expect(fs.pathExistsSync(inCwd)).toBe(true);
      expect(fs.pathExistsSync(inRoot)).toBe(false);
      const content = fs.readFileSync(inCwd, 'utf-8');
      expect(content).toMatch(/name:\s*cwd-test|cwd-test/);
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('generate writes docker-compose to current working directory when run from subdir', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-generate-cwd-${Date.now()}`);
    const subDir = path.join(tempDir, 'sub', 'deep');
    fs.ensureDirSync(subDir);
    fs.writeFileSync(
      path.join(tempDir, '.dev-env.yml'),
      'name: gen-cwd\ndatabases:\n  - type: redis\n    port: 6379\ndocker:\n  enabled: true'
    );
    try {
      runCli(['generate', '-o', 'compose-in-sub.yml'], subDir);
      const inCwd = path.join(subDir, 'compose-in-sub.yml');
      const inRoot = path.join(tempDir, 'compose-in-sub.yml');
      expect(fs.pathExistsSync(inCwd)).toBe(true);
      expect(fs.pathExistsSync(inRoot)).toBe(false);
      const content = fs.readFileSync(inCwd, 'utf-8');
      expect(content).toMatch(/version:|services:/);
      expect(content).toContain('redis');
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('generate produces compose with healthcheck for database services', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-healthcheck-${Date.now()}`);
    fs.ensureDirSync(tempDir);
    fs.writeFileSync(
      path.join(tempDir, '.dev-env.yml'),
      [
        'name: healthcheck-e2e',
        'databases:',
        '  - type: postgresql',
        '    port: 5432',
        '  - type: redis',
        '    port: 6379',
        'docker:',
        '  enabled: true',
      ].join('\n')
    );
    try {
      runCli(['generate'], tempDir);
      const content = fs.readFileSync(path.join(tempDir, 'docker-compose.yml'), 'utf-8');
      expect(content).toContain('healthcheck:');
      expect(content).toMatch(/pg_isready|redis-cli|ping/);
      expect(content).toContain('interval: 10s');
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('share import -o writes to current working directory when run from subdir', () => {
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `devkit-e2e-import-cwd-${Date.now()}`);
    const subDir = path.join(tempDir, 'sub', 'deep');
    fs.ensureDirSync(subDir);
    fs.writeFileSync(
      path.join(tempDir, 'shared.yml'),
      'name: imported-in-cwd\nversion: "1.0.0"\ndatabases: []'
    );
    fs.writeFileSync(path.join(tempDir, '.dev-env.yml'), 'name: root');
    try {
      runCli(['share', 'import', path.join(tempDir, 'shared.yml'), '-o', 'local-import.yml'], subDir);
      const inCwd = path.join(subDir, 'local-import.yml');
      const inRoot = path.join(tempDir, 'local-import.yml');
      expect(fs.pathExistsSync(inCwd)).toBe(true);
      expect(fs.pathExistsSync(inRoot)).toBe(false);
      const content = fs.readFileSync(inCwd, 'utf-8');
      expect(content).toMatch(/imported-in-cwd/);
    } finally {
      fs.removeSync(tempDir);
    }
  });
});
