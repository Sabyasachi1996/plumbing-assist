import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { db } from "../../db/index.js"; // Adjust this path to wherever your Prisma client is exported

export const authController = {
  // POST /api/v1/auth/register
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, description } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }

      // Check if organization already exists
      const existingCompany = await db.company.findUnique({ where: { email } });
      if (existingCompany) {
        res.status(400).json({ error: "Email already in use." });
        return;
      }

      // Hash the password securely
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create the company in the database
      const newCompany = await db.company.create({
        data: {
          name: name || "New Organization",
          email,
          description:description || "",
          password: hashedPassword,
        },
      });

      res.status(201).json({ companyId: newCompany.id, message: "Registered successfully" });
    } catch (error) {
      console.error("Registration Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // POST /api/v1/auth/login
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const company = await db.company.findUnique({ where: { email } });
      
      if (!company) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }

      // Compare the plain text password from React with the hash in Postgres
      const isValid = await bcrypt.compare(password, company.password);
      
      if (!isValid) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }

      res.status(200).json({ companyId: company.id, message: "Login successful" });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  // GET /api/v1/auth/status?companyId=...
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.query.companyId as string;
      if (!companyId) return;

      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { googleRefreshToken: true }
      });

      // If the token exists and isn't null, return true
      res.status(200).json({ 
        isCalendarLinked: !!company?.googleRefreshToken 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  }
};