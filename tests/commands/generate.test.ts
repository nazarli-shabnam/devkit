import * as path from 'path';
import * as fs from 'fs-extra';
import { runGenerate } from '../../src/commands/generate';
import { logger } from '../../src/utils/logger';

describe('generate command', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'success').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    tempDir = path.join(require('os').tmpdir(), `devkit-generate-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir).catch(() => {});
    jest.restoreAllMocks();
  });

  it('throws when .dev-env.yml is not found', async () => {
    process.chdir(tempDir);
    await expect(runGenerate({ output: 'docker-compose.yml' })).rejects.toThrow(
      /Configuration file not found|\.dev-env\.yml/
    );
  });

  it('writes docker-compose when config has databases and docker enabled', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      [
        'name: gen-test',
        'version: "1.0.0"',
        'databases:',
        '  - type: postgresql',
        '    port: 5432',
        '    database: app',
        '  - type: redis',
        '    port: 6379',
        'docker:',
        '  enabled: true',
        '  output_file: docker-compose.yml',
        '  network_name: dev-network',
      ].join('\n')
    );
    process.chdir(tempDir);

    await runGenerate({ output: 'docker-compose.yml' });

    const outPath = path.join(tempDir, 'docker-compose.yml');
    expect(await fs.pathExists(outPath)).toBe(true);
    const content = await fs.readFile(outPath, 'utf-8');
    expect(content).toContain('version:');
    expect(content).toContain('services:');
    expect(content).toContain('postgres');
    expect(content).toContain('redis');
    expect(content).toContain('dev-network');
  });

  it('does not write file when docker.enabled is false', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      [
        'name: gen-test',
        'databases:',
        '  - type: redis',
        '    port: 6379',
        'docker:',
        '  enabled: false',
      ].join('\n')
    );
    process.chdir(tempDir);

    await runGenerate({ output: 'docker-compose.yml' });

    const outPath = path.join(tempDir, 'docker-compose.yml');
    expect(await fs.pathExists(outPath)).toBe(false);
  });

  it('writes to custom output path when -o is used', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: gen-test\ndatabases:\n  - type: redis\n    port: 6379\ndocker:\n  enabled: true'
    );
    process.chdir(tempDir);

    await runGenerate({ output: 'custom-compose.yml' });

    const outPath = path.join(tempDir, 'custom-compose.yml');
    expect(await fs.pathExists(outPath)).toBe(true);
    const content = await fs.readFile(outPath, 'utf-8');
    expect(content).toContain('redis');
  });

  it('generated compose contains healthcheck for database services', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      [
        'name: gen-test',
        'databases:',
        '  - type: postgresql',
        '    port: 5432',
        '  - type: redis',
        '    port: 6379',
        'docker:',
        '  enabled: true',
      ].join('\n')
    );
    process.chdir(tempDir);

    await runGenerate({ output: 'docker-compose.yml' });

    const content = await fs.readFile(path.join(tempDir, 'docker-compose.yml'), 'utf-8');
    expect(content).toContain('healthcheck:');
    expect(content).toMatch(/pg_isready|postgres/);
    expect(content).toMatch(/redis-cli|ping/);
    expect(content).toContain('interval: 10s');
  });

  it('writes to cwd (not project root) when run from subdirectory', async () => {
    const subDir = path.join(tempDir, 'sub', 'deep');
    await fs.ensureDir(subDir);
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: gen-test\ndatabases:\n  - type: redis\n    port: 6379\ndocker:\n  enabled: true'
    );
    process.chdir(subDir);

    await runGenerate({ output: 'compose-in-cwd.yml' });

    const inCwd = path.join(subDir, 'compose-in-cwd.yml');
    const inRoot = path.join(tempDir, 'compose-in-cwd.yml');
    expect(await fs.pathExists(inCwd)).toBe(true);
    expect(await fs.pathExists(inRoot)).toBe(false);
    const content = await fs.readFile(inCwd, 'utf-8');
    expect(content).toContain('redis');
  });

  it('uses default output filename when output is empty string', async () => {
    await fs.writeFile(
      path.join(tempDir, '.dev-env.yml'),
      'name: gen-test\ndatabases:\n  - type: redis\n    port: 6379\ndocker:\n  enabled: true'
    );
    process.chdir(tempDir);

    await runGenerate({ output: '' });

    expect(await fs.pathExists(path.join(tempDir, 'docker-compose.yml'))).toBe(true);
  });
});
