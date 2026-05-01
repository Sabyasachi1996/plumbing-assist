import app from "./app.js";
import { db } from "./db/index.js";
import { env } from "./config/env.js";

const startServer = async () => {
  try {
    // Verify database connection before starting
    await db.$connect();
    console.log("✅ Successfully connected to Supabase PostgreSQL.");

    app.listen(env.PORT, () => {
      console.log(`🚀 Server is listening on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();