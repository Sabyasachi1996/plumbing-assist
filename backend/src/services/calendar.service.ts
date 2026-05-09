import { google } from "googleapis";
import { oauth2Client } from "./google.service.js";
import { companyRepository } from "../repositories/company.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import crypto from "crypto";

export const calendarService = {
  
  async getCalendarClient(companyId: string) {
    const company = await companyRepository.findById(companyId);
    if (!company || !company.googleRefreshToken) {
      throw new AppError("Company not found or Google Calendar not linked.", 404);
    }

    oauth2Client.setCredentials({ refresh_token: company.googleRefreshToken });
    return google.calendar({ version: "v3", auth: oauth2Client });
  },

  async checkAvailability(companyId: string, dateIsoString: string) {
    try {
      const calendar = await this.getCalendarClient(companyId);
      
      const rawDate = dateIsoString.split('T'); 
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
      const allSlots = [{ start: 10, end: 12 }, { start: 12, end: 14 }, { start: 14, end: 16 }, { start: 16, end: 18 }];

      const availableSlots = allSlots.filter(slot => {
        const slotStart = new Date(`${rawDate}T${slot.start.toString().padStart(2, '0')}:00:00+05:30`).getTime();
        const slotEnd = new Date(`${rawDate}T${slot.end.toString().padStart(2, '0')}:00:00+05:30`).getTime();

        return !existingEvents.some(event => {
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          return (slotStart < new Date(event.end.dateTime).getTime() && slotEnd > new Date(event.start.dateTime).getTime());
        });
      });

      if (availableSlots.length === 0) {
        return { success: true, message: "There are no available slots on this date. Please ask the customer to pick another day." };
      }

      const formattedSlots = availableSlots.map(s => `${s.start}:00 to ${s.end}:00`);
      return { success: true, message: `Available slots for this date: ${formattedSlots.join(", ")}` };

    } catch (error) {
      logger.error("Calendar Check Error:", error);
      return { success: false, message: "Failed to check calendar availability due to a system error." };
    }
  },

  async bookAppointment(args: { companyId: string; customerName: string; customerEmail: string; customerPhone: string; issueDescription: string; startIsoString: string }) {
    try {
      const calendar = await this.getCalendarClient(args.companyId);
      
      const rawDate = args.startIsoString.split('T'); 
      const rawTime = args.startIsoString.split('T')[1].substring(0, 8); 
      const istDateString = `${rawDate}T${rawTime}+05:30`;
      const startTimeDb = new Date(istDateString);

      const rawHour = parseInt(rawTime.substring(0, 2), 10);
      const endHour = (rawHour + 2).toString().padStart(2, '0');
      
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

      // Using the repository we created earlier!
      await appointmentRepository.createAppointment({
        companyId: args.companyId,
        customerName: args.customerName,
        customerEmail: args.customerEmail,
        customerPhone: args.customerPhone,
        issueDescription: args.issueDescription,
        appointmentTime: startTimeDb,
        trackingToken: token,
      });

      return { 
        success: true, 
        message: `Successfully booked! Event ID: ${event.data?.id}. Please give the customer this Tracking Token: ${token}`,
        trackingToken: token // <-- Added this!
      };

    } catch (error) {
      logger.error("Calendar Booking Error:", error);
      return { success: false, message: "Failed to book the appointment on the calendar." };
    }
  }
};