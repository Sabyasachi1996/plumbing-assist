import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const redisService = {
  async getSessionHistory(sessionId: string): Promise<any[]> {
    try {
      const history = await redis.get<any[]>(`session:${sessionId}`);
      return history || [];
    } catch (error) {
      logger.error(`Redis Get Error for session ${sessionId}:`, error);
      return [];
    }
  },

  async saveSessionHistory(sessionId: string, messages: any[]): Promise<void> {
    try {
      await redis.set(`session:${sessionId}`, messages, { ex: 7200 });
    } catch (error) {
      logger.error(`Redis Save Error for session ${sessionId}:`, error);
    }
  },
  
  async saveCallVariables(callId: string, variables: { sessionId: string, companyId: string }) {
    try {
      await redis.set(`call_vars_${callId}`, JSON.stringify(variables), { ex: 3600 });
    } catch (error) {
      logger.error(`Redis Save Call Variables Error for call ${callId}:`, error);
    }
  },

  async getCallVariables(callId: string) {
    try {
      const data = await redis.get(`call_vars_${callId}`);
      if (!data) return null;

      if (typeof data === 'object') {
        return data;
      }
      return JSON.parse(data as string);
    } catch (error) {
      logger.error(`Redis Get Call Variables Error for call ${callId}:`, error);
      return null;
    }
  }
};