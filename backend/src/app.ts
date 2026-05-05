import express from "express";
import cors from "cors";
import helmet from "helmet";
import v1Routes from "./routes/v1/index.js";
import { createServer } from "http";
import {WebSocketServer} from "ws";
import { voiceController } from "./controllers/v1/voice.controller.js";
const app = express();

// Security and utility middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": [
          "'self'", 
          "'unsafe-inline'", 
          "https://esm.sh",
          "https://moltenly-undeflective-carol.ngrok-free.dev" // <-- ADD YOUR NGROK URL HERE
        ], 
        "connect-src": [
          "'self'", 
          "wss://api.retellai.com", 
          "https://api.retellai.com", 
          "https://*.livekit.cloud", 
          "wss://*.livekit.cloud",
          "https://esm.sh",
          "https://moltenly-undeflective-carol.ngrok-free.dev"
        ] 
      },
    },
  })
);
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
const server = createServer(app);
const wss = new WebSocketServer({server})
wss.on('connection', (ws, req) => {
  if (req.url?.startsWith('/api/v1/voice/stream')) {
    console.log('🎙️ Retell AI connected to WebSocket!');
    voiceController.handleStream(ws,req);
    // We will pass this to our new voice controller shortly
  } else {
    ws.close();
  }
});
export default server;