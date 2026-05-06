import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { aiService } from "../../services/ai.service.js";
import { redisService } from "../../services/redis.service.js";
import { activeCalls } from "../v1/voice.controller.js"; // Import voice calls for interruption

// Memory store for active frontend UI connections
export const activeWidgets = new Map<string, WebSocket>();

export const widgetController = {
  handleClientStream(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const orgId = url.searchParams.get("orgId");

    if (!sessionId || !orgId) {
      console.error("❌ Widget connection rejected: Session ID or Org ID missing.");
      ws.close(1008, "Session ID and Org ID required");
      return;
    }

    console.log(`💻 Frontend UI connected for Session: ${sessionId}`);
    
    // Lock the socket in memory using the Session ID
    activeWidgets.set(sessionId, ws);

    ws.on("message", async (data: Buffer) => {
      try {
        const payload = JSON.parse(data.toString());
        
        // --- HANDLE INCOMING TEXT & IMAGE CHAT ---
        if (payload.action === "INCOMING_CHAT") {
          const message = payload.message || "";
          let finalUserMessage = message;

          // 1. VISION CAPABILITY: Analyze image if uploaded over WS
          if (payload.image && payload.mimeType) {
            console.log(`[CHAT] Image uploaded over WS for Session: ${sessionId}`);
            const visionAnalysis = await aiService.analyzeImage(payload.image, payload.mimeType);
            finalUserMessage = `${message}\n\n[SYSTEM NOTE: The user uploaded an image. Vision Analysis: ${visionAnalysis}]`.trim();
          }

          if (!finalUserMessage) return;

          // 2. FETCH & CLEAN UPSTASH REDIS HISTORY
          let chatHistory = await redisService.getSessionHistory(sessionId);
          chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

          // 3. GENERATE FRESH SYSTEM PROMPT (With exact IST Time)
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
          chatHistory.push({ role: "user", content: finalUserMessage });

          // 4. GENERATE AI RESPONSE (Triggers UI signals internally)
          const aiResponse = await aiService.generateResponse(chatHistory, orgId, sessionId);

          // 5. SAVE HISTORY TO REDIS
          await redisService.saveSessionHistory(sessionId, aiResponse.updatedMessages);

         // 6. VOICE INTERRUPTION LOGIC
          const activeVoiceSocket = activeCalls.get(sessionId);
          
          if (activeVoiceSocket) {
            console.log(`[CHAT] UI input received during active voice call. Interrupting Retell...`);
            
            // Clean the reply of any hallucinated tags
            const cleanReply = aiResponse.reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
            
            // 🔥 THE FIX: Let the AI actually speak its diagnosis instead of a hardcoded placeholder!
            activeVoiceSocket.ws.send(JSON.stringify({
              response_type: "agent_interrupt",
              interrupt_id: Math.floor(Math.random() * 900000) + 100000,
              content: cleanReply, 
              content_complete: true,
              no_interruption_allowed: false
            }));

            // Push the exact same text to the visual chat box
            ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: cleanReply }));
            return; 
          }

          // 7. SEND STANDARD TEXT REPLY BACK TO FRONTEND (Only runs if NO voice call is active)
          if (aiResponse.reply) {
            const cleanReply = aiResponse.reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
            if (cleanReply) {
              ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: cleanReply }));
            }
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: "Sorry, I encountered an error processing your message." }));
      }
    });

    ws.on("close", () => {
      console.log(`💻 Frontend UI disconnected for Session: ${sessionId}`);
      activeWidgets.delete(sessionId);
    });
  },

  // ⚡ Utility function to fire popups to the screen
  sendSignal(sessionId: string, payload: { action: string; data?: any }) {
    const ws = activeWidgets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      console.log(`📡 Signal sent to ${sessionId}: ${payload.action}`);
    } else {
      console.log(`⚠️ Could not send signal to ${sessionId}. UI is not connected.`);
    }
  }
};