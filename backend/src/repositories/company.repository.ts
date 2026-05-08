import { db } from "../db/index.js";
import { Prisma } from "@prisma/client";

export const companyRepository = {
  async findByEmail(email: string) {
    return db.company.findUnique({ where: { email } });
  },

  async findById(id: string) {
    return db.company.findUnique({ where: { id } });
  },

  async createCompany(data: Prisma.CompanyCreateInput) {
    return db.company.create({ data });
  },

  async updateGoogleToken(id: string, token: string) {
    return db.company.update({
      where: { id },
      data: { googleRefreshToken: token },
    });
  }
};