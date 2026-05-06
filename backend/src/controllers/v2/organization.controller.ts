import { Request, Response } from "express";
import { db } from "../../db/index.js";
import { redisService } from "../../services/redis.service.js";

export const organizationController = {
  
  // POST /api/v2/organizations/sandbox
  async createSandbox(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        businessTypeId,
        description,
        logoUrl,
        businessUrl,
        startTime,
        endTime,
        visitFee,
        email,
        phone
      } = req.body;

      // 1. Validate required fields
      if (!name || !businessTypeId || !startTime || !endTime || (!email && !phone)) {
        res.status(400).json({ error: "Missing required fields. Name, Business Type, Hours, and either Email or Phone are required." });
        return;
      }

      // 2. Check if a record already exists with this email or phone
      const existingOrg = await db.organization.findFirst({
        where: {
          OR: [
            { email: email || undefined },
            { phone: phone || undefined }
          ]
        }
      });

      // If they are already a fully registered paying customer, stop them from making a sandbox
      if (existingOrg && existingOrg.status === "REGISTERED") {
        res.status(400).json({ error: "An organization with this email or phone is already fully registered." });
        return;
      }

      // 3. Set expiration to exactly 15 minutes from now
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Current time + 15 mins

      let organization;

      // 4. Upsert Logic: Create new or update existing sandbox
      if (existingOrg) {
        organization = await db.organization.update({
          where: { id: existingOrg.id },
          data: {
            name,
            businessTypeId,
            description,
            logoUrl,
            businessUrl,
            startTime,
            endTime,
            visitFee: visitFee ? parseFloat(visitFee) : null,
            sandboxExpiresAt: expiresAt,
          }
        });
      } else {
        organization = await db.organization.create({
          data: {
            name,
            businessTypeId,
            description,
            logoUrl,
            businessUrl,
            startTime,
            endTime,
            visitFee: visitFee ? parseFloat(visitFee) : null,
            email,
            phone,
            status: "SANDBOX",
            sandboxExpiresAt: expiresAt,
          }
        });
      }

      // 5. Store the 15-minute lock in Redis (900 seconds) to easily track active sessions
      // We can use this Redis key later to immediately block chat/voice requests if it expires
      await redisService.saveCallVariables(`sandbox_session_${organization.id}`, { 
        sessionId: `demo_${Date.now()}`,
        companyId: organization.id 
      });

      // 6. Generate the temporary Demo Script Tag for the frontend
      const demoScriptTag = `<script src="${process.env.BASE_URL || 'http://localhost:5000'}/widget-demo.js" data-org-id="${organization.id}" data-sandbox="true"></script>`;

      res.status(200).json({
        success: true,
        message: "Sandbox environment generated successfully for 15 minutes.",
        organizationId: organization.id,
        expiresAt: organization.sandboxExpiresAt,
        demoScriptTag: demoScriptTag
      });

    } catch (error) {
      console.error("Create Sandbox Error:", error);
      res.status(500).json({ error: "Failed to generate sandbox environment." });
    }
  },
  // GET /api/v2/organizations/lookup
  // Used by the Flutter app to fetch a returning user's Sandbox data
  async lookupSandbox(req: Request, res: Response): Promise<void> {
    try {
      const { email, phone } = req.query;

      if (!email && !phone) {
        res.status(400).json({ error: "Please provide an email or phone number." });
        return;
      }

      const organization = await db.organization.findFirst({
        where: {
          OR: [
            { email: (email as string) || undefined },
            { phone: (phone as string) || undefined }
          ]
        },
        include: { businessType: true } // Fetch the plumbing type name too!
      });

      if (!organization) {
        res.status(404).json({ error: "No existing sandbox found for this contact." });
        return;
      }

      res.status(200).json({ success: true, organization });
    } catch (error) {
      console.error("Lookup Error:", error);
      res.status(500).json({ error: "Failed to fetch organization data." });
    }
  },

  // POST /api/v2/organizations/confirm-registration
  // Upgrades the organization to REGISTERED and returns the production script
  async confirmRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { 
        organizationId, 
        paymentUrl, 
        calendarProvider, 
        calendarRefreshToken 
      } = req.body;

      // 1. Strict Validation
      if (!organizationId || !paymentUrl || !calendarProvider || !calendarRefreshToken) {
        res.status(400).json({ 
          error: "Missing required fields. Organization ID, Payment URL, Calendar Provider, and Refresh Token are required." 
        });
        return;
      }

      // 2. Verify the Organization exists and is currently in SANDBOX
      const existingOrg = await db.organization.findUnique({ where: { id: organizationId } });
      
      if (!existingOrg) {
        res.status(404).json({ error: "Organization not found." });
        return;
      }

      if (existingOrg.status === "REGISTERED") {
        res.status(400).json({ error: "This organization is already fully registered." });
        return;
      }

      // 3. Upgrade to fully registered and store the frontend's tokens!
      const updatedOrg = await db.organization.update({
        where: { id: organizationId },
        data: {
          paymentUrl,
          calendarProvider,
          calendarRefreshToken,
          status: "REGISTERED",
          sandboxExpiresAt: null, // Remove the 15-minute lock permanently
        }
      });

      // 4. Generate the REAL Production Script Tag (pointing to widget.js)
      const productionScriptTag = `<script src="${process.env.BASE_URL || 'http://localhost:5000'}/widget.js" data-org-id="${updatedOrg.id}"></script>`;

      res.status(200).json({
        success: true,
        message: "Registration completed successfully!",
        productionScriptTag: productionScriptTag
      });

    } catch (error) {
      console.error("Confirm Registration Error:", error);
      res.status(500).json({ error: "Failed to complete registration." });
    }
  }
};