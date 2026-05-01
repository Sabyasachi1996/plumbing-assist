import { google } from "googleapis";
import { oauth2Client } from "./google.service.js";
import { db } from "../db/index.js";
import crypto from "crypto";

export const calendarService = {
  
  // Internal helper to get an authenticated Google Calendar instance for a specific company
  async getCalendarClient(companyId: string) {
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company || !company.googleRefreshToken) {
      throw new Error("Company not found or Google Calendar not linked.");
    }

    // Load the refresh token into our client
    oauth2Client.setCredentials({ refresh_token: company.googleRefreshToken });
    return google.calendar({ version: "v3", auth: oauth2Client });
  },

  // TOOL 1: Check available 2-hour slots for a given date
  async checkAvailability(companyId: string, dateIsoString: string) {
    try {
      const calendar = await this.getCalendarClient(companyId);
      
      // We parse the requested date, and set the boundaries: 10 AM to 6 PM
      const targetDate = new Date(dateIsoString);
      const startOfDay = new Date(targetDate.setHours(10, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(18, 0, 0, 0));

      // Fetch all existing events for that day
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const existingEvents = response.data.items || [];

      // Our hardcoded 2-hour slots for the MVP
      const allSlots = [
        { start: 10, end: 12 },
        { start: 12, end: 14 },
        { start: 14, end: 16 },
        { start: 16, end: 18 },
      ];

      // Filter out slots that overlap with existing Google Calendar events
      const availableSlots = allSlots.filter(slot => {
        const slotStart = new Date(targetDate.setHours(slot.start, 0, 0, 0)).getTime();
        const slotEnd = new Date(targetDate.setHours(slot.end, 0, 0, 0)).getTime();

        // Check if any existing event overlaps with this slot
        const isOccupied = existingEvents.some(event => {
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          const eventStart = new Date(event.start.dateTime).getTime();
          const eventEnd = new Date(event.end.dateTime).getTime();
          
          return (slotStart < eventEnd && slotEnd > eventStart);
        });

        return !isOccupied; // Keep it if it's NOT occupied
      });

      if (availableSlots.length === 0) {
        return { success: true, message: "There are no available slots on this date. Please ask the customer to pick another day." };
      }

      // Format the output for the AI to read easily
      const formattedSlots = availableSlots.map(s => `${s.start}:00 to ${s.end}:00`);
      return { success: true, message: `Available slots for this date: ${formattedSlots.join(", ")}` };

    } catch (error) {
      console.error("Calendar Check Error:", error);
      return { success: false, message: "Failed to check calendar availability due to a system error." };
    }
  },

  // TOOL 2: Book the actual appointment
  async bookAppointment(args: { 
    companyId: string; 
    customerName: string; 
    customerEmail: string; 
    customerPhone: string; 
    issueDescription: string; 
    startIsoString: string 
  }) {
    try {
      const calendar = await this.getCalendarClient(args.companyId);
      
      // 1. STRIP AND FORCE IST TIMEZONE
      const rawDate = args.startIsoString.split('T')[0]; 
      const rawTime = args.startIsoString.split('T')[1].substring(0, 8); 
      
      const istDateString = `${rawDate}T${rawTime}+05:30`;
      const startTime = new Date(istDateString);
      
      // 2. FORCE 2-HOUR DURATION
      const endTime = new Date(startTime.getTime() + (2 * 60 * 60 * 1000)); 

      const token = crypto.randomBytes(4).toString("hex").toUpperCase();

      // 3. SAVE TO GOOGLE CALENDAR (with detailed description for the plumber)
      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: `Plumbing Appt: ${args.customerName}`,
          description: `Customer: ${args.customerName}\nPhone: ${args.customerPhone}\nEmail: ${args.customerEmail}\nIssue: ${args.issueDescription}\nTracking Token: ${token}`,
          start: { 
            dateTime: startTime.toISOString(), 
            timeZone: 'Asia/Kolkata' 
          },
          end: { 
            dateTime: endTime.toISOString(), 
            timeZone: 'Asia/Kolkata' 
          },
        },
      });

      // 4. SAVE TO POSTGRES DATABASE (for the organization's SaaS dashboard)
      await db.appointment.create({
        data: {
          companyId: args.companyId,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          issueDescription: args.issueDescription,
          appointmentTime: startTime,
          trackingToken: token,
        }
      });

      return { 
        success: true, 
        message: `Successfully booked! Event ID: ${event.data.id}. Please give the customer this Tracking Token: ${token}` 
      };

    } catch (error) {
      console.error("Calendar Booking Error:", error);
      return { success: false, message: "Failed to book the appointment on the calendar." };
    }
  }
};