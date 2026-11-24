#!/usr/bin/env node
/**
 * setup-env.js
 *
 * Creates .env and backend/.env from their .env.example templates, with
 * freshly generated random MongoDB root credentials instead of either
 * leaving them blank for the operator to invent, or — the real risk this
 * script exists to avoid — letting someone copy the example file's
 * literal placeholder credentials (some_admin/some_password) straight
 * into a real deployment. Never overwrites an existing .env, so it's
 * safe to run again later (e.g. after a fresh `git pull`).
 *
 * Usage: node scripts/setup-env.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

function randomToken(bytes) {
  // base64url: alphanumeric + "-"/"_" only, safe to embed directly in a
  // MongoDB connection URI with no further escaping needed.
  return crypto.randomBytes(bytes).toString("base64url");
}

function writeEnv(examplePath, envPath, transform) {
  if (fs.existsSync(envPath)) {
    console.log(`${path.relative(ROOT, envPath)} already exists — skipping.`);
    return false;
  }
  if (!fs.existsSync(examplePath)) {
    console.error(`${path.relative(ROOT, examplePath)} not found, cannot generate ${envPath}.`);
    process.exitCode = 1;
    return false;
  }
  const content = transform(fs.readFileSync(examplePath, "utf8"));
  fs.writeFileSync(envPath, content);
  console.log(`Created ${path.relative(ROOT, envPath)}.`);
  return true;
}

const username = "agora_" + randomToken(6);
const password = randomToken(24);

function setCredentials(content) {
  return content
    .replace(/^MONGO_ROOT_USERNAME=.*$/m, `MONGO_ROOT_USERNAME=${username}`)
    .replace(/^MONGO_ROOT_PASSWORD=.*$/m, `MONGO_ROOT_PASSWORD=${password}`);
}

const madeRoot = writeEnv(
  path.join(ROOT, ".env.example"),
  path.join(ROOT, ".env"),
  setCredentials,
);

const madeBackend = writeEnv(
  path.join(ROOT, "backend", ".env.example"),
  path.join(ROOT, "backend", ".env"),
  (content) =>
    setCredentials(content).replace(
      /^MONGO_URI=mongodb:\/\/[^@]*@mongodb:27017(.*)$/m,
      `MONGO_URI=mongodb://${username}:${password}@mongodb:27017$1`,
    ),
);

if (madeRoot || madeBackend) {
  console.log(
    "\nGenerated MongoDB root credentials (same ones in both files):\n" +
      `  username: ${username}\n` +
      `  password: ${password}\n` +
      "\nSave these if you need direct DB access (e.g. MongoDB Compass) — " +
      "they aren't printed again. Other values in the generated files " +
      "(ARCGIS_API_KEY, PORT, ...) are left as the example's, fill those in " +
      "by hand as needed.",
  );
}
