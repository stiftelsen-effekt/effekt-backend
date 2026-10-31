/**
 * A save that takes several API calls (create a report, then the allocation that refers to it)
 * can fail half way. `once` remembers what each step returned, keyed by the step's input, so
 * Save again reuses what was already created instead of creating it twice. A changed input runs
 * the step again; `reset` forgets everything (a fresh form).
 */
export function saveSteps() {
  const done = new Map<string, unknown>();
  return {
    async once<T>(step: string, input: unknown, run: () => Promise<T>): Promise<T> {
      const key = `${step}:${JSON.stringify(input)}`;
      if (done.has(key)) return done.get(key) as T;
      const result = await run();
      done.set(key, result);
      return result;
    },
    reset() {
      done.clear();
    },
  };
}
