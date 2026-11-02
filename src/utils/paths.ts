import * as path from 'path';

/**
 * True when `target` is `baseDir` itself or lies inside it. Unlike a `startsWith` check on the
 * strings, a sibling that merely shares a prefix (`/home/u/proj-evil` vs `/home/u/proj`) is
 * outside, and a target on another Windows drive is outside too.
 */
export function isInsideDir(target: string, baseDir: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(target));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Throw unless a relative output path stays inside `baseDir`. Absolute paths are an explicit
 * choice by the user and are allowed.
 */
export function assertRelativeOutputInside(outputFile: string, baseDir: string): void {
  if (path.isAbsolute(outputFile)) return;
  if (!isInsideDir(path.resolve(baseDir, outputFile), baseDir)) {
    throw new Error(
      `Output path "${outputFile}" would write outside the working directory. Use an absolute path if intended.`
    );
  }
}
