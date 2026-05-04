import { WebSocket } from 'ws';
import { aiService } from '../../services/ai.service.js';
import { redisService } from '../../services/redis.service.js';
import Retell from "retell-sdk";
import { env } from '../../config/env.js';
import { Request, Response } from 'express';
const retellClient = new Retell({
    apiKey:env.RETELL_API_KEY
});
export const voiceController = {
  async createWebCall(req: Request, res: Response): Promise<void> {
    try {
      // In a real app, agentId comes from the Company database record. 
      // For now, hardcode the Agent ID you got from the Retell Dashboard.
      const agentId = "YOUR_RETELL_AGENT_ID"; 
      const { sessionId, companyId } = req.body;

      // Ask Retell to prepare a web call and attach our shared variables
      const webCallResponse = await retellClient.call.createWebCall({
        agent_id: agentId,
        retell_llm_dynamic_variables: {
          sessionId: sessionId,
          companyId: companyId
        }
      });

      // Send the secure token to the React/Vanilla JS widget
      res.status(200).json({ accessToken: webCallResponse.access_token });
    } catch (error) {
      console.error("Error creating web call:", error);
      res.status(500).json({ error: "Failed to initialize call" });
    }
  },  
  handleStream(ws: WebSocket) {
    let callId = '';
    let sessionId = '';
    let companyId = '';

    ws.on('message', async (data: Buffer) => {
      const event = JSON.parse(data.toString());

      if (event.type === 'config') {
        callId = event.call_id;
        
        // CRITICAL UPDATE: Retell allows passing custom variables from the frontend widget.
        // We extract the exact same sessionId used in the text chat so they share memory.
        sessionId = event.dynamic_variables?.sessionId || callId;
        companyId = event.dynamic_variables?.companyId || "YOUR_TEST_COMPANY_ID";

        console.log(`[${callId}] Call started. Hooked into Session: ${sessionId}`);
      }

      if (event.type === 'message' && event.message.role === 'user') {
        console.log(`[${callId}] User said: ${event.message.content}`);

        try {
          // 1. Fetch Shared History from Upstash (Redis)
          let chatHistory = await redisService.getSessionHistory(sessionId);
          
          // 2. Strip out old system prompts to avoid bloat
          chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

          // 3. Generate the current time to prevent date hallucinations
          const currentDateTime = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Kolkata',
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          });

          // 4. Inject the EXACT same state machine prompt + a Voice modifier
          const systemPrompt = `
          You are the AI dispatch assistant for a plumbing company. You are currently speaking to the user over a VOICE CALL. Keep your responses conversational, natural, and relatively brief so the user doesn't have to listen to a long monologue.
          Current Time: ${currentDateTime}

          CRITICAL WORKFLOW - You must follow these steps strictly one by one. NEVER skip a step.
          Step 1. If the user hasn't described the issue, ask them to describe it.
          Step 2. Once the issue is understood, ASK the user what date they want the plumber to come. (DO NOT guess the date. WAIT for their response).
          Step 3. ONLY AFTER the user explicitly provides a date, use the 'checkCalendarAvailability' tool.
          Step 4. Present the open slots to the user.
          Step 5. Once they pick a slot, ask for their Full Name, Email, and Phone Number.
          Step 6. Once you have all details, use the 'bookAppointment' tool.

          STRICT RULES:
          - NEVER assume or hallucinate a date. You must ask.
          - Take the conversation exactly one step at a time.
          `;

          // 5. Append prompt and current user voice message
          chatHistory.unshift({ role: "system", content: systemPrompt });
          chatHistory.push({ role: "user", content: event.message.content });

          // 6. Feed the synchronized history to Groq
          const aiResponse = await aiService.generateResponse(chatHistory, companyId);

          // 7. Save updated history back to Redis (So the text widget can see it immediately!)
          await redisService.saveSessionHistory(sessionId, aiResponse.updatedMessages);

          // 8. Send the AI's text back to Retell to be spoken aloud
          const responsePayload = {
            response_id: event.message.response_id,
            content: aiResponse.reply,
            content_complete: true,
            end_call: false
          };
          
          ws.send(JSON.stringify(responsePayload));
          
        } catch (error) {
          console.error("Voice AI Error:", error);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[${callId}] Call disconnected.`);
    });
  }
};