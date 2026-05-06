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
  // TOOL 1: Check available 2-hour slots for a given date
  // TOOL 1: Check available 2-hour slots for a given date
  async checkAvailability(companyId: string, dateIsoString: string) {
    try {
      const calendar = await this.getCalendarClient(companyId);
      
      const rawDate = dateIsoString.split('T')[0]; 
      const dayStart = new Date(`${rawDate}T00:00:00+05:30`);
      const dayEnd = new Date(`${rawDate}T23:59:59+05:30`);

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        timeZone: "Asia/Kolkata", 
        singleEvents: true,
        orderBy: "startTime",
      });

      const existingEvents = response.data.items || [];

      const allSlots = [
        { start: 10, end: 12 },
        { start: 12, end: 14 },
        { start: 14, end: 16 },
        { start: 16, end: 18 },
      ];

      const availableSlots = allSlots.filter(slot => {
        const slotStart = new Date(`${rawDate}T${slot.start.toString().padStart(2, '0')}:00:00+05:30`).getTime();
        const slotEnd = new Date(`${rawDate}T${slot.end.toString().padStart(2, '0')}:00:00+05:30`).getTime();

        const isOccupied = existingEvents.some(event => {
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          const eventStart = new Date(event.start.dateTime).getTime();
          const eventEnd = new Date(event.end.dateTime).getTime();
          return (slotStart < eventEnd && slotEnd > eventStart);
        });
        return !isOccupied;
      });

      if (availableSlots.length === 0) {
        return { success: true, message: "There are no available slots on this date. Please ask the customer to pick another day." };
      }

      // 🚨 BUG 1 FIXED: Added s.start instead of s
      const formattedSlots = availableSlots.map(s => `${s.start}:00 to ${s.end}:00`);
      return { success: true, message: `Available slots for this date: ${formattedSlots.join(", ")}` };

    } catch (error) {
      console.error("Calendar Check Error:", error);
      return { success: false, message: "Failed to check calendar availability due to a system error." };
    }
  },

  // TOOL 2: Book the actual appointment
  async bookAppointment(args: { companyId: string; customerName: string; customerEmail: string; customerPhone: string; issueDescription: string; startIsoString: string }) {
    try {
      const calendar = await this.getCalendarClient(args.companyId);
      
      const rawDate = args.startIsoString.split('T')[0]; 
      const rawTime = args.startIsoString.split('T')[1].substring(0, 8); 
      
      const istDateString = `${rawDate}T${rawTime}+05:30`;
      const startTimeDb = new Date(istDateString);

      const rawHour = parseInt(rawTime.substring(0, 2), 10);
      const endHour = (rawHour + 2).toString().padStart(2, '0');
      
      // 🚨 BUG 2 FIXED: Explicitly injecting +05:30 directly into the Google Calendar string
      const googleStartTime = `${rawDate}T${rawTime}+05:30`;         
      const googleEndTime = `${rawDate}T${endHour}:00:00+05:30`;     

      const token = crypto.randomBytes(4).toString("hex").toUpperCase();

      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: `Plumbing Appt: ${args.customerName}`,
          description: `Customer: ${args.customerName}\nPhone: ${args.customerPhone}\nEmail: ${args.customerEmail}\nIssue: ${args.issueDescription}\nTracking Token: ${token}`,
          start: { dateTime: googleStartTime, timeZone: 'Asia/Kolkata' },
          end: { dateTime: googleEndTime, timeZone: 'Asia/Kolkata' },
        },
      });

      await db.appointment.create({
        data: {
          companyId: args.companyId,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          issueDescription: args.issueDescription,
          appointmentTime: startTimeDb,
          trackingToken: token,
        }
      });

      return { success: true, message: `Successfully booked! Event ID: ${event.data.id}. Please give the customer this Tracking Token: ${token}` };

    } catch (error) {
      console.error("Calendar Booking Error:", error);
      return { success: false, message: "Failed to book the appointment on the calendar." };
    }
  }
};