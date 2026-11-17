# EnvGuard Lite

**Validate your environment variables at startup — before they break your app.**

EnvGuard Lite is a tiny, zero-dependency utility that checks your environment
variables against a schema, converts them to the right JavaScript types, and
throws one clear error listing everything that is wrong.

```js
import { validateEnv } from "envguard-lite";

const config = validateEnv({
  PORT: { type: "number", default: 3000 },
  DATABASE_URL: { type: "url", required: true },
  JWT_SECRET: { type: "string", required: true },
  DEBUG: { type: "boolean", default: false },
  NODE_ENV: {
    type: "string",
    enum: ["development", "production", "test"],
    default: "development",
  },
});

console.log(config.PORT); // 3000 (a number, not the string "3000")
```

---

## Contents

- [The problem](#the-problem)
- [Features](#features)
- [Installation](#installation)
- [Requirements](#requirements)
- [Loading .env files](#loading-env-files)
- [Basic usage](#basic-usage)
- [API](#api)
- [Supported data types](#supported-data-types)
- [Default values](#default-values)
- [Enum validation](#enum-validation)
- [Error handling](#error-handling)
- [Examples](#examples)
- [Running tests](#running-tests)
- [License](#license)

---

## The problem

Environment variables are always strings, and they are often missing:

```js
app.listen(process.env.PORT); // listens on a random port, or crashes
const debug = process.env.DEBUG; // "false" — which is truthy!
```

Failures like these show up deep inside your application, long after startup,
and usually one at a time. EnvGuard Lite moves that check to the very first
lines of your program and reports **every** problem at once:

```
Environment validation failed with 3 errors:
  - DATABASE_URL: is required but was not set. Expected an absolute URL, for example "https://example.com".
  - PORT: must be a valid number.
  - NODE_ENV: must be one of: development, production, test.
```

## Features

- **Required variables** — detect missing or empty values.
- **Type validation and conversion** — `string`, `number`, `boolean`, `url`.
- **Default values** — applied when a variable is missing, and validated against their declared type.
- **Enum validation** — restrict a variable to a fixed set of values.
- **Custom error messages** — per variable, for cases where you want more context.
- **All errors at once** — a single `EnvValidationError` containing every failure.
- **No secret leakage** — error messages never include environment values.
- **Does not load `.env` files** — a pure function over the object you pass in; use dotenv or `node --env-file` to populate it.
- **Zero dependencies** — plain JavaScript, ES Modules, Node.js 18+.
- **Strict schemas** — typos in your schema (`requird: true`) fail loudly instead of being silently ignored.

## Installation

```bash
npm install envguard-lite
```

## Requirements

- Node.js **18 or later**
- **ES Modules only.** The package ships as ESM (`"type": "module"`) with no
  CommonJS build, so a CommonJS project has to load it dynamically:

```js
// CommonJS entry point (top-level await requires Node.js 18+)
const { validateEnv } = await import("envguard-lite");
```

or inside an `async` function. There is no `require("envguard-lite")` build.

## Loading .env files

**EnvGuard Lite does not read `.env` files, and it never modifies
`process.env`.** It is not a dotenv replacement: it only inspects an object you
give it (`process.env` by default). If your configuration lives in a `.env`
file, load it *before* calling `validateEnv`:

```bash
# Built into Node.js 20.6+ — nothing to install
node --env-file=.env app.js
```

```js
// Or with the dotenv package (install it separately; EnvGuard Lite has no dependencies)
import "dotenv/config";
import { validateEnv } from "envguard-lite";

const config = validateEnv({ PORT: { type: "number", required: true } });
```

Because validation is a pure function over the object you pass in, it also
works with secrets injected by your platform (Docker, CI, a secrets manager)
without any file on disk.

## Basic usage

Create a validation module and import it anywhere in your app:

```js
// config.js
import { validateEnv } from "envguard-lite";

export const config = validateEnv({
  PORT: { type: "number", default: 3000 },
  DATABASE_URL: { type: "url", required: true },
  JWT_SECRET: { type: "string", required: true },
  DEBUG: { type: "boolean", default: false },
  NODE_ENV: {
    type: "string",
    enum: ["development", "production", "test"],
    default: "development",
  },
});
```

```js
// index.js
import { config } from "./config.js";

console.log(config.PORT); // number
console.log(config.DEBUG); // boolean
```

Given this environment:

```bash
PORT=8080
DATABASE_URL=postgresql://localhost:5432/mydb
JWT_SECRET=secret
DEBUG=1
```

`config` is:

```js
{
  PORT: 8080,
  DATABASE_URL: "postgresql://localhost:5432/mydb",
  JWT_SECRET: "secret",
  DEBUG: true,
  NODE_ENV: "development"
}
```

Import `config.js` as early as possible (for example at the top of your entry
file) so validation runs before anything else.

## API

### `validateEnv(schema, env?)`

Validates environment variables and returns a **new** object containing the
validated and converted values.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `schema` | `object` | — | Variable definitions keyed by environment variable name. |
| `env` | `object` | `process.env` | Optional environment source. Useful for tests and for non-`process.env` sources. Values may be strings, numbers or booleans; they are treated exactly like strings (so `{ PORT: 8080 }` is accepted). |

**Returns:** a new configuration object. Variables that are optional and unset
are omitted from the result.

**Throws:**

- `TypeError` when the schema itself is invalid (a developer error).
- `TypeError` when a supplied `env` value is not a string, number or boolean.
- `EnvValidationError` when one or more variables fail validation.

The whole schema is validated **before** any environment value is inspected, so
a typo in the schema always produces a `TypeError` rather than an
`EnvValidationError` that happens to mention the first bad variable.

### Variable definition

```js
VARIABLE_NAME: {
  type: "string" | "number" | "boolean" | "url", // optional, defaults to "string"
  required: true,                                // optional, defaults to false
  default: <value>,                              // optional
  enum: [<allowed values>],                      // optional
  message: "custom error message",               // optional
}
```

| Option | Type | Description |
| --- | --- | --- |
| `type` | `string` | Declared type. One of `string`, `number`, `boolean`, `url`. Defaults to `string`. |
| `required` | `boolean` | When `true`, a missing or empty value is an error. |
| `default` | any | Value used when the variable is missing or empty. Must match `type` (and `enum`). |
| `enum` | `array` | Non-empty list of allowed values. Every entry must be of the declared `type`. |
| `message` | `string` | Custom error message for this variable. Replaces the default description; the variable name is still included. |

Unknown options are rejected with a `TypeError`, which catches typos early.

Variable definitions must be plain objects (`{}` or `Object.create(null)`).
`Date`, `Map`, `Set`, arrays and other class instances are rejected even though
they are technically "objects", because none of them can describe a variable.

Variable names are plain strings, including unusual ones such as `__proto__`.
That key is written to the result as a normal own property, so neither the
result object's prototype nor `Object.prototype` is ever modified.

### `EnvValidationError`

Thrown by `validateEnv` when validation fails.

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | `"EnvValidationError"` |
| `message` | `string` | Human-readable summary listing every failed variable. |
| `errors` | `Array<{ variable, message, kind }>` | Machine-readable list of failures. `kind` is `"missing"`, `"type"` or `"enum"`. |
| `variables` | `string[]` | Names of the variables that failed (getter). |

Because it extends `Error`, you can use `instanceof`:

```js
import { validateEnv, EnvValidationError } from "envguard-lite";

try {
  const config = validateEnv(schema);
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.variables); // ["DATABASE_URL", "PORT"]
    process.exit(1);
  }
  throw error;
}
```

## Supported data types

| Type | Accepted values | Result |
| --- | --- | --- |
| `string` | Any non-empty text | `"hello"` → `"hello"` |
| `number` | Plain decimal numbers, including negatives, decimals and exponents | `"3000"` → `3000`, `"-1.5"` → `-1.5`, `"2e3"` → `2000` |
| `boolean` | `true`/`false` (any casing) and `1`/`0` | `"true"` → `true`, `"0"` → `false` |
| `url` | Absolute URL with a scheme and host | `"https://example.com"` → `"https://example.com"` |

Notes:

- Values are trimmed before validation.
- Empty strings and whitespace-only values are treated as **missing**, so
  `PORT=""` fails a `required` check and falls back to a `default` if one exists.
- Numbers are validated strictly: `"12abc"`, `"0x10"`, `"Infinity"` and `"1,5"`
  are rejected rather than silently becoming `NaN` or `12`.
- URLs are returned as strings after being parsed with the WHATWG `URL` class, so
  `postgresql://`, `redis://` and similar schemes work. Bare hosts such as
  `localhost:5432` are rejected.
- For `url` variables, `enum` entries must themselves be valid URLs.

## Default values

Defaults are applied when a variable is missing or empty:

```js
const config = validateEnv({
  PORT: { type: "number", default: 3000 },
  DEBUG: { type: "boolean", default: false },
});
```

Default values are validated against their declared type **when the schema is
checked** (no need to wait for a missing variable):

```js
validateEnv({ PORT: { type: "number", default: "not-a-number" } });
// TypeError: Configuration for "PORT": the default value must be a valid number. Expected type "number".
```

An environment value always wins over a default. Defaults also satisfy `enum`
constraints.

### Required variables with defaults

`required: true` and `default` are not contradictory: the default is the value
the variable falls back to, and `required` only matters when there is no default
to fall back to. A required variable **with** a default therefore succeeds and
gets the default when it is missing or empty:

```js
validateEnv({ PORT: { type: "number", default: 3000, required: true } }, {});
// { PORT: 3000 }
```

If you want a variable to be truly mandatory, leave out `default`.

## Enum validation

```js
const config = validateEnv({
  NODE_ENV: {
    type: "string",
    enum: ["development", "production", "test"],
    default: "development",
  },
});
```

Values are converted first, then compared with the enum. This means numeric and
boolean enums work with string environment variables:

```js
validateEnv({ RETRIES: { type: "number", enum: [1, 2, 3] } }, { RETRIES: "2" });
// { RETRIES: 2 }

validateEnv({ NODE_ENV: { type: "string", enum: ["development"] } }, { NODE_ENV: "staging" });
// EnvValidationError: Environment validation failed with 1 error:
//   - NODE_ENV: must be one of: development.
```

## Error handling

All failures are collected before throwing, so you fix one round of problems
instead of restarting for each one:

```js
validateEnv(
  {
    DATABASE_URL: { type: "url", required: true },
    PORT: { type: "number" },
    NODE_ENV: { type: "string", enum: ["development", "production"] },
  },
  { PORT: "not-a-port", NODE_ENV: "staging" },
);
```

```
EnvValidationError: Environment validation failed with 3 errors:
  - DATABASE_URL: is required but was not set. Expected an absolute URL, for example "https://example.com".
  - PORT: must be a valid number.
  - NODE_ENV: must be one of: development, production.
```

### Custom error messages

```js
validateEnv(
  {
    JWT_SECRET: {
      type: "string",
      required: true,
      message: "Set JWT_SECRET in your .env file (see .env.example).",
    },
  },
  {},
);
```

```
Environment validation failed with 1 error:
  - JWT_SECRET: Set JWT_SECRET in your .env file (see .env.example).
```

### Secrets are never printed

Error messages describe **what** is expected, never the received value:

```
  - JWT_SECRET: must be a boolean ("true", "false", "1" or "0").
```

That is why it is safe to log `error.message` in CI logs.

### Invalid schemas

Mistakes in the schema are developer errors, so they throw `TypeError`
immediately:

| Mistake | Message |
| --- | --- |
| Schema is not a plain object | `validateEnv() expects a schema object; received null for "schema".` |
| Schema or variable definition is an array, `Date`, `Map`, `Set` or other class instance | `Configuration for "PORT" must be a plain object; received a Date for "PORT".` |
| `env` value is not a string, number or boolean | `Environment variable "PORT" must be a string, number or boolean; received an object.` |
| Unknown type | `Configuration for "PORT" has an unsupported type "integer". Supported types are: string, number, boolean, url.` |
| Unknown option | `Configuration for "PORT" has unknown option(s): requird. Allowed options are: type, required, default, enum, message.` |
| `enum` is not a non-empty array | `Configuration for "NODE_ENV": "enum" must be a non-empty array of allowed values.` |
| `enum` entry has the wrong type | `Configuration for "PORT": every "enum" value must be of the declared type "number" (found string).` |
| Invalid default | `Configuration for "PORT": the default value must be a valid number. Expected type "number".` |

## Examples

See [`examples/basic.js`](examples/basic.js). The `examples/` directory is
included in the published package (and in this repository), so the relative link
above works on GitHub and on npm:

```bash
# From a clone of the repository
npm run example
# or
node examples/basic.js

# From an installed copy
node node_modules/envguard-lite/examples/basic.js
```

It shows a successful validation, then a failing one with the collected errors.

### Using it in tests

Pass an explicit environment object instead of mutating `process.env`:

```js
import { validateEnv } from "envguard-lite";

const config = validateEnv(
  { PORT: { type: "number", default: 3000 } },
  { PORT: "8080" },
);

assert.equal(config.PORT, 8080);
```

Values in a custom env object may also be numbers or booleans; they are
converted the same way as strings:

```js
validateEnv({ PORT: { type: "number" } }, { PORT: 8080 }).PORT; // 8080
```

## Running tests

```bash
npm test
```

The test suite uses the built-in `node:test` and `node:assert` modules and
requires no dependencies.

## License

[MIT](LICENSE)
