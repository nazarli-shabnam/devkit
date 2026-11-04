/** Conventional exit status for an interrupted command (128 + SIGINT). */
export const CANCEL_EXIT_CODE = 130;

/**
 * `onCancel` handler for `prompts`: the user aborted (Ctrl+C / Esc, or stdin closed), so the
 * command did not do what was asked. Exit non-zero so `envkit init && envkit setup` and CI
 * scripts stop instead of carrying on as if it had succeeded.
 */
export function exitOnCancel(): never {
  process.stderr.write('\nCancelled.\n');
  process.exit(CANCEL_EXIT_CODE);
}

/** Prompts need a terminal on both ends: input piped in or output captured cannot be answered. */
export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}
