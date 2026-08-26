/**
 * Escapes literal `%`, `_`, and the backslash escape character itself so
 * a user-supplied search string can never be interpreted as ILIKE
 * wildcards. Without this, a search for "%" or "_" matches far more rows
 * than the user typed (in the worst case, every row in the table). This
 * is not a SQL-injection risk on its own (the query is already fully
 * parameterized via the `postgres` tagged-template driver everywhere in
 * this codebase), but it is a real correctness and unintended-full-scan
 * risk that any user-supplied search text needs guarding against before
 * it's used to build an ILIKE pattern.
 */
export function escapeIlikeWildcards(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Wraps an already-escaped search term in the standard "contains" pattern. */
export function buildIlikePattern(escapedInput: string): string {
  return `%${escapedInput}%`
}

/**
 * One call for the common case: takes raw user input, trims it, escapes
 * ILIKE wildcards, and returns the ready-to-use pattern — or null if the
 * input is empty/undefined, matching how every search server function
 * already treats "no search term" as "don't filter".
 */
export function sanitizeSearchInput(rawInput: string | undefined): string | null {
  if (!rawInput) return null
  const trimmed = rawInput.trim()
  if (!trimmed) return null
  return buildIlikePattern(escapeIlikeWildcards(trimmed))
}
