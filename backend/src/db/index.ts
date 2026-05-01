import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../config/env.js";

// 1. Initialize a PostgreSQL connection pool using the standard 'pg' driver
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

// 2. Wrap the pool in Prisma's PostgreSQL adapter
const adapter = new PrismaPg(pool);

// 3. Pass the adapter to the PrismaClient constructor
export const db = new PrismaClient({ adapter });