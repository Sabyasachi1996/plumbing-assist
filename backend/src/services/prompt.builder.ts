import { SessionState } from "./redis.service.js";

// =========================================================
// 1. THE ISOLATED TOOL REGISTRY
// =========================================================
const ALL_TOOLS = {
  // --- TRANSITION TOOLS (To move between states) ---
  recordIssue: {
    type: "function",
    function: {
      name: "recordIssue",
      description: "Call this tool ONCE the user has clearly described their plumbing issue to save it to the database.",
      parameters: {
        type: "object",
        properties: { issueDescription: { type: "string" } },
        required: ["issueDescription"],
      },
    },
  },
  skipImageUpload: {
    type: "function",
    function: {
      name: "skipImageUpload",
      description: "Call this tool if the user explicitly says NO to uploading an image.",
      parameters: { type: "object", properties: {} },
    },
  },
  recordSlotSelection: {
    type: "function",
    function: {
      name: "recordSlotSelection",
      description: "Call this tool ONCE the user has explicitly typed the time slot they want.",
      parameters: {
        type: "object",
        properties: { selectedSlot: { type: "string" } },
        required: ["selectedSlot"],
      },
    },
  },

  // --- UI TRIGGER TOOLS (To open popups) ---
  requestImageUpload: {
    type: "function",
    function: {
      name: "requestImageUpload",
      description: "MANDATORY: Call this tool IMMEDIATELY to reopen the Image Upload UI ANYTIME the user types in the chat, asks a question, or tries to bypass the UI. DO NOT converse.",
      parameters: { type: "object", properties: {} }
    }
  },
  checkCalendarAvailability: {
    type: "function",
    function: {
      name: "checkCalendarAvailability",
      description: "Checks the calendar for slots on a specific date. Input MUST be ISO 8601.",
      parameters: {
        type: "object",
        properties: { dateIsoString: { type: "string" } },
        required: ["dateIsoString"],
      },
    },
  },
  requestCustomerDetails: {
    type: "function",
    function: {
      name: "requestCustomerDetails",
      description: "MANDATORY: Call this tool IMMEDIATELY to open or reopen the Customer Details form ANYTIME the user types in the chat, asks a question, or tries to bypass the UI. DO NOT converse.",
      parameters: { type: "object", properties: {} }
    }
  },
  bookAppointment: {
    type: "function",
    function: {
      name: "bookAppointment",
      description: "Books the appointment and triggers the Payment UI.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" }, customerEmail: { type: "string" },
          customerPhone: { type: "string" }, issueDescription: { type: "string" },
          startIsoString: { type: "string" }
        },
        required: ["customerName", "customerEmail", "customerPhone", "issueDescription", "startIsoString"],
      },
    },
  },
  resendPaymentPopup: {
    type: "function",
    function: {
      name: "resendPaymentPopup",
      description: "MANDATORY: Call this tool IMMEDIATELY to reopen the payment UI ANYTIME the user types in the chat, asks a question, or tries to bypass the UI. DO NOT converse.",
      parameters: {
        type: "object",
        properties: { trackingToken: { type: "string" } },
        required: ["trackingToken"],
      },
    },
  },
  endConversation: {
    type: "function",
    function: {
      name: "endConversation",
      description: "MANDATORY: Call this tool IMMEDIATELY to permanently hang up the call. You MUST trigger this tool when the user has no more questions, says 'okay' or 'no thanks' at the end of a booking, or when enforcing the 2-Strike rule. DO NOT just say goodbye in text without calling this tool.",
      parameters: { type: "object", properties: {} }
    }
  }
};

// =========================================================
// 2. THE DYNAMIC PROMPT BUILDER
// =========================================================
export const promptBuilder = {
  
  buildStateContext(state: SessionState, currentDateTime: string): { prompt: string, allowedTools: any[] } {
    
    // 1. BASE PERSONA (Upgraded with Forward-Only and Explicit Strike Rules)
    let prompt = `You are Xynsis AI, an expert dispatch assistant for a plumbing company.
Current Time: ${currentDateTime}
STRICT RULES:
- You ONLY handle plumbing issues.
- FORWARD-ONLY PROGRESSION: You cannot go backward. If the user asks to change a previous answer, upload a new image, or go back to a previous step, politely inform them that the system cannot reverse steps, and ask them to answer your current question.
- THE 2-STRIKE RULE: You must warn the user FIRST before hanging up. 
  * Strike 1: If the user is uncooperative or goes off-topic, give them a polite warning and repeat your current question.
  * Strike 2: If they do it a second time, you MUST call the 'endConversation' tool.
  * HANG-UP SCRIPT: If the appointment is ALREADY confirmed, say "Thank you for choosing us! Have a great day!". If the appointment is NOT confirmed, say "I apologize, but I am unable to assist further. Have a great day!"
- NEVER invent data, slots, or tokens.

---
CURRENT MEMORY (What you already know):
- Issue: ${state.issueDescription || "Not yet provided"}
- Image Analyzed: ${state.imageAnalyzed ? "Yes" : "No"}
- Date Requested: ${state.selectedDate || "Not yet provided"}
- Slot Selected: ${state.selectedSlot || "Not yet provided"}
- Tracking Token: ${state.trackingToken || "Not yet generated"}
---

`;

    let allowedTools: any[] = [];

    // 2. INJECT ONLY THE RULES & TOOLS FOR THE CURRENT STATE
    switch (state.currentState) {
      
      case "STATE_1_ISSUE_GATHERING":
        prompt += `CURRENT GOAL: Determine the user's plumbing issue.
- Ask them what the problem is.
- ONCE they provide a clear plumbing issue, you MUST call the 'recordIssue' tool to save it.`;
        allowedTools = [ALL_TOOLS.recordIssue];
        break;

      case "STATE_2_IMAGE_INTENT":
        prompt += `CURRENT GOAL: Ask if they want to upload a photo of the issue.
- Ask exactly: "Would you like to upload a photo of the issue to help us better understand it?"
- If they say YES: Call the 'requestImageUpload' tool.
- If they say NO: Call the 'skipImageUpload' tool.`;
        allowedTools = [ALL_TOOLS.requestImageUpload, ALL_TOOLS.skipImageUpload];
        break;

      case "STATE_3_IMAGE_UPLOAD":
        prompt += `CURRENT GOAL: Wait for the user to upload an image.
- ZERO-TRUST UI: A file upload window is open on their screen. 
- RECOVERY RULE: If the user types any text, asks a question, or says they closed the popup, YOU MUST CALL the 'requestImageUpload' tool again. Do not hesitate to repeat the tool call. DO NOT converse or answer questions.
- Reply: "Please use the file uploader on your screen to provide the image."`;
        allowedTools = [ALL_TOOLS.requestImageUpload];
        break;

      case "STATE_4_DATE_SELECTION":
        prompt += `CURRENT GOAL: Find out what date they want the plumber to visit.
- Ask them what day they prefer.
- ONCE they provide a date, call the 'checkCalendarAvailability' tool using exactly ISO 8601 format.`;
        allowedTools = [ALL_TOOLS.checkCalendarAvailability];
        break;

      case "STATE_5_SLOT_SELECTION":
        prompt += `CURRENT GOAL: Have the user pick a specific time slot.
- ZERO-TRUST UI: A slot picker is open on their screen.
- If they manually type a slot that matches the options, call the 'recordSlotSelection' tool.`;
        allowedTools = [ALL_TOOLS.recordSlotSelection, ALL_TOOLS.checkCalendarAvailability]; 
        break;

      case "STATE_6_CUSTOMER_DETAILS":
        prompt += `CURRENT GOAL: Collect Customer Details securely.
- ZERO-TRUST UI: A secure details form is open on their screen.
- RECOVERY RULE: If they type anything, ask a question, or say they closed it, YOU MUST CALL the 'requestCustomerDetails' tool again. Do not hesitate to repeat the tool call. DO NOT converse or answer questions.
- Reply: "For security purposes, please enter your details directly into the form on your screen."`;
        allowedTools = [ALL_TOOLS.requestCustomerDetails];
        break;

      case "STATE_7_PAYMENT":
        prompt += `CURRENT GOAL: Await Payment Confirmation.
- ZERO-TRUST UI: A payment window is open on their screen.
- RECOVERY RULE: If they type anything, ask a question, or say they closed it, YOU MUST CALL the 'resendPaymentPopup' tool using their tracking token. Do not hesitate to repeat the tool call. DO NOT converse or answer questions.
- Reply: "Your payment is pending. Please complete the secure transaction on your screen."`;
        allowedTools = [ALL_TOOLS.resendPaymentPopup];
        break;

      case "STATE_8_CONFIRMATION":
        prompt += `CURRENT GOAL: Wrap up the conversation.
- Tell the user their appointment is confirmed and give them their tracking token: ${state.trackingToken}
- Ask if there is anything else. 
- IF THE USER SAYS NO (e.g., "no", "okay", "no thanks", "that's it"): You MUST immediately call the 'endConversation' tool. 
- STRICT RULE: You are physically unable to hang up the phone using text. You MUST fire the tool call to end the session.`;
        break;

      default:
        prompt += `Ask the user how you can help them today.`;
    }

    // GLOBALLY ALLOW HANG-UPS AT ANY STEP
    allowedTools.push(ALL_TOOLS.endConversation);

    return { prompt, allowedTools };
  }
};