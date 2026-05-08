import { Request, Response } from "express";
import { aiService } from "../../services/ai.service.js";
import { redisService } from "../../services/redis.service.js";
import { v4 as uuidv4 } from "uuid";
import { activeCalls } from "./voice.controller.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

export const chatController = {
  
  handleChat: asyncHandler(async (req: Request, res: Response) => {
    const message = req.body.message || "";
    const companyId = req.body.companyId;
    const sessionId = req.body.sessionId || uuidv4();

    if (!companyId) {
      throw new AppError("Missing companyId.", 400);
    }

    let finalUserMessage = message;

    // IF AN IMAGE WAS UPLOADED:
    if (req.file) {
      const base64Image = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype;
      const imageDescription = await aiService.analyzeImage(base64Image, mimeType);
      finalUserMessage = `${message}\n\n[SYSTEM NOTE: The user uploaded an image. Vision Analysis: ${imageDescription}]`;
    }

    if (!finalUserMessage) {
      throw new AppError("Please provide a message or an image.", 400);
    }

    // 1. Fetch History from Upstash
    let chatHistory = await redisService.getSessionHistory(sessionId);

    // 2. Strip out any existing system prompts from the history to avoid duplicates
    chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

    // 3. Generate a FRESH system prompt
    const currentDateTime = new Date().toLocaleString('en-US', { 
      timeZone: 'Asia/Kolkata',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    const systemPrompt = `
    You are the AI dispatch assistant for a plumbing company. 
    Current Time: ${currentDateTime}

    CRITICAL WORKFLOW - You must follow these steps strictly one by one. NEVER skip a step.
    Step 1. If the user hasn't described the issue, ask them to describe it.
    Step 2. Once the issue is understood, ASK the user what date they want the plumber to come. (DO NOT guess the date. WAIT for their response).
    Step 3. ONLY AFTER the user explicitly provides a date, use the 'checkCalendarAvailability' tool.
    Step 4. Present the open slots to the user.
    Step 5. Once they pick a slot, ask for their Full Name, Email, and Phone Number. (DO NOT book yet).
    Step 6. ONLY AFTER the user has explicitly provided ALL THREE details (Name, Email, AND Phone Number), use the 'bookAppointment' tool. Never hallucinate missing details.

    VISION CAPABILITY RULES:
    - If the user says they want to show you a photo, upload an image, or share a picture, YOU MUST enthusiastically say: "Great, please upload the image using the camera icon in our chat window and I will take a look right now!"
    - NEVER say you cannot see images. You CAN see images if they upload them to the chat window.

    STRICT RULES:
    - TIMEZONE RULE: When generating date parameters for tools, pass the EXACT local Indian Standard Time (IST) requested by the user. Use the exact format: YYYY-MM-DDTHH:mm:00.
    - NEVER assume or hallucinate a date. You must ask.
    - NEVER output raw function tags (like <function>) in your conversational text. If you need a tool, trigger it natively in the background.
    - Take the conversation exactly one step at a time.
    `;

    chatHistory.unshift({ role: "system", content: systemPrompt });
    chatHistory.push({ role: "user", content: finalUserMessage });

    // 4. Send to Groq
    const { reply, updatedMessages } = await aiService.generateResponse(chatHistory, companyId, sessionId);

    // 5. Save the updated array back to Redis
    await redisService.saveSessionHistory(sessionId, updatedMessages);
    
    const activeSocket = activeCalls.get(sessionId);

    if (activeSocket) {
      const spokenContent = reply.replace(/<function[\s\S]*?<\/function>/ig, '').trim() || "I am taking a look at that image right now.";
      
      activeSocket.ws.send(JSON.stringify({
        response_type: "agent_interrupt",          
        interrupt_id: Math.floor(Math.random() * 900000) + 100000, 
        content: spokenContent,
        content_complete: true,
        no_interruption_allowed: false
      }));

      res.status(200).json({ 
        reply: "📷 Image analyzed. Answering on your live call...", 
        sessionId 
      });
      return;
    }

    // 6. Return standard text
    res.status(200).json({ reply, sessionId });
  }),

  getHistory: asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) { 
      throw new AppError("Missing sessionId", 400); 
    }
    
    const history = await redisService.getSessionHistory(sessionId);
    res.status(200).json({ history });
  })
};