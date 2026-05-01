import { Request, Response } from "express";
import { db } from "../../db/index.js";

export const appointmentController = {
  // GET /api/v1/appointments?companyId=...
  async getAppointments(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.query.companyId as string;

      if (!companyId) {
        res.status(400).json({ error: "companyId query parameter is required." });
        return;
      }

      // Fetch all appointments for this organization, ordered by upcoming first
      const appointments = await db.appointment.findMany({
        where: { companyId },
        orderBy: { appointmentTime: 'asc' }
      });

      res.status(200).json(appointments);
    } catch (error) {
      console.error("Fetch Appointments Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};