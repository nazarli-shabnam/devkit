import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from './logger';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    logger.error(`Failed to read file: ${filePath}`, error.message);
    throw error;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error: any) {
    logger.error(`Failed to write file: ${filePath}`, error.message);
    throw error;
  }
}

export async function readJson<T = any>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath);
    return JSON.parse(content);
  } catch (error: any) {
    logger.error(`Failed to read JSON file: ${filePath}`, error.message);
    throw error;
  }
}

export async function writeJson(filePath: string, data: any, indent: number = 2): Promise<void> {
  const content = JSON.stringify(data, null, indent);
  await writeFile(filePath, content);
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.ensureDir(dirPath);
  } catch (error: any) {
    logger.error(`Failed to create directory: ${dirPath}`, error.message);
    throw error;
  }
}

export async function copy(src: string, dest: string): Promise<void> {
  try {
    await fs.copy(src, dest);
  } catch (error: any) {
    logger.error(`Failed to copy ${src} to ${dest}`, error.message);
    throw error;
  }
}

export async function findFile(dirPath: string, fileName: string): Promise<string | null> {
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        const found = await findFile(fullPath, fileName);
        if (found) return found;
      } else if (file === fileName) {
        return fullPath;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function findFiles(dirPath: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        const subResults = await findFiles(fullPath, pattern);
        results.push(...subResults);
      } else if (pattern.test(file)) {
        results.push(fullPath);
      }
    }
  } catch (error: any) {
    logger.debug(`Error searching for files: ${error.message}`);
  }
  
  return results;
}
