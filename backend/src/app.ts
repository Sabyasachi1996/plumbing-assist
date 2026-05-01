import express from "express";
import cors from "cors";
import helmet from "helmet";
import v1Routes from "./routes/v1/index.js";
const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors({
  origin: [
    "http://localhost:5173", // Your local Vite frontend
    // "https://your-future-client-website.com" <-- You will add real domains here later
  ],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true, // Required if we ever add cookies or strict auth tokens
}));
app.use(express.json());
app.use(express.static('public'));

// A simple health check route to verify the server is alive
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Widget Core API is running perfectly." });
});
// Register the API Routes
app.use("/api/v1", v1Routes);

export default app;