import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 8080,
  DATABASE_URL: process.env.DATABASE_URL as string,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL as string,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,
  GROQ_API_KEY: process.env.GROQ_API_KEY as string,
  RETELL_API_KEY: process.env.RETELL_API_KEY as string,
  AI_PROVIDER: (process.env.AI_PROVIDER || "gemini") as "gemini" | "groq",
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || ""
};