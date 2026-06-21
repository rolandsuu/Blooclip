import assert from "node:assert/strict";
import test from "node:test";

import { isAuthDisabled, isAuthDisabledForDev } from "./dev-auth.ts";

const originalAuthDisabled = process.env.AUTH_DISABLED;
const originalAuthDisabledForDev = process.env.AUTH_DISABLED_FOR_DEV;
const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function restoreEnv() {
  process.env.AUTH_DISABLED = originalAuthDisabled;
  process.env.AUTH_DISABLED_FOR_DEV = originalAuthDisabledForDev;
  setNodeEnv(originalNodeEnv);
}

test.afterEach(restoreEnv);

test("AUTH_DISABLED disables auth in production", () => {
  setNodeEnv("production");
  process.env.AUTH_DISABLED = "true";
  process.env.AUTH_DISABLED_FOR_DEV = "false";

  assert.equal(isAuthDisabled(), true);
});

test("AUTH_DISABLED_FOR_DEV remains local-only", () => {
  setNodeEnv("production");
  process.env.AUTH_DISABLED = "false";
  process.env.AUTH_DISABLED_FOR_DEV = "true";

  assert.equal(isAuthDisabledForDev(), false);
  assert.equal(isAuthDisabled(), false);

  setNodeEnv("development");

  assert.equal(isAuthDisabledForDev(), true);
  assert.equal(isAuthDisabled(), true);
});

test("auth stays enabled when neither bypass flag is set", () => {
  setNodeEnv("production");
  process.env.AUTH_DISABLED = "false";
  process.env.AUTH_DISABLED_FOR_DEV = "false";

  assert.equal(isAuthDisabledForDev(), false);
  assert.equal(isAuthDisabled(), false);
});
