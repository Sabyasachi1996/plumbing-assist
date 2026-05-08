import { db } from "../db/index.js";
import { Prisma } from "@prisma/client";

export const appointmentRepository = {
  async findByCompanyId(companyId: string) {
    return db.appointment.findMany({
      where: { companyId },
      orderBy: { appointmentTime: 'asc' }
    });
  },
  async createAppointment(data: Prisma.AppointmentUncheckedCreateInput) {
    return db.appointment.create({
      data
    });
  }
};