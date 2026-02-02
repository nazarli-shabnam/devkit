import * as path from 'path';
import * as fs from 'fs-extra';
import {
  fileExists,
  readFile,
  writeFile,
  readJson,
  writeJson,
  ensureDir,
  copy,
  findFile,
  findFiles,
} from '../../src/utils/file-ops';
import { logger } from '../../src/utils/logger';

describe('file-ops', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(require('os').tmpdir(), `devkit-fileops-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('fileExists', () => {
    it('returns true when file exists', async () => {
      const f = path.join(tempDir, 'exists.txt');
      await fs.writeFile(f, '');
      expect(await fileExists(f)).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      expect(await fileExists(path.join(tempDir, 'missing.txt'))).toBe(false);
    });
  });

  describe('readFile', () => {
    it('reads file content', async () => {
      const f = path.join(tempDir, 'read.txt');
      await fs.writeFile(f, 'hello world');
      expect(await readFile(f)).toBe('hello world');
    });

    it('throws when file does not exist', async () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      await expect(readFile(path.join(tempDir, 'missing.txt'))).rejects.toThrow();
      errorSpy.mockRestore();
    });
  });

  describe('writeFile', () => {
    it('writes file and creates parent dirs', async () => {
      const f = path.join(tempDir, 'a', 'b', 'file.txt');
      await writeFile(f, 'content');
      expect(await fs.readFile(f, 'utf-8')).toBe('content');
    });
  });

  describe('readJson', () => {
    it('parses JSON file', async () => {
      const f = path.join(tempDir, 'data.json');
      await fs.writeFile(f, '{"foo": "bar"}');
      expect(await readJson(f)).toEqual({ foo: 'bar' });
    });

    it('throws on invalid JSON', async () => {
      const f = path.join(tempDir, 'bad.json');
      await fs.writeFile(f, 'not json {');
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      await expect(readJson(f)).rejects.toThrow();
      errorSpy.mockRestore();
    });
  });

  describe('writeJson', () => {
    it('writes JSON with indent', async () => {
      const f = path.join(tempDir, 'out.json');
      await writeJson(f, { a: 1 });
      const content = await fs.readFile(f, 'utf-8');
      expect(JSON.parse(content)).toEqual({ a: 1 });
    });
  });

  describe('ensureDir', () => {
    it('creates directory', async () => {
      const d = path.join(tempDir, 'nested', 'dir');
      await ensureDir(d);
      expect(await fs.pathExists(d)).toBe(true);
    });
  });

  describe('copy', () => {
    it('copies file', async () => {
      const src = path.join(tempDir, 'src.txt');
      const dest = path.join(tempDir, 'dest.txt');
      await fs.writeFile(src, 'content');
      await copy(src, dest);
      expect(await fs.readFile(dest, 'utf-8')).toBe('content');
    });
  });

  describe('findFile', () => {
    it('finds file in directory', async () => {
      await fs.writeFile(path.join(tempDir, 'target.txt'), '');
      const found = await findFile(tempDir, 'target.txt');
      expect(found).toBe(path.join(tempDir, 'target.txt'));
    });

    it('finds file in subdirectory', async () => {
      const sub = path.join(tempDir, 'sub');
      await fs.ensureDir(sub);
      await fs.writeFile(path.join(sub, 'nested.txt'), '');
      const found = await findFile(tempDir, 'nested.txt');
      expect(found).toBe(path.join(sub, 'nested.txt'));
    });

    it('returns null when not found', async () => {
      const found = await findFile(tempDir, 'nonexistent.txt');
      expect(found).toBeNull();
    });
  });

  describe('findFiles', () => {
    it('returns paths matching pattern', async () => {
      await fs.writeFile(path.join(tempDir, 'a.ts'), '');
      await fs.writeFile(path.join(tempDir, 'b.js'), '');
      await fs.writeFile(path.join(tempDir, 'c.ts'), '');
      const found = await findFiles(tempDir, /\.ts$/);
      expect(found).toHaveLength(2);
      expect(found.every((p) => p.endsWith('.ts'))).toBe(true);
    });

    it('searches subdirectories recursively', async () => {
      const sub = path.join(tempDir, 'sub', 'nested');
      await fs.ensureDir(sub);
      await fs.writeFile(path.join(sub, 'deep.ts'), '');
      await fs.writeFile(path.join(tempDir, 'root.ts'), '');
      const found = await findFiles(tempDir, /\.ts$/);
      expect(found).toHaveLength(2);
      expect(found.some((p) => p.includes('nested'))).toBe(true);
    });
  });
});
