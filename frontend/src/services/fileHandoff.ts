/**
 * Hand-off of selected files between the picker on Home and the Send screen.
 *
 * These deliberately do *not* travel in router state: React Router serialises
 * location state into `history.state`, and pushing `File` objects through
 * structured clone is unreliable across browsers (Safari can reject it, which
 * fails the navigation itself). A module-level store keeps the objects as-is
 * and is naturally empty after a reload -- which is the truth, since a `File`
 * handle cannot survive one.
 */

let staged: File[] = [];

export function stageFiles(files: File[]): void {
  staged = files;
}

/** Non-destructive read: safe to call from a render or a StrictMode re-run. */
export function peekStagedFiles(): File[] {
  return staged;
}

export function clearStagedFiles(): void {
  staged = [];
}
