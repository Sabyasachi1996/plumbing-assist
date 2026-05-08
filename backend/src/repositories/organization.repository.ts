import { db } from "../db/index.js";
import { Prisma } from "@prisma/client";

export const organizationRepository = {
  // Find an organization by either email or phone, and include the business type
  async findByEmailOrPhone(email?: string, phone?: string) {
    if (!email && !phone) return null;

    return db.organization.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : [])
        ]
      },
      include: { businessType: true }
    });
  },

  // Find an organization by its unique ID
  async findById(id: string) {
    return db.organization.findUnique({ where: { id } });
  },

  // Create a brand new sandbox organization
  async createSandbox(data: Prisma.OrganizationUncheckedCreateInput) {
    return db.organization.create({ data });
  },

  // Update any existing organization's details
  async updateOrganization(id: string, data: Prisma.OrganizationUncheckedUpdateInput) {
    return db.organization.update({ 
      where: { id }, 
      data 
    });
  }
};