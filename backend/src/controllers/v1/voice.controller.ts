import { WebSocket } from 'ws';
import { aiService } from '../../services/ai.service.js';
import { redisService } from '../../services/redis.service.js';
import Retell from "retell-sdk";
import { env } from '../../config/env.js';
import { Request, Response } from 'express';
import { IncomingMessage } from 'http';

// We ONLY use this Map to push unsolicited text-to-speech interruptions (like Image Uploads) to the active socket[cite: 5].
// We DO NOT use it for storing database variables anymore.
// Replace your current activeCalls line with this:
export const activeCalls = new Map<string, { ws: WebSocket, getResponseId: () => number }>();

const retellClient = new Retell({
    apiKey: env.RETELL_API_KEY
});

export const voiceController = {
  async createWebCall(req: Request, res: Response): Promise<void> {
    try {
      // In a real app, agentId comes from the Company database record[cite: 5]. 
      // For now, hardcode the Agent ID you got from the Retell Dashboard[cite: 5].
      const agentId = "agent_c5710c68d65c2f85add46c5cee"; 
      const { sessionId, companyId } = req.body;

      // Ask Retell to prepare a web call
      const webCallResponse = await retellClient.call.createWebCall({
        agent_id: agentId,
      });

      // 🔒 STORE SECURELY IN REDIS
      // We map Retell's unique call_id directly to your user's specific Session and Company.
      const safeCompanyId = companyId && companyId.trim() !== "" ? companyId : "123e4567-e89b-12d3-a456-426614174000";
      
      await redisService.saveCallVariables(webCallResponse.call_id, {
        sessionId: sessionId || `session_${Date.now()}`,
        companyId: safeCompanyId
      });

      // Send the secure token to the React/Vanilla JS widget[cite: 5]
      res.status(200).json({ accessToken: webCallResponse.access_token });
    } catch (error) {
      console.error("Error creating web call:", error);
      res.status(500).json({ error: "Failed to initialize call" });
    }
  },  
  
  // UPDATE: Make sure to add `req: Request` to the function parameters!
  handleStream(ws: WebSocket, req: IncomingMessage) {
    // 1. EXTRACT THE CALL ID DIRECTLY FROM THE URL
    const url = req.url || "";
    const urlParts = url.split('/');
    const callId = urlParts[urlParts.length - 1].split('?')[0];

    let sessionId = '';
    let companyId = '';
    let currentResponseId = 0;

    console.log(`🎙️ Retell AI connected for Call: ${callId}`);

    // 2. INSTANT REDIS LOOKUP (Happens before anyone even speaks!)
    redisService.getCallVariables(callId).then((callVars) => {
      if (callVars) {
        sessionId = callVars.sessionId;
        companyId = callVars.companyId;
        
        // Lock the socket in memory for the image upload interruption
        activeCalls.set(sessionId, {
            ws: ws,
            getResponseId: () => currentResponseId
        });
        console.log(`[${callId}] Redis Match Found! Synced to Session: ${sessionId}`);
      } else {
        console.error(`[${callId}] CRITICAL: No variables found in Redis for this call!`);
      }
    }).catch(err => console.error(`[${callId}] Redis Error:`, err));

    // 3. LISTEN FOR USER SPEECH
    ws.on('message', async (data: Buffer) => {
      try {
        const rawString = data.toString();
        const event = JSON.parse(rawString);
        if (event.response_id !== undefined) {
            currentResponseId = event.response_id;
        }
        // We completely ignore updates while you are mid-sentence
        if (event.interaction_type === 'update_only') return;

        // When you stop speaking, we trigger Groq
        if (event.interaction_type === 'response_required' && sessionId && companyId) {
          const transcript = event.transcript;
          if (!transcript || transcript.length === 0) return;
          
          const lastUserMessage = transcript[transcript.length - 1].content;
          console.log(`[${callId}] User said: ${lastUserMessage}`);

          // Fetch History
          let chatHistory = await redisService.getSessionHistory(sessionId);
          chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

          const currentDateTime = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Kolkata',
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          });

          const systemPrompt = `
          You are the AI dispatch assistant for a plumbing company. You are currently speaking to the user over a VOICE CALL, but the user ALSO has a text chat window open on their screen.
          Current Time: ${currentDateTime}

          CRITICAL WORKFLOW - You must follow these steps strictly one by one. NEVER skip a step.
          Step 1. If the user hasn't described the issue, ask them to describe it.
          Step 2. Once the issue is understood, ASK the user what date they want the plumber to come.
          Step 3. ONLY AFTER the user explicitly provides a date, check their requested date using your calendar tool.
          Step 4. Present the open slots to the user.
          Step 5. Once they pick a slot, ask for their Full Name, Email, and Phone Number.
          Step 6. Once you have all details, book the appointment using your booking tool.

          VISION CAPABILITY RULES:
          - If the user says they want to show you a photo, upload an image, or share a picture, YOU MUST enthusiastically say: "Great, please upload the image using the camera icon in our chat window and I will take a look right now!"
          - NEVER say you cannot see images. You CAN see images if they upload them to the chat window.
          - Take the conversation exactly one step at a time.

          STRICT RULES:
          - TIMEZONE RULE: When generating date parameters for tools, ALWAYS append the IST offset (+05:30). Example format: YYYY-MM-DDThh:mm:00+05:30. NEVER use 'Z' or UTC.
          - Speak naturally. DO NOT output code, JSON, or formatting tags in your spoken response.
          `;

          chatHistory.unshift({ role: "system", content: systemPrompt });
          chatHistory.push({ role: "user", content: lastUserMessage });

          // Feed to Groq & Save
          const aiResponse = await aiService.generateResponse(chatHistory, companyId);
          await redisService.saveSessionHistory(sessionId, aiResponse.updatedMessages);
          const replyText = aiResponse.reply.toLowerCase();
          const shouldHangUp = replyText.includes("goodbye") || replyText.includes("have a great day");
          const spokenContent = aiResponse.reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
          // Send back to Retell
          const responsePayload = {
            response_type: "response",
            response_id: event.response_id, 
            content: spokenContent || "Hold on one moment please.",
            content_complete: true,
            end_call: shouldHangUp
          };
          
          ws.send(JSON.stringify(responsePayload));
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
           console.error(`[${callId}] WebSocket Error:`, error);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[${callId}] Call disconnected.`);
      if (sessionId) {
        activeCalls.delete(sessionId);
      }
    });
  }
};