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
 * Where an output file goes. With no explicit `--output` it is `defaultName` in the project root
 * (so running from a subfolder does not scatter files or create a nested config). An explicit
 * relative path is relative to the current directory, as with any CLI, and must stay inside it;
 * an absolute path is used as given.
 */
export function resolveOutputPath(
  output: string | undefined,
  defaultName: string,
  projectRoot: string,
  cwd: string = process.cwd()
): string {
  const explicit = output?.trim();
  if (!explicit) return path.resolve(projectRoot, defaultName);
  assertRelativeOutputInside(explicit, cwd);
  return path.resolve(cwd, explicit);
}

/** A path for messages: relative to `cwd` when it is inside it, absolute otherwise. */
export function displayPath(target: string, cwd: string = process.cwd()): string {
  return isInsideDir(target, cwd) ? path.relative(cwd, target) || '.' : target;
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
