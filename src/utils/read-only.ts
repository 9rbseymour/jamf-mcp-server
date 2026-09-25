/**
 * Fail closed: a missing or mistyped JAMF_READ_ONLY must never enable writes,
 * so only an explicit "false" opts out of read-only mode.
 */
export function isReadOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JAMF_READ_ONLY !== 'false';
}
