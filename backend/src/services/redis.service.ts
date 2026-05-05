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
  // Save the mapping for 1 hour (expires automatically so your DB stays clean)
  async saveCallVariables(callId: string, variables: { sessionId: string, companyId: string }) {
    await redis.set(`call_vars_${callId}`, JSON.stringify(variables),{ ex: 3600 });
  },

  async getCallVariables(callId: string) {
    const data = await redis.get(`call_vars_${callId}`);
    
    if (!data) return null;

    // FIX: Upstash Redis automatically parses JSON into an object. 
    // If it's already an object, just return it directly!
    if (typeof data === 'object') {
      return data;
    }

    // Fallback just in case it was stored as a raw string
    return JSON.parse(data as string);
  }
};