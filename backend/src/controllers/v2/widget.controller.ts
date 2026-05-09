import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { aiService } from "../../services/ai.service.js";
import { redisService } from "../../services/redis.service.js";
import { activeCalls } from "../v1/voice.controller.js";
import { logger } from "../../utils/logger.js"; 

export const activeWidgets = new Map<string, WebSocket>();

export const widgetController = {
  handleClientStream(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const orgId = url.searchParams.get("orgId");

    if (!sessionId || !orgId) {
      logger.warn("Widget connection rejected: Session ID or Org ID missing.");
      ws.close(1008, "Session ID and Org ID required");
      return;
    }

    logger.info(`Frontend UI connected for Session: ${sessionId}`);
    activeWidgets.set(sessionId, ws);

    ws.on("message", async (data: Buffer) => {
      try {
        const payload = JSON.parse(data.toString());
        
        if (payload.action === "INCOMING_CHAT") {
          const message = payload.message || "";
          let finalUserMessage = message;

          // 1. Handle Image Uploads
          if (payload.image && payload.mimeType) {
            logger.info(`Image uploaded over WS for Session: ${sessionId}`);
            const visionAnalysis = await aiService.analyzeImage(payload.image, payload.mimeType);
            finalUserMessage = `[SYSTEM NOTE: The user uploaded an image. Vision Analysis: ${visionAnalysis}]`;
          }

          if (!finalUserMessage) return;

          // 2. Fetch Chat History (Filter out old system prompts so they don't bloat memory)
          let chatHistory = await redisService.getSessionHistory(sessionId);
          chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

          // 3. Append User Message
          chatHistory.push({ role: "user", content: finalUserMessage });

          // 4. Send to Orchestrator (The promptBuilder injects the state rules dynamically!)
          const aiResponse = await aiService.generateResponse(chatHistory, orgId, sessionId);
          
          // 5. Save Clean History
          await redisService.saveSessionHistory(sessionId, aiResponse.updatedMessages);
          

          // 7. Voice Interruption Logic
          const activeVoiceSocket = activeCalls.get(sessionId);
          if (activeVoiceSocket) {
            logger.info(`UI input received during active voice call. Interrupting Retell for session ${sessionId}...`);
            const cleanReply = aiResponse.reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
            
            activeVoiceSocket.ws.send(JSON.stringify({
              response_type: "agent_interrupt",
              interrupt_id: Math.floor(Math.random() * 900000) + 100000,
              content: cleanReply, 
              content_complete: true,
              no_interruption_allowed: false
            }));

            ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: cleanReply }));
            aiResponse.pendingSignals.forEach((signal: any) => {
              ws.send(JSON.stringify(signal));
            });
            return; 
          }

          // 8. Standard Text Chat Reply
          if (aiResponse.reply) {
            const cleanReply = aiResponse.reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
            if (cleanReply) {
              ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: cleanReply }));
            }
          }

          aiResponse.pendingSignals.forEach((signal: any) => {
             // If it's a hang-up, delay it so the user can read the final goodbye message
             if (signal.action === "END_CHAT") {
                setTimeout(() => {
                   if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify(signal));
                      logger.info(`Delayed END_CHAT signal sent for session ${sessionId}`);
                   }
                }, 3000); // 3-second delay
             } else {
                // Otherwise, send the popup/form signal instantly
                ws.send(JSON.stringify(signal));
             }
          });
        }
      } catch (error) {
        logger.error(`WebSocket message error for session ${sessionId}:`, error);
        ws.send(JSON.stringify({ action: "CHAT_REPLY", reply: "Sorry, I encountered an error processing your message." }));
      }
    });

    ws.on("close", () => {
      logger.info(`Frontend UI disconnected for Session: ${sessionId}`);
      activeWidgets.delete(sessionId);
    });
  },
  
  sendSignal(sessionId: string, payload: any) {
    const ws = activeWidgets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      logger.info(`Signal sent to ${sessionId}: ${payload.action}`);
    } else {
      logger.warn(`Could not send signal to ${sessionId}. UI is not connected.`);
    }
  }
};