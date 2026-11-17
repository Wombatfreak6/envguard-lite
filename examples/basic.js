/**
 * EnvGuard Lite — basic example.
 *
 * Run with: node examples/basic.js (or: npm run example)
 *
 * The package is imported by its own name (a Node.js "self reference"), so this
 * file works both from a clone of the repository and from an installed
 * node_modules/envguard-lite/examples/ directory.
 */
import { validateEnv, EnvValidationError } from "envguard-lite";

const schema = {
  PORT: { type: "number", default: 3000 },
  DATABASE_URL: { type: "url", required: true },
  JWT_SECRET: { type: "string", required: true },
  DEBUG: { type: "boolean", default: false },
  NODE_ENV: {
    type: "string",
    enum: ["development", "production", "test"],
    default: "development",
  },
};

// 1. A valid environment (values are passed explicitly so the example is reproducible).
const validConfig = validateEnv(schema, {
  DATABASE_URL: "postgresql://localhost:5432/mydb",
  JWT_SECRET: "secret",
});

console.log("Valid configuration:");
console.log(validConfig);

// 2. An invalid environment. All problems are reported at once.
try {
  validateEnv(schema, {
    DATABASE_URL: "localhost:5432",
    PORT: "not-a-port",
    DEBUG: "yes",
  });
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error("\nCaught EnvValidationError:");
    console.error(error.message);

    // The same information is available programmatically.
    console.error(
      "\nFailed variables:",
      error.errors.map((entry) => `${entry.variable} (${entry.kind})`),
    );
  } else {
    throw error;
  }
}

// 3. In a real app, validate process.env at startup:
//
//   const config = validateEnv(schema);
