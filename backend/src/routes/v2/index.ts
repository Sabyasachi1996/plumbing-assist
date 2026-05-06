import { Router } from "express";
import { organizationController } from "../../controllers/v2/organization.controller.js";

const router = Router();

// Sandbox & Registration Flows
router.post("/organizations/sandbox", organizationController.createSandbox);
router.get("/organizations/lookup", organizationController.lookupSandbox);
router.post("/organizations/confirm-registration", organizationController.confirmRegistration);

export default router;