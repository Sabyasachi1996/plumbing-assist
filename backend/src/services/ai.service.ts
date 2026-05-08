import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { calendarService } from "./calendar.service.js";
import { mockCalendarService } from "./v2/mockCalendar.service.js";
import { db } from "../db/index.js";
import { widgetController } from "../controllers/v2/widget.controller.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

// Initialize the Groq SDK
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Define the tools for Groq using standard JSON Schema
const tools: any[] = [
  {
    type: "function",
    function: {
      name: "checkCalendarAvailability",
      description: "Checks the plumbing company's calendar for available 2-hour appointment slots on a specific date.",
      parameters: {
        type: "object",
        properties: {
          dateIsoString: { 
            type: "string", 
            description: "The requested date in strict ISO 8601 format (e.g., '2026-05-02T00:00:00.000Z')" 
          }
        },
        required: ["dateIsoString"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bookAppointment",
      description: "Books a 2-hour plumbing appointment on the calendar and generates a tracking token.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "The full name of the customer." },
          customerEmail: { type: "string", description: "The email address of the customer." },
          customerPhone: { type: "string", description: "The phone number of the customer." },
          issueDescription: { type: "string", description: "A brief description of the plumbing issue." },
          startIsoString: { 
            type: "string", 
            description: "The agreed-upon start time in strict ISO 8601 format." 
          }
        },
        required: ["customerName", "customerEmail", "customerPhone", "issueDescription", "startIsoString"],
      },
    },
  },
  {
    "type": "function",
    "function": {
      "name": "requestImageUpload",
      "description": "Call this tool immediately when you want the user to upload a photo of their plumbing issue.",
      "parameters": { "type": "object", "properties": {} }
    }
  }
];

export const aiService = {
  // NEW VISION FUNCTION
  async analyzeImage(base64Image: string, mimeType: string): Promise<string> {
    try {
      logger.info("AI is analyzing image...");
      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "You are a master plumber. Briefly describe the plumbing issue shown in this image in one or two sentences." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ],
        temperature: 0.2, // Keep it factual
      });

      return response.choices[0].message.content || "I see an image, but I can't determine the exact plumbing issue.";
    } catch (error) {
      logger.error("Vision API Error:", error);
      return "The user uploaded an image, but I encountered an error analyzing it.";
    }
  },
  // Notice we added retryCount = 0 here
  async generateResponse(messages: any[], companyId: string, sessionId: string, retryCount = 0): Promise<{ reply: string, updatedMessages: any[],pendingSignals: any[] }> {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
      });

      const responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;

      messages.push(responseMessage);
      let pendingSignals: any[] = [];
      if (toolCalls && toolCalls.length > 0) {
        // 1. FETCH ORGANIZATION STATUS ONCE
        const organization = await db.organization.findUnique({
          where: { id: companyId },
          select: { status: true }
        });
        const isSandbox = organization?.status === "SANDBOX";

        for(const toolCall of toolCalls){
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          let functionResult: any;
          logger.info(`🤖 AI is triggering tool: ${functionName} (Sandbox Mode: ${isSandbox})`);
          // 2. THE ROUTER: Send to Mock or Real Service based on Status
          if (functionName === "requestImageUpload") {
            pendingSignals.push({ action: "TRIGGER_IMAGE_UPLOAD" });
            // widgetController.sendSignal(sessionId, { action: "TRIGGER_IMAGE_UPLOAD" });
            functionResult = { success: true, message: "Image upload UI opened. Ask them to wait for the analysis." };
          }else if (functionName === "checkCalendarAvailability") {
            functionResult = isSandbox
            ? await mockCalendarService.checkAvailability(companyId, functionArgs.dateIsoString)
            : await calendarService.checkAvailability(companyId, functionArgs.dateIsoString); 
            pendingSignals.push({ 
              action: "SHOW_SLOT_PICKER", 
              data: { slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] }
            });           
            // 🔥 FIX: Fire the Slot Picker Signal!
            /* widgetController.sendSignal(sessionId, { 
              action: "SHOW_SLOT_PICKER", 
              data: { slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] } // Hardcoded for demo visualization
            }); */
          }else if (functionName === "bookAppointment") {
            const bookingArgs = {
              companyId,
              customerName: functionArgs.customerName,
              customerEmail: functionArgs.customerEmail,
              customerPhone: functionArgs.customerPhone,
              issueDescription: functionArgs.issueDescription,
              startIsoString: functionArgs.startIsoString,
            };
            const rawResult: any = isSandbox
            ? await mockCalendarService.bookAppointment(bookingArgs)
            : await calendarService.bookAppointment(bookingArgs);
            //Define the token so both the UI and AI get the exact same string
            const actualToken = rawResult?.trackingToken || "DEMO_TOKEN";
            pendingSignals.push({ 
              action: "SHOW_PAYMENT_MODAL", 
              data: { amount: 70, trackingToken: actualToken } 
            });
            // Fire the Payment Modal Signal
            /* widgetController.sendSignal(sessionId, { 
              action: "SHOW_PAYMENT_MODAL", 
              data: { amount: 70, trackingToken: actualToken } 
            }); */
            // Override what the AI sees
            functionResult = {
              status: "PAYMENT_PENDING",
              trackingToken: actualToken, // <-- AI now memorizes "DEMO_TOKEN"
              SYSTEM_INSTRUCTION: "CRITICAL: The payment modal is now on the user's screen. DO NOT say the appointment is booked. Tell the user: 'I have reserved your slot. Please complete the advance payment on your screen.' You MUST wait for them to say payment is complete before giving them the tracking token."
            };
          }
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(functionResult),
          });
        }
        const secondResponse = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: messages,
        });
        messages.push(secondResponse.choices[0].message);
        return { 
          reply: secondResponse.choices[0].message.content ?? "",
          updatedMessages: messages,
          pendingSignals
        };
      }
      return { 
        reply: responseMessage.content ?? "",
        updatedMessages: messages,
        pendingSignals
      };
    }catch(error: any){
      // --- THE BULLETPROOF RECOVERY BLOCK ---
      const groqError = error?.error?.error || error?.error;      
      // If Groq throws the syntax error AND we haven't retried too many times
      if (groqError?.code === "tool_use_failed" && retryCount < 2) {
        logger.warn(`⚠️ AI Syntax Error caught! Retrying silently... (Attempt ${retryCount + 1})`);        
        // Inject a strict warning into the AI's memory
        messages.push({
          role: "system",
          content: "SYSTEM ERROR: Your previous tool call failed due to malformed syntax. DO NOT output raw <function> tags. DO NOT output conversational text. Output ONLY the strict JSON required to trigger the tool."
        });
        // Recursively call the function again!
        return this.generateResponse(messages, companyId, sessionId, retryCount + 1);
      }
      // If it's a different error or we ran out of retries, throw it
      logger.error("Groq AI Service Error:", error);
      throw new AppError("Failed to generate AI response.",502);
    }
  }
};