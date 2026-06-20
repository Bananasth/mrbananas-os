/**
 * A typed Result wrapper used across the codebase to make success/failure explicit
 * instead of relying on thrown exceptions. Service-layer functions return `Result`
 * so callers must handle the error path.
 *
 * This is the first shared kernel utility (see docs/architecture/03-folder-structure.md).
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E = Error> = Ok<T> | Err<E>

/** Construct a success result. */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })

/** Construct a failure result. */
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

/** Type guard: narrows a Result to its success branch. */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok

/** Type guard: narrows a Result to its failure branch. */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok

/** Transform the value of a success result, leaving failures untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Return the success value, or a fallback when the result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}
