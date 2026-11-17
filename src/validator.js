import { EnvValidationError } from "./errors.js";

const SUPPORTED_TYPES = ["string", "number", "boolean", "url"];
const ALLOWED_FIELD_KEYS = ["type", "required", "default", "enum", "message"];
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const TRUE_VALUES = ["true", "1"];
const FALSE_VALUES = ["false", "0"];

/**
 * Validates, converts and fills defaults for environment variables.
 *
 * Validation happens in two phases:
 *
 * 1. The whole schema is validated and normalized. A malformed schema is a
 *    developer error and throws `TypeError` before any environment value is
 *    inspected.
 * 2. Every normalized specification is checked against the environment and all
 *    failures are collected into a single `EnvValidationError`.
 *
 * @param {Record<string, object>} schema - Variable definitions keyed by env var name.
 * @param {Record<string, string | number | boolean | undefined | null>} [env=process.env]
 *   Environment source. Override this in tests instead of mutating `process.env`.
 * @returns {Record<string, string | number | boolean>} A new configuration object.
 * @throws {EnvValidationError} If any variable fails validation.
 * @throws {TypeError} If the schema itself is malformed.
 */
export function validateEnv(schema, env = process.env) {
  assertPlainObject(schema, "schema", "validateEnv() expects a schema object");

  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new TypeError("validateEnv() expects `env` to be an object such as process.env.");
  }

  // Phase 1: validate and normalize the entire schema up front. Any schema
  // mistake throws here, so environment errors are never reported for a schema
  // that is itself invalid.
  /** @type {Array<[string, object]>} */
  const specs = Object.entries(schema).map(([name, field]) => [name, normalizeSpec(name, field)]);

  // Phase 2: validate environment values for the normalized specifications.
  const config = {};
  /** @type {Array<{ variable: string, message: string, kind: string }>} */
  const errors = [];

  for (const [name, spec] of specs) {
    const raw = readRawValue(env, name);

    if (raw === undefined) {
      if (spec.default !== undefined) {
        setConfigValue(config, name, spec.default);
        continue;
      }

      if (spec.required) {
        errors.push({
          variable: name,
          kind: "missing",
          message: spec.message ?? `is required but was not set.${expectedHint(spec.type)}`,
        });
      }
      continue;
    }

    const result = convertValue(raw, spec.type);

    if (!result.ok) {
      errors.push({
        variable: name,
        kind: "type",
        message: spec.message ?? result.reason,
      });
      continue;
    }

    if (spec.enum && !spec.enum.includes(result.value)) {
      errors.push({
        variable: name,
        kind: "enum",
        message: spec.message ?? `must be one of: ${spec.enum.join(", ")}.`,
      });
      continue;
    }

    setConfigValue(config, name, result.value);
  }

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }

  return config;
}

/**
 * Defines an own property on the result object. Using `defineProperty` (rather
 * than assignment) keeps keys such as `__proto__` from reaching the prototype
 * setter and mutating the object's prototype.
 */
function setConfigValue(config, name, value) {
  Object.defineProperty(config, name, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * Returns a trimmed environment value, or `undefined` when unset/empty.
 *
 * Only own properties are read, so a schema key like `__proto__` cannot pick up
 * `Object.prototype`. String, number and boolean values are accepted; objects,
 * functions and symbols are rejected because they have no meaningful textual
 * form (and `String(value)` would produce misleading values like `[object Object]`).
 */
function readRawValue(env, name) {
  if (!Object.hasOwn(env, name)) {
    return undefined;
  }

  const value = env[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  const valueType = typeof value;

  if (valueType !== "string" && valueType !== "number" && valueType !== "boolean") {
    throw new TypeError(
      `Environment variable "${name}" must be a string, number or boolean; ` +
        `received ${describeValue(value)}.`,
    );
  }

  const text = String(value).trim();

  return text === "" ? undefined : text;
}

/**
 * Validates a single variable definition and returns it in a normalized shape.
 * Schema mistakes are developer errors, so they throw `TypeError` immediately.
 */
function normalizeSpec(name, field) {
  assertPlainObject(field, name, `Configuration for "${name}" must be a plain object`);

  const unknownKeys = Object.keys(field).filter((key) => !ALLOWED_FIELD_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(
      `Configuration for "${name}" has unknown option(s): ${unknownKeys.join(", ")}. ` +
        `Allowed options are: ${ALLOWED_FIELD_KEYS.join(", ")}.`,
    );
  }

  const type = field.type ?? "string";

  if (!SUPPORTED_TYPES.includes(type)) {
    throw new TypeError(
      `Configuration for "${name}" has an unsupported type "${type}". ` +
        `Supported types are: ${SUPPORTED_TYPES.join(", ")}.`,
    );
  }

  if (field.required !== undefined && typeof field.required !== "boolean") {
    throw new TypeError(`Configuration for "${name}": "required" must be a boolean.`);
  }

  if (field.message !== undefined && typeof field.message !== "string") {
    throw new TypeError(`Configuration for "${name}": "message" must be a string.`);
  }

  const enumValues = normalizeEnum(name, field.enum, type);
  const defaultValue = normalizeDefault(name, field.default, type, enumValues);

  return {
    type,
    required: field.required === true,
    default: defaultValue,
    enum: enumValues,
    message: field.message,
  };
}

function normalizeEnum(name, enumValues, type) {
  if (enumValues === undefined) {
    return undefined;
  }

  if (!Array.isArray(enumValues) || enumValues.length === 0) {
    throw new TypeError(
      `Configuration for "${name}": "enum" must be a non-empty array of allowed values.`,
    );
  }

  const expectedJsType = type === "url" ? "string" : type;

  for (const value of enumValues) {
    if (typeof value !== expectedJsType) {
      throw new TypeError(
        `Configuration for "${name}": every "enum" value must be of the declared type ` +
          `"${type}" (found ${typeof value}).`,
      );
    }

    if (type === "url" && convertValue(String(value), "url").ok === false) {
      throw new TypeError(`Configuration for "${name}": enum value is not a valid URL.`);
    }
  }

  return [...enumValues];
}

function normalizeDefault(name, value, type, enumValues) {
  if (value === undefined) {
    return undefined;
  }

  const result = convertValue(value, type);

  if (!result.ok) {
    throw new TypeError(
      `Configuration for "${name}": the default value ${result.reason} Expected type "${type}".`,
    );
  }

  if (enumValues && !enumValues.includes(result.value)) {
    throw new TypeError(
      `Configuration for "${name}": the default value must be one of the enum values: ` +
        `${enumValues.join(", ")}.`,
    );
  }

  return result.value;
}

/**
 * Converts a raw value to the declared type.
 *
 * @returns {{ ok: true, value: string | number | boolean } | { ok: false, reason: string }}
 *   Failure reasons never contain the received value.
 */
function convertValue(raw, type) {
  const text = String(raw).trim();

  switch (type) {
    case "string":
      return { ok: true, value: text };

    case "number": {
      if (!NUMBER_PATTERN.test(text)) {
        return { ok: false, reason: "must be a valid number." };
      }
      const value = Number(text);
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, reason: "must be a valid number." };
    }

    case "boolean": {
      const lower = text.toLowerCase();
      if (TRUE_VALUES.includes(lower)) return { ok: true, value: true };
      if (FALSE_VALUES.includes(lower)) return { ok: true, value: false };
      return {
        ok: false,
        reason: 'must be a boolean ("true", "false", "1" or "0").',
      };
    }

    case "url": {
      if (!URL_PATTERN.test(text)) {
        return { ok: false, reason: "must be a valid absolute URL." };
      }
      try {
        const value = new URL(text);
        return value.hostname || value.protocol.startsWith("file:")
          ? { ok: true, value: text }
          : { ok: false, reason: "must be a valid absolute URL." };
      } catch {
        return { ok: false, reason: "must be a valid absolute URL." };
      }
    }

    default:
      // Unreachable: normalizeSpec() rejects unsupported types first.
      return { ok: false, reason: "has an unsupported type." };
  }
}

function expectedHint(type) {
  switch (type) {
    case "number":
      return ' Expected a number, for example "3000".';
    case "boolean":
      return ' Expected "true", "false", "1" or "0".';
    case "url":
      return ' Expected an absolute URL, for example "https://example.com".';
    default:
      return "";
  }
}

/**
 * True only for object literals and `Object.create(null)` objects. Arrays,
 * Dates, Maps, Sets and other class instances are not valid schemas or
 * variable definitions.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label, message) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${message}; received ${describeValue(value)} for "${label}".`);
  }
}

function describeValue(value) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return "an array";
  }

  if (typeof value !== "object") {
    return `a ${typeof value}`;
  }

  const constructorName = value.constructor?.name;

  return constructorName ? `a ${constructorName}` : "an object";
}
