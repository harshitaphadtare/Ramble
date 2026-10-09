/** The one error shape the API returns: no stack traces, no internal details. */
export function err(code: string, message: string) {
  return { error: { code, message } };
}
