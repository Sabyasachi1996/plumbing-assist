import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { companyRepository } from "../../repositories/company.repository.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

export const authController = {
  
  register: asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name, description } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required.", 400);
    }

    const existingCompany = await companyRepository.findByEmail(email);
    if (existingCompany) {
      throw new AppError("Email already in use.", 409); // 409 Conflict
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newCompany = await companyRepository.createCompany({
      name: name || "New Organization",
      email,
      description: description || "",
      password: hashedPassword,
    });

    res.status(201).json({ companyId: newCompany.id, message: "Registered successfully" });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const company = await companyRepository.findByEmail(email);
    
    if (!company) {
      throw new AppError("Invalid credentials.", 401);
    }

    const isValid = await bcrypt.compare(password, company.password);
    
    if (!isValid) {
      throw new AppError("Invalid credentials.", 401);
    }

    res.status(200).json({ companyId: company.id, message: "Login successful" });
  }),

  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.query.companyId as string;
    
    if (!companyId) {
      throw new AppError("companyId query parameter is required.", 400);
    }

    const company = await companyRepository.findById(companyId);

    res.status(200).json({ 
      isCalendarLinked: !!company?.googleRefreshToken 
    });
  })
};