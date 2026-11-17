import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateEnv, EnvValidationError } from "../src/index.js";

describe("strings", () => {
  it("returns string variables unchanged", () => {
    const config = validateEnv(
      { APP_NAME: { type: "string", required: true } },
      { APP_NAME: "my-app" },
    );

    assert.deepEqual(config, { APP_NAME: "my-app" });
  });

  it("defaults to the string type when none is given", () => {
    assert.deepEqual(validateEnv({ LOG_LEVEL: {} }, { LOG_LEVEL: "info" }), {
      LOG_LEVEL: "info",
    });
  });

  it("ignores environment variables that are not in the schema", () => {
    const config = validateEnv({ APP_NAME: { type: "string" } }, {
      APP_NAME: "my-app",
      UNRELATED: "ignored",
    });

    assert.deepEqual(config, { APP_NAME: "my-app" });
  });

  it("returns a new object instead of the env source", () => {
    const env = { PORT: "8080" };
    const config = validateEnv({ PORT: { type: "number" } }, env);

    assert.notEqual(config, env);
    assert.equal(env.PORT, "8080");
  });
});

describe("numbers", () => {
  it("converts numeric strings to numbers", () => {
    const config = validateEnv({ PORT: { type: "number" } }, { PORT: "3000" });

    assert.equal(config.PORT, 3000);
    assert.equal(typeof config.PORT, "number");
  });

  it("supports integers, decimals, negatives and exponents", () => {
    assert.equal(validateEnv({ V: { type: "number" } }, { V: "-12" }).V, -12);
    assert.equal(validateEnv({ V: { type: "number" } }, { V: "1.5" }).V, 1.5);
    assert.equal(validateEnv({ V: { type: "number" } }, { V: "2e3" }).V, 2000);
  });

  it("rejects values that are not numbers", () => {
    for (const value of ["abc", "12abc", "Infinity", "0x10", "1,5"]) {
      assert.throws(
        () => validateEnv({ PORT: { type: "number", required: true } }, { PORT: value }),
        (error) => {
          assert.ok(error instanceof EnvValidationError);
          assert.match(error.message, /PORT: must be a valid number/);
          return true;
        },
        `expected "${value}" to be rejected`,
      );
    }
  });
});

describe("booleans", () => {
  it('converts "true"/"1" to true', () => {
    for (const value of ["true", "TRUE", "1", " true "]) {
      assert.equal(validateEnv({ DEBUG: { type: "boolean" } }, { DEBUG: value }).DEBUG, true);
    }
  });

  it('converts "false"/"0" to false', () => {
    for (const value of ["false", "False", "0"]) {
      assert.equal(validateEnv({ DEBUG: { type: "boolean" } }, { DEBUG: value }).DEBUG, false);
    }
  });

  it("rejects other values", () => {
    for (const value of ["yes", "no", "on", "2"]) {
      assert.throws(
        () => validateEnv({ DEBUG: { type: "boolean" } }, { DEBUG: value }),
        /DEBUG: must be a boolean/,
        `expected "${value}" to be rejected`,
      );
    }
  });
});

describe("urls", () => {
  it("accepts absolute URLs", () => {
    const values = [
      "postgresql://localhost:5432/mydb",
      "https://example.com/path?x=1",
      "redis://cache:6379",
    ];

    for (const value of values) {
      assert.deepEqual(validateEnv({ DATABASE_URL: { type: "url" } }, { DATABASE_URL: value }), {
        DATABASE_URL: value,
      });
    }
  });

  it("rejects relative or malformed URLs", () => {
    for (const value of ["localhost:5432", "not a url", "example.com", "http://"]) {
      assert.throws(
        () => validateEnv({ DATABASE_URL: { type: "url" } }, { DATABASE_URL: value }),
        /DATABASE_URL: must be a valid absolute URL/,
        `expected "${value}" to be rejected`,
      );
    }
  });
});

describe("required variables", () => {
  it("reports a missing required variable", () => {
    assert.throws(
      () => validateEnv({ JWT_SECRET: { type: "string", required: true } }, {}),
      (error) => {
        assert.ok(error instanceof EnvValidationError);
        assert.equal(error.name, "EnvValidationError");
        assert.equal(error.errors.length, 1);
        assert.deepEqual(error.errors[0], {
          variable: "JWT_SECRET",
          kind: "missing",
          message: "is required but was not set.",
        });
        assert.match(error.message, /JWT_SECRET: is required but was not set\./);
        return true;
      },
    );
  });

  it("treats empty and whitespace-only values as missing", () => {
    for (const value of ["", "   "]) {
      assert.throws(
        () => validateEnv({ JWT_SECRET: { type: "string", required: true } }, { JWT_SECRET: value }),
        /JWT_SECRET: is required but was not set/,
      );
    }
  });

  it("mentions the expected type in the message", () => {
    assert.throws(
      () => validateEnv({ PORT: { type: "number", required: true } }, {}),
      /PORT: is required but was not set\. Expected a number/,
    );
  });

  it("omits optional variables that are missing", () => {
    assert.deepEqual(validateEnv({ OPTIONAL: { type: "string" } }, {}), {});
  });
});

describe("default values", () => {
  it("applies defaults when variables are missing", () => {
    const config = validateEnv(
      {
        PORT: { type: "number", default: 3000 },
        DEBUG: { type: "boolean", default: false },
        NODE_ENV: { type: "string", default: "development" },
      },
      {},
    );

    assert.deepEqual(config, { PORT: 3000, DEBUG: false, NODE_ENV: "development" });
  });

  it("prefers the environment value over the default", () => {
    const config = validateEnv({ PORT: { type: "number", default: 3000 } }, { PORT: "8080" });
    assert.equal(config.PORT, 8080);
  });

  it("applies defaults to empty values", () => {
    const config = validateEnv({ PORT: { type: "number", default: 3000 } }, { PORT: "" });
    assert.equal(config.PORT, 3000);
  });

  it("accepts string defaults that match the declared type", () => {
    const config = validateEnv({ PORT: { type: "number", default: "3000" } }, {});
    assert.equal(config.PORT, 3000);
  });

  it("rejects defaults that do not match the declared type", () => {
    assert.throws(
      () => validateEnv({ PORT: { type: "number", default: "not-a-number" } }, {}),
      /PORT.*default value must be a valid number/,
    );
    assert.throws(
      () => validateEnv({ DEBUG: { type: "boolean", default: "maybe" } }, {}),
      /DEBUG.*default value must be a boolean/,
    );
  });

  it("rejects defaults that are not in the enum", () => {
    assert.throws(
      () =>
        validateEnv(
          { NODE_ENV: { type: "string", enum: ["development", "production"], default: "staging" } },
          {},
        ),
      /NODE_ENV.*default value must be one of the enum values/,
    );
  });
});

describe("enum validation", () => {
  const schema = {
    NODE_ENV: {
      type: "string",
      enum: ["development", "production", "test"],
      default: "development",
    },
  };

  it("accepts allowed values", () => {
    for (const value of ["development", "production", "test"]) {
      assert.equal(validateEnv(schema, { NODE_ENV: value }).NODE_ENV, value);
    }
  });

  it("rejects values outside the enum", () => {
    assert.throws(
      () => validateEnv(schema, { NODE_ENV: "staging" }),
      (error) => {
        assert.equal(error.errors[0].kind, "enum");
        assert.match(
          error.message,
          /NODE_ENV: must be one of: development, production, test\./,
        );
        return true;
      },
    );
  });

  it("supports enums of numbers and booleans", () => {
    assert.equal(
      validateEnv({ LOG_LEVEL: { type: "number", enum: [1, 2, 3] } }, { LOG_LEVEL: "2" }).LOG_LEVEL,
      2,
    );
    assert.throws(
      () => validateEnv({ FLAG: { type: "boolean", enum: [true] } }, { FLAG: "0" }),
      /FLAG: must be one of: true/,
    );
  });
});

describe("multiple errors", () => {
  it("reports every failure in one error", () => {
    const schema = {
      DATABASE_URL: { type: "url", required: true },
      JWT_SECRET: { type: "string", required: true },
      PORT: { type: "number" },
      DEBUG: { type: "boolean" },
      NODE_ENV: { type: "string", enum: ["development", "production"] },
    };

    assert.throws(
      () =>
        validateEnv(schema, {
          PORT: "not-a-port",
          DEBUG: "maybe",
          NODE_ENV: "staging",
        }),
      (error) => {
        assert.ok(error instanceof EnvValidationError);
        assert.equal(error.errors.length, 5);
        assert.deepEqual(error.variables, [
          "DATABASE_URL",
          "JWT_SECRET",
          "PORT",
          "DEBUG",
          "NODE_ENV",
        ]);
        assert.match(error.message, /5 errors/);
        // Every variable is mentioned, not just the first one.
        for (const variable of error.variables) {
          assert.match(error.message, new RegExp(variable));
        }
        return true;
      },
    );
  });
});

describe("custom error messages", () => {
  it("uses a custom message for a type mismatch", () => {
    assert.throws(
      () =>
        validateEnv(
          { PORT: { type: "number", message: "PORT must be a port number between 1 and 65535" } },
          { PORT: "abc" },
        ),
      (error) => {
        assert.equal(error.errors[0].message, "PORT must be a port number between 1 and 65535");
        assert.match(error.message, /PORT: PORT must be a port number between 1 and 65535/);
        return true;
      },
    );
  });

  it("uses a custom message for missing and enum failures", () => {
    assert.throws(
      () =>
        validateEnv({ JWT_SECRET: { required: true, message: "Set JWT_SECRET in your .env file" } }, {}),
      /JWT_SECRET: Set JWT_SECRET in your \.env file/,
    );

    assert.throws(
      () =>
        validateEnv(
          {
            NODE_ENV: {
              type: "string",
              enum: ["development", "production"],
              message: "NODE_ENV must be development or production",
            },
          },
          { NODE_ENV: "staging" },
        ),
      /NODE_ENV: NODE_ENV must be development or production/,
    );
  });
});

describe("secrets", () => {
  it("never includes environment values in error messages", () => {
    const secret = "super-secret-value-1234";
    const secretNumber = "9876-this-is-secret";

    assert.throws(
      () =>
        validateEnv(
          {
            JWT_SECRET: { type: "boolean" },
            API_TOKEN: { type: "url" },
          },
          { JWT_SECRET: secret, API_TOKEN: secretNumber },
        ),
      (error) => {
        assert.ok(error instanceof EnvValidationError);
        assert.doesNotMatch(error.message, /super-secret-value-1234/);
        assert.doesNotMatch(error.message, /9876-this-is-secret/);
        for (const entry of error.errors) {
          assert.doesNotMatch(entry.message, /super-secret/);
          assert.doesNotMatch(entry.message, /9876-this-is-secret/);
        }
        return true;
      },
    );
  });
});

describe("invalid configuration schemas", () => {
  it("rejects a non-object schema", () => {
    for (const schema of [null, undefined, "PORT", 42, ["PORT"]]) {
      assert.throws(() => validateEnv(schema, {}), TypeError);
    }
  });

  it("rejects non-object variable definitions", () => {
    for (const field of [null, "number", 42, []]) {
      assert.throws(() => validateEnv({ PORT: field }, {}), TypeError);
    }
  });

  it("rejects unsupported types", () => {
    assert.throws(
      () => validateEnv({ PORT: { type: "integer" } }, {}),
      /unsupported type "integer".*Supported types are: string, number, boolean, url/s,
    );
  });

  it("rejects unknown options", () => {
    assert.throws(
      () => validateEnv({ PORT: { type: "number", requird: true } }, {}),
      /unknown option\(s\): requird/,
    );
  });

  it("rejects a non-boolean required flag", () => {
    assert.throws(() => validateEnv({ PORT: { required: "yes" } }, {}), /"required" must be a boolean/);
  });

  it("rejects a non-string custom message", () => {
    assert.throws(() => validateEnv({ PORT: { message: 42 } }, {}), /"message" must be a string/);
  });

  it("rejects malformed enum definitions", () => {
    assert.throws(() => validateEnv({ A: { enum: "one" } }, {}), /"enum" must be a non-empty array/);
    assert.throws(() => validateEnv({ A: { enum: [] } }, {}), /"enum" must be a non-empty array/);
    assert.throws(
      () => validateEnv({ PORT: { type: "number", enum: ["3000"] } }, {}),
      /every "enum" value must be of the declared type "number"/,
    );
    assert.throws(
      () => validateEnv({ URL: { type: "url", enum: ["not a url"] } }, {}),
      /enum value is not a valid URL/,
    );
  });

  it("rejects an env source that is not an object", () => {
    assert.throws(() => validateEnv({ PORT: { type: "number" } }, "PORT=3000"), TypeError);
    assert.throws(() => validateEnv({ PORT: { type: "number" } }, ["PORT=3000"]), TypeError);
  });

  it("rejects Date, Map and Set objects as schema definitions", () => {
    for (const schema of [new Date(), new Map(), new Set()]) {
      assert.throws(() => validateEnv(schema, {}), TypeError);
    }

    for (const field of [new Date(), new Map(), new Set()]) {
      assert.throws(() => validateEnv({ PORT: field }, {}), TypeError);
    }

    assert.throws(
      () => validateEnv({ PORT: new Date() }, {}),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.match(error.message, /must be a plain object/);
        return true;
      },
    );
  });
});

describe("required variables with defaults", () => {
  it("uses the default when a required variable is missing", () => {
    const config = validateEnv(
      { PORT: { type: "number", required: true, default: 3000 } },
      {},
    );

    assert.deepEqual(config, { PORT: 3000 });
  });

  it("uses the default when a required variable is empty", () => {
    const config = validateEnv(
      { PORT: { type: "number", required: true, default: 3000 } },
      { PORT: "   " },
    );

    assert.deepEqual(config, { PORT: 3000 });
  });

  it("still reports a required variable that has no default", () => {
    assert.throws(
      () => validateEnv({ PORT: { type: "number", required: true } }, {}),
      /PORT: is required but was not set/,
    );
  });
});

describe("custom env objects", () => {
  it("accepts numeric and boolean values", () => {
    assert.deepEqual(validateEnv({ PORT: { type: "number" } }, { PORT: 8080 }), { PORT: 8080 });
    assert.deepEqual(validateEnv({ DEBUG: { type: "boolean" } }, { DEBUG: true }), {
      DEBUG: true,
    });
    assert.deepEqual(validateEnv({ DEBUG: { type: "boolean" } }, { DEBUG: false }), {
      DEBUG: false,
    });
  });

  it("stringifies non-string primitive values", () => {
    assert.deepEqual(validateEnv({ NAME: { type: "string" } }, { NAME: 42 }), { NAME: "42" });
  });

  it("treats null and undefined as missing", () => {
    const config = validateEnv(
      {
        A: { type: "string", default: "a" },
        B: { type: "string", default: "b" },
      },
      { A: null, B: undefined },
    );

    assert.deepEqual(config, { A: "a", B: "b" });
  });

  it("rejects object, function and symbol values", () => {
    for (const value of [{}, [], () => "value", Symbol("value"), new Date()]) {
      assert.throws(
        () => validateEnv({ PORT: { type: "number" } }, { PORT: value }),
        TypeError,
        `expected ${String(value)} to be rejected`,
      );
    }
  });

  it("ignores inherited properties on the env source", () => {
    const env = Object.create({ PORT: "8080" });
    assert.deepEqual(validateEnv({ PORT: { type: "number" } }, env), {});
  });
});

describe("EnvValidationError", () => {
  it("is an instance of Error", () => {
    try {
      validateEnv({ JWT_SECRET: { type: "string", required: true } }, {});
      assert.fail("expected validateEnv to throw");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error instanceof EnvValidationError);
      assert.equal(error.name, "EnvValidationError");
      assert.equal(typeof error.stack, "string");
    }
  });

  it("exposes the failed variable names through the variables getter", () => {
    const error = new EnvValidationError([
      { variable: "PORT", message: "must be a valid number.", kind: "type" },
      { variable: "NODE_ENV", message: "must be one of: production.", kind: "enum" },
      { variable: "JWT_SECRET", message: "is required but was not set.", kind: "missing" },
    ]);

    assert.deepEqual(error.variables, ["PORT", "NODE_ENV", "JWT_SECRET"]);
    assert.deepEqual(error.errors.map((entry) => entry.kind), ["type", "enum", "missing"]);
  });

  it("reports variable names for a real validation failure", () => {
    assert.throws(
      () =>
        validateEnv(
          { PORT: { type: "number" }, JWT_SECRET: { type: "string", required: true } },
          { PORT: "abc" },
        ),
      (error) => {
        assert.deepEqual(error.variables, ["PORT", "JWT_SECRET"]);
        return true;
      },
    );
  });

  it("handles an empty errors array", () => {
    const error = new EnvValidationError([]);
    assert.deepEqual(error.variables, []);
    assert.match(error.message, /0 errors/);
  });
});

describe("__proto__ as a schema key", () => {
  const schema = JSON.parse('{"__proto__":{"type":"string","required":true}}');

  it("validates it like any other variable", () => {
    // A computed key (or JSON.parse) creates an own `__proto__` property; an
    // object literal `{ __proto__: "value" }` would only set the prototype.
    const config = validateEnv(schema, { ["__proto__"]: "value" });

    assert.ok(Object.hasOwn(config, "__proto__"));
    assert.equal(Object.getOwnPropertyDescriptor(config, "__proto__").value, "value");
    assert.equal(Object.getPrototypeOf(config), Object.prototype);
  });

  it("does not read Object.prototype as a value", () => {
    assert.throws(
      () => validateEnv(schema, {}),
      (error) => {
        assert.ok(error instanceof EnvValidationError);
        assert.deepEqual(error.variables, ["__proto__"]);
        assert.equal(error.errors[0].kind, "missing");
        return true;
      },
    );
  });

  it("does not pollute Object.prototype", () => {
    validateEnv(schema, { ["__proto__"]: "value" });

    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.equal(Object.getPrototypeOf(Object.prototype), null);
    assert.equal({}.value, undefined);
  });
});

describe("two-phase validation", () => {
  it("reports schema errors before environment errors", () => {
    assert.throws(
      () =>
        validateEnv(
          { PORT: { type: "number" }, RETRIES: { type: "integer" } },
          { PORT: "not-a-port" },
        ),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.ok(!(error instanceof EnvValidationError));
        assert.match(error.message, /unsupported type "integer"/);
        return true;
      },
    );
  });

  it("validates the whole schema before checking any value", () => {
    const cases = [
      { schema: { A: { type: "string" }, B: { type: "number", requird: true } } },
      { schema: { A: { type: "string" }, B: { type: "number", default: "nope" } } },
      { schema: { A: { type: "string" }, B: { enum: [] } } },
      { schema: { A: { type: "string" }, B: new Date() } },
    ];

    for (const { schema } of cases) {
      assert.throws(
        () => validateEnv(schema, { A: "" }),
        (error) => {
          assert.ok(error instanceof TypeError);
          assert.ok(!(error instanceof EnvValidationError));
          return true;
        },
      );
    }
  });

  it("still aggregates every environment error after the schema is valid", () => {
    assert.throws(
      () =>
        validateEnv(
          {
            PORT: { type: "number" },
            DEBUG: { type: "boolean" },
            JWT_SECRET: { type: "string", required: true },
          },
          { PORT: "abc", DEBUG: "maybe" },
        ),
      (error) => {
        assert.ok(error instanceof EnvValidationError);
        assert.deepEqual(error.variables, ["PORT", "DEBUG", "JWT_SECRET"]);
        return true;
      },
    );
  });
});

describe("integration with process.env", () => {
  it("reads from process.env by default", () => {
    process.env.ENVGUARD_TEST_PORT = "4321";

    try {
      const config = validateEnv({ ENVGUARD_TEST_PORT: { type: "number", required: true } });
      assert.deepEqual(config, { ENVGUARD_TEST_PORT: 4321 });
    } finally {
      delete process.env.ENVGUARD_TEST_PORT;
    }
  });
});
