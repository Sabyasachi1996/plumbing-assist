import { Request, Response } from "express";
import { appointmentRepository } from "../../repositories/appointment.repository.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

export const appointmentController = {
  getAppointments: asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      throw new AppError("companyId query parameter is required.", 400);
    }

    const appointments = await appointmentRepository.findByCompanyId(companyId);

    res.status(200).json(appointments);
  })
};