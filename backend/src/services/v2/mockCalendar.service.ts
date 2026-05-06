import crypto from "crypto";

export const mockCalendarService = {
  
  // MOCK TOOL 1: Always returns the standard business hours
  async checkAvailability(companyId: string, dateIsoString: string) {
    try {
      console.log(`[SANDBOX] Mocking availability check for Date: ${dateIsoString}`);
      
      // Simulate standard available slots
      const formattedSlots = ["10:00 to 12:00", "12:00 to 14:00", "14:00 to 16:00", "16:00 to 18:00"];
      
      return { 
        success: true, 
        message: `Available slots for this date: ${formattedSlots.join(", ")}` 
      };
    } catch (error) {
      return { success: false, message: "Mock calendar check failed." };
    }
  },

  // MOCK TOOL 2: Fakes a booking success without touching Postgres or Google
  async bookAppointment(args: { 
    companyId: string; 
    customerName: string; 
    customerEmail: string; 
    customerPhone: string; 
    issueDescription: string; 
    startIsoString: string 
  }) {
    try {
      console.log(`[SANDBOX] Mocking appointment booking for: ${args.customerName}`);

      // Generate a fake tracking token
      const token = crypto.randomBytes(4).toString("hex").toUpperCase();
      const fakeEventId = `mock_event_${Date.now()}`;

      return { 
        success: true, 
        message: `Successfully booked! Event ID: ${fakeEventId}. Please give the customer this Tracking Token: ${token}` 
      };
    } catch (error) {
      return { success: false, message: "Mock appointment booking failed." };
    }
  }
};