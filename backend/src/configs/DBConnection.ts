/**
 * DBConnection.ts
 * Singleton MongoDB connection — call connectDB() once at startup, then getDB() anywhere else.
 */

import { MongoClient, Db } from "mongodb";
import { createModuleLogger } from "../logger/logger";

const logger = createModuleLogger("MongoDB");

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db) return db;

  const url = process.env.MONGO_URI;
  if (!url) {
    logger.error("MONGO_URI env is not defined.");
    throw new Error("MONGO_URI env is not defined.");
  }

  client = new MongoClient(url);
  await client.connect();
  db = client.db();

  logger.info("Connection to MongoDB established.");
  return db;
}

export function getDB(): Db {
  if (!db) {
    logger.error("Database connection not initialized");
    throw new Error("Database connection not initialized");
  }
  return db;
}

export async function closeDB(): Promise<void> {
  await client?.close();
  db = null;
  logger.info("MongoDB connection closed");
}
