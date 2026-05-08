import { WebSocket } from 'ws';
import { aiService } from '../../services/ai.service.js';
import { redisService } from '../../services/redis.service.js';
import Retell from "retell-sdk";
import { env } from '../../config/env.js';
import { Request, Response } from 'express';
import { IncomingMessage } from 'http';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { widgetController } from '../v2/widget.controller.js';

// We ONLY use this Map to push unsolicited text-to-speech interruptions (like Image Uploads) to the active socket[cite: 5].
// We DO NOT use it for storing database variables anymore.
// Replace your current activeCalls line with this:
export const activeCalls = new Map<string, { ws: WebSocket, getResponseId: () => number }>();

const retellClient = new Retell({
    apiKey: env.RETELL_API_KEY
});

export const voiceController = {
  createWebCall: asyncHandler(async (req: Request, res: Response) => {
    const agentId = "agent_c5710c68d65c2f85add46c5cee"; 
    const { sessionId, companyId } = req.body;

    if (!sessionId || !companyId) {
      throw new AppError("Session ID and Company ID are required.", 400);
    }
    // Ask Retell to prepare a web call
    const webCallResponse = await retellClient.call.createWebCall({
      agent_id: agentId,
    });
    if (!webCallResponse || !webCallResponse.call_id) {
      throw new AppError("Failed to initialize call with Retell AI.", 502); // 502 Bad Gateway
    }

    const safeCompanyId = companyId && companyId.trim() !== "" ? companyId : "123e4567-e89b-12d3-a456-426614174000";
    
    await redisService.saveCallVariables(webCallResponse.call_id, {
      sessionId: sessionId,
      companyId: safeCompanyId
    });

    res.status(200).json({ accessToken: webCallResponse.access_token });
  }),  
  
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
          You are the AI dispatch assistant for a plumbing company. 
          Current Time: ${currentDateTime}

          CRITICAL WORKFLOW - Follow these strictly one by one:
          Step 1. Understand the issue. (CRITICAL: If the user indicates they want to show or upload a picture, trigger the 'requestImageUpload' tool and STOP. Ask NO further questions until you receive the image analysis).
          Step 2. ASK the user what date they want the plumber to come.
          Step 3. ONLY AFTER the user explicitly provides a date, check their requested date using your calendar tool.
          Step 4. Present the open slots to the user.
          Step 5. Once they pick a slot, ask for their Full Name, Email, and Phone Number.
          Step 6. ONLY AFTER you have collected ALL THREE details directly from the user, use the 'bookAppointment' tool.
          Step 7. The tool will return a tracking token. MEMORIZE THIS TOKEN. Say: "I have reserved your slot. Please complete the advance payment on your screen." DO NOT confirm the booking yet.
          Step 8. ONLY AFTER the user says "Payment is completed", officially confirm the appointment and provide the tracking token you memorized. DO NOT run the booking tool a second time.

          ANTI-HALLUCINATION & VOICE RULES:
          - NEVER guess, hallucinate, or use dummy data (like "John Doe") for the booking tool. If you are missing the Name, Email, or Phone, you MUST ask for them.
          - If the user's voice cuts off, or they just say "hello", politely ask how you can help. DO NOT say "it seemed like you got cut off" or "you wanted to say something".
          - Pass the EXACT local Indian Standard Time (IST) requested. Format: YYYY-MM-DDTHH:mm:00.
          - DO NOT output raw function tags or JSON in your conversational text.
          `;

          chatHistory.unshift({ role: "system", content: systemPrompt });
          chatHistory.push({ role: "user", content: lastUserMessage });

          // Feed to Groq & Save
          const aiResponse = await aiService.generateResponse(chatHistory, companyId, sessionId);
          await redisService.saveSessionHistory(sessionId, aiResponse.updatedMessages);
          aiResponse.pendingSignals.forEach((signal: any) => {
             widgetController.sendSignal(sessionId, signal);
          });
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