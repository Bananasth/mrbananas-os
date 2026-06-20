/**
 * JWT revocation via session_version.
 *
 * `session_version` (stored on app_user — the single source of truth) is embedded in every
 * JWT at issue time. On each request the server compares the token's version to the user's
 * current stored version: they must match exactly. Bumping the stored version (see the
 * app.bump_session_version SQL primitive) invalidates every outstanding token immediately —
 * the basis of instant revocation on role change or termination (S1).
 *
 * Pure comparison logic only — no database access, no I/O.
 */

/** The version assigned to a brand-new user (matches the DB column default). */
export const INITIAL_SESSION_VERSION = 1;

/** A token is current iff its session_version matches the stored current value exactly. */
export function isSessionCurrent(tokenVersion: number, currentVersion: number): boolean {
  return (
    Number.isInteger(tokenVersion) &&
    Number.isInteger(currentVersion) &&
    tokenVersion === currentVersion
  );
}

/** The next session_version after a revocation bump. */
export function nextSessionVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/** Throw if the token's session has been revoked (version no longer current). */
export function assertSessionCurrent(tokenVersion: number, currentVersion: number): void {
  if (!isSessionCurrent(tokenVersion, currentVersion)) {
    throw new Error("Session has been revoked: token session_version is stale.");
  }
}
