import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { classifyError } from "@/lib/errors/classify";

/**
 * Puts the server's validation errors next to the fields they are about. Returns true when at least one error was
 * attached to a field of this form; when it returns false (not a validation error, or none of the paths is a field
 * here) the caller shows a notification instead, so a failed submit is never silent.
 *
 *   onError: (error) => { if (!applyFormError(error, form)) notifyError(error); }
 */
export function applyFormError<T extends FieldValues>(
  error: unknown,
  form: { getValues: UseFormGetValues<T>; setError: UseFormSetError<T> }
): boolean {
  const info = classifyError(error);
  if (info.kind !== "validation" || info.fieldErrors.length === 0) return false;
  const known = new Set(Object.keys(form.getValues()));
  let attached = 0;
  for (const { path, message } of info.fieldErrors) {
    if (!known.has(path.split(".")[0])) continue;
    form.setError(path as Path<T>, { type: "server", message });
    attached++;
  }
  return attached > 0;
}
