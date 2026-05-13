import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { calendarService } from "./calendar.service.js";
import { mockCalendarService } from "./v2/mockCalendar.service.js";
import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";
import { redisService } from "./redis.service.js";
import { promptBuilder } from "./prompt.builder.js"; 
import crypto from "crypto"; 

// NEW: The Session Mutex Lock Queue
const sessionLocks = new Map<string, Promise<any>>();

// Initialize the Groq SDK
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

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
        temperature: 0.2, 
      });

      return response.choices[0].message.content || "I see an image, but I can't determine the exact plumbing issue.";
    } catch (error) {
      logger.error("Vision API Error:", error);
      return "The user uploaded an image, but I encountered an error analyzing it.";
    }
  },

  // =====================================================================
  // THE SECURE ENTRY POINT (HANDLES LOCKS & HISTORY)
  // =====================================================================
  async generateResponse(userMessage: string, companyId: string, sessionId: string): Promise<{ reply: string, pendingSignals: any[] }> {
    // 1. Get the existing promise queue for this session, or start a new one
    const priorPromise = sessionLocks.get(sessionId) || Promise.resolve();

    // 2. Chain the new request to the end of the queue
    const currentPromise = priorPromise.then(async () => {
      // Fetch History FRESH from Redis inside the lock!
      let chatHistory = await redisService.getSessionHistory(sessionId);
      let cleanHistory = chatHistory.filter((msg: any) => msg.role !== "system");
      
      if (userMessage) {
        cleanHistory.push({ role: "user", content: userMessage });
      }

      // Execute the actual AI turn
      const result = await this._processTurn(cleanHistory, companyId, sessionId, 0);

      // Save History before releasing the lock!
      await redisService.saveSessionHistory(sessionId, result.updatedMessages);

      return { 
        reply: result.reply,
        pendingSignals: result.pendingSignals
      };
    }).catch((error) => {
      logger.error(`Promise Chain Error for session ${sessionId}:`, error);
      throw error;
    });

    // 3. Update the map with the new tail of the chain
    sessionLocks.set(sessionId, currentPromise);

    // 4. Clean up the map to prevent memory leaks when the chain finishes
    currentPromise.finally(() => {
      if (sessionLocks.get(sessionId) === currentPromise) {
        sessionLocks.delete(sessionId);
      }
    });

    return currentPromise;
  },

  // =====================================================================
  // THE ORCHESTRATOR CORE (YOUR EXISTING LOGIC)
  // =====================================================================
  async _processTurn(chatHistory: any[], companyId: string, sessionId: string, retryCount = 0): Promise<{ reply: string, updatedMessages: any[], pendingSignals: any[] }> {
    try {
      let pendingSignals: any[] = [];
      let state = await redisService.getSessionState(sessionId);
      
      const lastMsg = chatHistory[chatHistory.length - 1]?.content || "";

      // 1. THE BACKEND INTERCEPTORS (HARD STATE JUMPS)
      if (state.currentState === "STATE_3_IMAGE_UPLOAD" && lastMsg.includes("Vision Analysis:")) {
        state = await redisService.transitionState(sessionId, "STATE_4_DATE_SELECTION", { imageAnalyzed: true });
      }
      
      if (state.currentState === "STATE_6_CUSTOMER_DETAILS" && lastMsg.includes("[SYSTEM_DETAILS_SUBMITTED]")) {
        const nameMatch = lastMsg.match(/Name:\s*([^,]+)/);
        const emailMatch = lastMsg.match(/Email:\s*([^,]+)/);
        const phoneMatch = lastMsg.match(/Phone:\s*([^,]+)/);
        
        const customerDetails = {
           name: nameMatch ? nameMatch[1].trim() : "Unknown",
           email: emailMatch ? emailMatch[1].trim() : "Unknown",
           phone: phoneMatch ? phoneMatch[1].trim() : "Unknown"
        };

        const tempToken = `HOLD_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        
        pendingSignals.push({ action: "SHOW_PAYMENT_MODAL", data: { amount: 70, trackingToken: tempToken } });
        
        state = await redisService.transitionState(sessionId, "STATE_7_PAYMENT", { customerDetails, trackingToken: tempToken });
        
        chatHistory[chatHistory.length - 1].content = `[SYSTEM] The user submitted their details. The slot is on a soft hold. Command: Tell the user you have reserved the slot and ask them to complete the advance payment on their screen.`;
      }

      if (state.currentState === "STATE_7_PAYMENT" && lastMsg.includes("[SYSTEM_PAYMENT_SUCCESSFUL]")) {
        const organization = await db.organization.findUnique({ where: { id: companyId }, select: { status: true }});
        
        const bookingArgs = {
            companyId,
            customerName: state.customerDetails?.name || "Unknown",
            customerEmail: state.customerDetails?.email || "Unknown",
            customerPhone: state.customerDetails?.phone || "Unknown",
            issueDescription: state.issueDescription || "Plumbing Issue",
            startIsoString: state.selectedDate || new Date().toISOString(), 
        };
        
        const rawResult = organization?.status === "SANDBOX" 
            ? await mockCalendarService.bookAppointment(bookingArgs)
            : await calendarService.bookAppointment(bookingArgs);
            
        const finalToken = rawResult?.trackingToken || state.trackingToken;

        state = await redisService.transitionState(sessionId, "STATE_8_CONFIRMATION", { trackingToken: finalToken });
      }

      // 2. DYNAMIC PROMPT INJECTION
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const { prompt, allowedTools } = promptBuilder.buildStateContext(state, currentDateTime);
      
      const messages = [{ role: "system", content: prompt }, ...chatHistory];

      // 3. CALL GROQ
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        tools: allowedTools.length > 0 ? allowedTools : undefined,
        tool_choice: allowedTools.length > 0 ? "auto" : "none",
        parallel_tool_calls: false,
      });

      const responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;
      messages.push(responseMessage);

      // 4. TOOL ROUTER (TRANSITIONS & UI TRIGGERS)
      if (toolCalls && toolCalls.length > 0) {
        const organization = await db.organization.findUnique({ where: { id: companyId }, select: { status: true }});
        const isSandbox = organization?.status === "SANDBOX";

        for(const toolCall of toolCalls){
          const functionName = toolCall.function.name;
          const functionArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
          let functionResult: any;
          
          logger.info(`🤖 AI Tool Fired: ${functionName} (State: ${state.currentState})`);

          if (functionName === "recordIssue") {
            await redisService.transitionState(sessionId, "STATE_2_IMAGE_INTENT", { issueDescription: functionArgs.issueDescription });
            functionResult = { success: true, message: "Issue saved. Move to the next step: Ask if they want to upload a photo." };
          } 
          else if (functionName === "skipImageUpload") {
            await redisService.transitionState(sessionId, "STATE_4_DATE_SELECTION");
            functionResult = { success: true, message: "Skipped image. Move to the next step: Ask what date they prefer." };
          }
          else if (functionName === "requestImageUpload") {
            await redisService.transitionState(sessionId, "STATE_3_IMAGE_UPLOAD");
            pendingSignals.push({ action: "TRIGGER_IMAGE_UPLOAD" });
            functionResult = { success: true, message: "Image upload UI opened. Tell the user to select their photo on the screen." };
          }
          else if (functionName === "checkCalendarAvailability") {
            const requestedDate = new Date(functionArgs.dateIsoString);
            const today = new Date();
            today.setHours(0, 0, 0, 0); 

            if (requestedDate < today) {
              logger.warn(`User tried to book a past date: ${functionArgs.dateIsoString}`);
              functionResult = { 
                success: false, 
                message: "SYSTEM WARNING: The requested date is in the past! Do not book this. Tell the user the date has already passed and explicitly ask them for a current or future date." 
              };
            } else {
              functionResult = isSandbox
                ? await mockCalendarService.checkAvailability(companyId, functionArgs.dateIsoString)
                : await calendarService.checkAvailability(companyId, functionArgs.dateIsoString); 
              
              await redisService.transitionState(sessionId, "STATE_5_SLOT_SELECTION", { selectedDate: functionArgs.dateIsoString });
              
              const readableDate = requestedDate.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric'
              });

              pendingSignals.push({ 
                action: "SHOW_SLOT_PICKER", 
                data: { date: readableDate, slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] }
              });
              
              functionResult.SYSTEM_INSTRUCTION = "The Slot Picker UI is now open. Tell the user to pick one of the available slots on their screen.";
            }
          }
          else if (functionName === "recordSlotSelection") {
            await redisService.transitionState(sessionId, "STATE_6_CUSTOMER_DETAILS", { selectedSlot: functionArgs.selectedSlot });
            pendingSignals.push({
              action: "TAKE_INPUT",
              data: [
                { label: "Name", keyboard_type: "text" },
                { label: "Email Address", keyboard_type: "emailAddress" },
                { label: "Phone Number", keyboard_type: "phone" }
              ]
            });
            functionResult = { 
              success: true, 
              message: "Slot saved. Customer details form opened automatically. Tell the user to enter their details in the form. DO NOT say goodbye or confirm the appointment yet, payment is still required." 
            };
          }
          else if (functionName === "requestCustomerDetails") {
            pendingSignals.push({
              action: "TAKE_INPUT",
              data: [
                { label: "Name", keyboard_type: "text" },
                { label: "Email Address", keyboard_type: "emailAddress" },
                { label: "Phone Number", keyboard_type: "phone" }
              ]
            });
            functionResult = { success: true, message: "Customer details form reopened. Tell the user to use the form." };
          }
          else if (functionName === "resendPaymentPopup") {
            pendingSignals.push({ action: "SHOW_PAYMENT_MODAL", data: { amount: 70, trackingToken: functionArgs.trackingToken || state.trackingToken } });
            functionResult = { success: true, message: "Payment modal reopened." };
          }else if (functionName === "endConversation") {
            pendingSignals.push({ action: "END_CHAT" });
            functionResult = { success: true, SYSTEM_INSTRUCTION: "The chat is now ending. Say your polite goodbye script." };
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
        let finalReply = secondResponse.choices[0].message.content ?? "";

        // 🚨 CRITICAL FALLBACK: Catch ALL hallucinated tags and JSON
        
        // 1. Scrub raw JSON tool hallucinations (e.g., {"type": "function", ...})
        const jsonToolRegex = /\{[\s\n]*"type"[\s\n]*:[\s\n]*"function"[\s\S]*?\}/ig;
        if (jsonToolRegex.test(finalReply)) {
           finalReply = finalReply.replace(jsonToolRegex, '').trim();
           // Manually push the calendar signal if we caught it hallucinating the calendar tool
           if (!pendingSignals.some(s => s.action === "SHOW_SLOT_PICKER")) {
               pendingSignals.push({ 
                 action: "SHOW_SLOT_PICKER", 
                 data: { date: state.selectedDate, slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] }
               });
           }
        }

        // 2. Scrub HTML-style hallucinations
        if (finalReply.includes("<function")) {
          const isHangUp = finalReply.includes("endConversation");
          const isDetails = finalReply.includes("requestCustomerDetails");
          const isImage = finalReply.includes("requestImageUpload");
          const isPayment = finalReply.includes("resendPaymentPopup");
          const isCalendar = finalReply.includes("checkCalendarAvailability");

          finalReply = finalReply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
          
          if (isHangUp && !pendingSignals.some(s => s.action === "END_CHAT")) pendingSignals.push({ action: "END_CHAT" });
          if (isImage && !pendingSignals.some(s => s.action === "TRIGGER_IMAGE_UPLOAD")) pendingSignals.push({ action: "TRIGGER_IMAGE_UPLOAD" });
          if (isPayment && !pendingSignals.some(s => s.action === "SHOW_PAYMENT_MODAL")) pendingSignals.push({ action: "SHOW_PAYMENT_MODAL", data: { amount: 70, trackingToken: state.trackingToken } });
          if (isDetails && !pendingSignals.some(s => s.action === "TAKE_INPUT")) {
              pendingSignals.push({ action: "TAKE_INPUT", data: [{ label: "Name", keyboard_type: "text" }, { label: "Email Address", keyboard_type: "emailAddress" }, { label: "Phone Number", keyboard_type: "phone" }] });
          }
          if (isCalendar && !pendingSignals.some(s => s.action === "SHOW_SLOT_PICKER")) {
               pendingSignals.push({ action: "SHOW_SLOT_PICKER", data: { date: state.selectedDate, slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] } });
          }
        } else if (finalReply.includes("endConversation")) {
           if (finalReply.includes("{") && finalReply.includes("}")) {
               finalReply = finalReply.replace(/{.*endConversation.*}/s, "").trim(); 
               if (!finalReply) finalReply = "Have a great day!";
           }
           if (!pendingSignals.some(s => s.action === "END_CHAT")) pendingSignals.push({ action: "END_CHAT" });
        }
        return { 
          reply: finalReply,
          updatedMessages: messages,
          pendingSignals
        };
      }
      
      let finalReply = responseMessage.content ?? "";

      // 🚨 CRITICAL FALLBACK: Catch ALL hallucinated tags and JSON
        
        // 1. Scrub raw JSON tool hallucinations (e.g., {"type": "function", ...})
        const jsonToolRegex = /\{[\s\n]*"type"[\s\n]*:[\s\n]*"function"[\s\S]*?\}/ig;
        if (jsonToolRegex.test(finalReply)) {
           // Figure out WHICH tool it hallucinated before we delete the string
           const isHangUpJSON = finalReply.includes("endConversation");
           const isDetailsJSON = finalReply.includes("requestCustomerDetails");
           const isImageJSON = finalReply.includes("requestImageUpload");
           const isPaymentJSON = finalReply.includes("resendPaymentPopup");
           const isCalendarJSON = finalReply.includes("checkCalendarAvailability");

           // Strip the JSON block and clean up trailing braces (Fixes the Flutter bug!)
           finalReply = finalReply.replace(jsonToolRegex, '').replace(/}$/, '').trim();
           
           // Route to the correct UI signal AND update the Redis State Machine! (Fixes the State Desync bug!)
           if (isHangUpJSON && !pendingSignals.some(s => s.action === "END_CHAT")) {
               pendingSignals.push({ action: "END_CHAT" });
           }
           if (isImageJSON && !pendingSignals.some(s => s.action === "TRIGGER_IMAGE_UPLOAD")) {
               pendingSignals.push({ action: "TRIGGER_IMAGE_UPLOAD" });
               await redisService.transitionState(sessionId, "STATE_3_IMAGE_UPLOAD");
           }
           if (isPaymentJSON && !pendingSignals.some(s => s.action === "SHOW_PAYMENT_MODAL")) {
               pendingSignals.push({ action: "SHOW_PAYMENT_MODAL", data: { amount: 70, trackingToken: state.trackingToken } });
               await redisService.transitionState(sessionId, "STATE_7_PAYMENT");
           }
           if (isDetailsJSON && !pendingSignals.some(s => s.action === "TAKE_INPUT")) {
              pendingSignals.push({ action: "TAKE_INPUT", data: [{ label: "Name", keyboard_type: "text" }, { label: "Email Address", keyboard_type: "emailAddress" }, { label: "Phone Number", keyboard_type: "phone" }] });
              await redisService.transitionState(sessionId, "STATE_6_CUSTOMER_DETAILS");
           }
           if (isCalendarJSON && !pendingSignals.some(s => s.action === "SHOW_SLOT_PICKER")) {
               const hallucinatedDate = state.selectedDate || new Date().toISOString();
               pendingSignals.push({ action: "SHOW_SLOT_PICKER", data: { date: hallucinatedDate, slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] } });
               await redisService.transitionState(sessionId, "STATE_5_SLOT_SELECTION", { selectedDate: hallucinatedDate });
           }
        }

        // 2. Scrub HTML-style hallucinations
        if (finalReply.includes("<function")) {
          const isHangUp = finalReply.includes("endConversation");
          const isDetails = finalReply.includes("requestCustomerDetails");
          const isImage = finalReply.includes("requestImageUpload");
          const isPayment = finalReply.includes("resendPaymentPopup");
          const isCalendar = finalReply.includes("checkCalendarAvailability");

          finalReply = finalReply.replace(/<function[\s\S]*?<\/function>/ig, '').trim();
          
          if (isHangUp && !pendingSignals.some(s => s.action === "END_CHAT")) {
              pendingSignals.push({ action: "END_CHAT" });
          }
          if (isImage && !pendingSignals.some(s => s.action === "TRIGGER_IMAGE_UPLOAD")) {
              pendingSignals.push({ action: "TRIGGER_IMAGE_UPLOAD" });
              await redisService.transitionState(sessionId, "STATE_3_IMAGE_UPLOAD");
          }
          if (isPayment && !pendingSignals.some(s => s.action === "SHOW_PAYMENT_MODAL")) {
              pendingSignals.push({ action: "SHOW_PAYMENT_MODAL", data: { amount: 70, trackingToken: state.trackingToken } });
              await redisService.transitionState(sessionId, "STATE_7_PAYMENT");
          }
          if (isDetails && !pendingSignals.some(s => s.action === "TAKE_INPUT")) {
              pendingSignals.push({ action: "TAKE_INPUT", data: [{ label: "Name", keyboard_type: "text" }, { label: "Email Address", keyboard_type: "emailAddress" }, { label: "Phone Number", keyboard_type: "phone" }] });
              await redisService.transitionState(sessionId, "STATE_6_CUSTOMER_DETAILS");
          }
          if (isCalendar && !pendingSignals.some(s => s.action === "SHOW_SLOT_PICKER")) {
               const hallucinatedDate = state.selectedDate || new Date().toISOString();
               pendingSignals.push({ action: "SHOW_SLOT_PICKER", data: { date: hallucinatedDate, slots: ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"] } });
               await redisService.transitionState(sessionId, "STATE_5_SLOT_SELECTION", { selectedDate: hallucinatedDate });
          }
        } else if (finalReply.includes("endConversation")) {
           if (finalReply.includes("{") && finalReply.includes("}")) {
               finalReply = finalReply.replace(/{.*endConversation.*}/s, "").trim(); 
               if (!finalReply) finalReply = "Have a great day!";
           }
           if (!pendingSignals.some(s => s.action === "END_CHAT")) {
              pendingSignals.push({ action: "END_CHAT" });
           }
        }
      return { 
        reply: finalReply,
        updatedMessages: messages,
        pendingSignals
      };

    } catch(error: any) {
      const groqError = error?.error?.error || error?.error;      
      if (groqError?.code === "tool_use_failed" && retryCount < 2) {
        logger.warn(`⚠️ AI Syntax Error caught! Retrying silently... (Attempt ${retryCount + 1})`);        
        chatHistory.push({
          role: "system",
          content: "SYSTEM ERROR: Your previous tool call failed due to malformed syntax. DO NOT output raw <function> tags. Output ONLY the strict JSON required to trigger the tool."
        });
        // FIX: Ensure retries call the internal _processTurn function, avoiding a new lock!
        return this._processTurn(chatHistory, companyId, sessionId, retryCount + 1);
      }
      logger.error("Groq AI Service Error:", error);
      throw new AppError("Failed to generate AI response.", 502);
    }
  }
};