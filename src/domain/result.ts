/** An expected failure as a value: success with a value, or failure with a string-literal error code. */
export type Result<T, E extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
