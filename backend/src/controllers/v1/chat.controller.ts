import { Request, Response } from "express";
import { aiService } from "../../services/ai.service.js";
import { redisService } from "../../services/redis.service.js";
import { v4 as uuidv4 } from "uuid";

export const chatController = {
  
  async handleChat(req: Request, res: Response): Promise<void> {
    try {
      const message = req.body.message || "";
      const companyId = req.body.companyId;
      const sessionId = req.body.sessionId || uuidv4();

      if (!companyId) {
        res.status(400).json({ error: "Missing companyId." });
        return;
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
        res.status(400).json({ error: "Please provide a message or an image." });
        return;
      }

      // 1. Fetch History from Upstash
      let chatHistory = await redisService.getSessionHistory(sessionId);

      // 2. Strip out any existing system prompts from the history to avoid duplicates
      chatHistory = chatHistory.filter((msg: any) => msg.role !== "system");

      // 3. Generate a FRESH system prompt with the exact current time
      const currentDateTime = new Date().toLocaleString('en-US', { 
        timeZone: 'Asia/Kolkata',
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const systemPrompt = `
      You are the AI dispatch assistant for a plumbing company. 
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
      - NEVER output raw function tags (like <function>) in your conversational text. If you need a tool, trigger it natively in the background.
      - Take the conversation exactly one step at a time.
      `;

      // 4. Inject the fresh system prompt at the very beginning of the array
      chatHistory.unshift({ role: "system", content: systemPrompt });

      // 5. Append the user's current message
      chatHistory.push({ role: "user", content: finalUserMessage });

      // 6. Send the entire array to Groq
      const { reply, updatedMessages } = await aiService.generateResponse(chatHistory, companyId);

      // 7. Save the updated array back to Redis (it will save the system prompt, but we filter it out next time)
      await redisService.saveSessionHistory(sessionId, updatedMessages);

      // 8. Return the text and the sessionId to the frontend
      res.status(200).json({ reply, sessionId });

    } catch (error) {
      console.error("Chat Controller Error:", error);
      res.status(500).json({ error: "An error occurred while processing the chat." });
    }
  }
};