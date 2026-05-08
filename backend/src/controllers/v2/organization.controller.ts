import { Request, Response } from "express";
import { organizationRepository } from "../../repositories/organization.repository.js";
import { redisService } from "../../services/redis.service.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {businessTypeRepository} from "../../repositories/businessType.repository.js"
export const organizationController = {
  
  createSandbox: asyncHandler(async (req: Request, res: Response) => {
    const { name, businessTypeId, description, logoUrl, businessUrl, startTime, endTime, visitFee, email, phone } = req.body;

    // 1. Check if organization already exists using the repository
    const existingOrg = await organizationRepository.findByEmailOrPhone(email, phone);

    if (existingOrg && existingOrg.status === "REGISTERED") {
      throw new AppError("An organization with this email or phone is already fully registered.", 409); // 409 Conflict
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 
    let organization;

    // 2. Upsert using repository
    if (existingOrg) {
      organization = await organizationRepository.updateOrganization(existingOrg.id, {
        name, businessTypeId, description, logoUrl, businessUrl, startTime, endTime, 
        visitFee: visitFee ? parseFloat(visitFee) : null,
        sandboxExpiresAt: expiresAt,
      });
    } else {
      organization = await organizationRepository.createSandbox({
        name, businessTypeId, description, logoUrl, businessUrl, startTime, endTime, 
        visitFee: visitFee ? parseFloat(visitFee) : null,
        email, phone, status: "SANDBOX", sandboxExpiresAt: expiresAt,
      });
    }

    // 3. Save session to Redis
    await redisService.saveCallVariables(`sandbox_session_${organization.id}`, { 
      sessionId: `demo_${Date.now()}`,
      companyId: organization.id 
    });

    const demoScriptTag = `<script src="${process.env.BASE_URL || 'http://localhost:5000'}/widget-demo.js" data-org-id="${organization.id}" data-sandbox="true"></script>`;

    res.status(200).json({
      error:false,
      success: true,
      message: "Sandbox environment generated successfully for 15 minutes.",
      organizationId: organization.id,
      expiresAt: organization.sandboxExpiresAt,
      demoScriptTag,
      data:{
        orgId:organization.id
      }
    });
  }),

  lookupSandbox: asyncHandler(async (req: Request, res: Response) => {
    const { email, phone } = req.query;

    const organization = await organizationRepository.findByEmailOrPhone(email as string, phone as string);

    if (!organization) {
      throw new AppError("No existing sandbox found for this contact.", 404);
    }

    res.status(200).json({
      error:false,
      message:"organization fetched",
      success: true,
      organization,
      data:organization
    });
  }),
  fetchBusinessTypes: asyncHandler(async (req:Request,res:Response) => {
    const businessTypes = await businessTypeRepository.getBusinessTypes();
    return res.status(200).json({
      error:false,
      message:"business types fetched",
      data:businessTypes
    });
  }),
  confirmRegistration: asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, paymentUrl, calendarProvider, calendarRefreshToken } = req.body;

    const existingOrg = await organizationRepository.findById(organizationId);
    
    if (!existingOrg) {
      throw new AppError("Organization not found.", 404);
    }

    if (existingOrg.status === "REGISTERED") {
      throw new AppError("This organization is already fully registered.", 400);
    }

    const updatedOrg = await organizationRepository.updateOrganization(organizationId, {
      paymentUrl,
      calendarProvider,
      calendarRefreshToken,
      status: "REGISTERED",
      sandboxExpiresAt: null, 
    });

    const productionScriptTag = `<script src="${process.env.BASE_URL || 'http://localhost:5000'}/widget.js" data-org-id="${updatedOrg.id}"></script>`;

    res.status(200).json({
      success: true,
      message: "Registration completed successfully!",
      productionScriptTag
    });
  }),
  getOrganization: asyncHandler(async (req:Request,res:Response) => {
    const params = req.params;
    const orgId = params.id as string;
    const data = await organizationRepository.findById(orgId);
    if(!data) throw new AppError("No organization found",404);
    return res.status(200).json({
      error:false,
      message:"organization fetched",
      data
    });
  })
};