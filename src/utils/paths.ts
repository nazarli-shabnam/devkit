import * as fs from 'fs';
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
  const resolved = path.resolve(cwd, explicit);
  if (!path.isAbsolute(explicit)) assertRealPathInside(resolved, cwd, `Output path "${explicit}"`);
  return resolved;
}

/**
 * `target` with symlinks resolved. The target usually does not exist yet, so the nearest existing
 * ancestor is resolved and the missing tail is appended.
 */
export function resolveThroughSymlinks(target: string): string {
  let current = path.resolve(target);
  const missing: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * A path that looks inside `baseDir` can still leave it through a symlink (`linked -> /elsewhere`).
 * Compare where both really are, so a symlinked directory cannot redirect a write out of the project.
 */
export function assertRealPathInside(target: string, baseDir: string, label: string): void {
  if (!isInsideDir(resolveThroughSymlinks(target), resolveThroughSymlinks(baseDir))) {
    throw new Error(`${label} resolves outside ${baseDir} through a symbolic link. Use an absolute path if intended.`);
  }
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
