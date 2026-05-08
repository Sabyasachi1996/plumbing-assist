import { Router } from "express";
import { organizationController } from "../../controllers/v2/organization.controller.js";
import { confirmRegistrationValidator, createSandboxValidator, lookupSandboxValidator } from "../../validators/organization.validator.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = Router();

// Sandbox & Registration Flows
router.post("/organizations/sandbox",createSandboxValidator,validate, organizationController.createSandbox);
router.get("/organizations/lookup",lookupSandboxValidator,validate, organizationController.lookupSandbox);
router.post("/organizations/confirm-registration",confirmRegistrationValidator,validate, organizationController.confirmRegistration);
router.get("/organizations/business-types",organizationController.fetchBusinessTypes);
router.get("/organization/:id",organizationController.getOrganization);
export default router;