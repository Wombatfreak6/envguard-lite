/**
 * Error thrown by `validateEnv` when one or more environment variables fail
 * validation. All failures are collected into a single error instance.
 */
export class EnvValidationError extends Error {
  /**
   * @param {Array<{ variable: string, message: string, kind: string }>} errors
   */
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [];
    const count = list.length;
    const heading =
      count === 1
        ? "Environment validation failed with 1 error:"
        : `Environment validation failed with ${count} errors:`;
    const details = list.map((error) => `  - ${error.variable}: ${error.message}`).join("\n");

    super(`${heading}\n${details}`);

    this.name = "EnvValidationError";
    /** @type {Array<{ variable: string, message: string, kind: string }>} */
    this.errors = list;
  }

  /** Names of the variables that failed validation. */
  get variables() {
    return this.errors.map((error) => error.variable);
  }
}
