import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";

// Initialize Upstash Redis via REST
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const redisService = {
  // Pull the array of previous messages for a specific session
  async getSessionHistory(sessionId: string): Promise<any[]> {
    try {
      const history = await redis.get<any[]>(`session:${sessionId}`);
      return history || [];
    } catch (error) {
      console.error("Redis Get Error:", error);
      return [];
    }
  },

  // Save the updated conversation array back to Redis
  async saveSessionHistory(sessionId: string, messages: any[]): Promise<void> {
    try {
      // The "ex: 7200" sets a strict 2-hour TTL (7200 seconds)
      await redis.set(`session:${sessionId}`, messages, { ex: 7200 });
    } catch (error) {
      console.error("Redis Save Error:", error);
    }
  },
};