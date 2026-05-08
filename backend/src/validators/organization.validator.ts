import { body, query } from "express-validator";

export const createSandboxValidator = [
  body("name").notEmpty().withMessage("Organization name is required."),
  body("businessTypeId").isUUID().withMessage("Valid Business Type ID is required."),
  body("startTime").matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("Start time must be in HH:MM format."),
  body("endTime").matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("End time must be in HH:MM format."),
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either Email or Phone must be provided.");
    }
    return true;
  }),
];

export const lookupSandboxValidator = [
  query().custom((value, { req }) => {
    if (!req.query?.email && !req.query?.phone) {
      throw new Error("Either Email or Phone is required for lookup.");
    }
    return true;
  }),
];

export const confirmRegistrationValidator = [
  body("organizationId").isUUID().withMessage("Valid Organization ID is required."),
  body("paymentUrl").isURL().withMessage("A valid Payment URL is required."),
  body("calendarProvider").notEmpty().withMessage("Calendar provider name is required."),
  body("calendarRefreshToken").notEmpty().withMessage("Calendar refresh token is required."),
];