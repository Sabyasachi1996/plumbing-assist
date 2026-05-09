import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// 1. DEFINE THE STRICT TYPING FOR OUR STATE MACHINE
export interface SessionState {
  currentState: string;
  retries: number;
  // Memory block to maintain context across state transitions
  issueDescription?: string;
  imageAnalyzed?: boolean;
  selectedDate?: string;
  selectedSlot?: string;
  customerDetails?: {
    name: string;
    email: string;
    phone: string;
  };
  trackingToken?: string;
}

export const redisService = {
  // =========================================================
  // 1. STATE MACHINE MANAGEMENT (NEW)
  // =========================================================
  
  async getSessionState(sessionId: string): Promise<SessionState> {
    try {
      const state = await redis.get<SessionState>(`state:${sessionId}`);
      // Default to STATE 1 if no state exists yet
      return state || { currentState: "STATE_1_ISSUE_GATHERING", retries: 0 };
    } catch (error) {
      logger.error(`Redis Get State Error for session ${sessionId}:`, error);
      return { currentState: "STATE_1_ISSUE_GATHERING", retries: 0 };
    }
  },

  async saveSessionState(sessionId: string, state: SessionState): Promise<void> {
    try {
      await redis.set(`state:${sessionId}`, state, { ex: 7200 }); // Expires in 2 hours
    } catch (error) {
      logger.error(`Redis Save State Error for session ${sessionId}:`, error);
    }
  },

  // Helper to easily increment retries when the user disobeys
  async incrementRetry(sessionId: string): Promise<SessionState> {
    const state = await this.getSessionState(sessionId);
    state.retries += 1;
    await this.saveSessionState(sessionId, state);
    return state;
  },

  // Helper to easily bump to the next state, save data, and reset retries
  async transitionState(sessionId: string, newState: string, partialData: Partial<SessionState> = {}): Promise<SessionState> {
    const state = await this.getSessionState(sessionId);
    const updatedState = { 
      ...state, 
      ...partialData,       // Inject new data (e.g., the chosen slot or issue)
      currentState: newState, 
      retries: 0            // Reset retries back to 0 on a successful step!
    };
    await this.saveSessionState(sessionId, updatedState);
    return updatedState;
  },

  // =========================================================
  // 2. CHAT HISTORY MANAGEMENT (WITH SLIDING WINDOW)
  // =========================================================
  
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
      // 1. Scrub the massive system prompt so it never wastes Redis memory
      const historyWithoutSystem = messages.filter(m => m.role !== 'system');
      // 2. Safe Sliding Window: Keep the last 15 messages intact
      const recentHistory = historyWithoutSystem.slice(-15);
      
      await redis.set(`session:${sessionId}`, recentHistory, { ex: 7200 });
    } catch (error) {
      logger.error(`Redis Save Error for session ${sessionId}:`, error);
    }
  },
  
  // =========================================================
  // 3. CALL ROUTING VARIABLES
  // =========================================================
  
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