import express from "express";
import cors from "cors";
import helmet from "helmet";
import v1Routes from "./routes/v1/index.js";
import v2Routes from "./routes/v2/index.js";
import { createServer } from "http";
import {WebSocketServer} from "ws";
import { voiceController } from "./controllers/v1/voice.controller.js";
import { widgetController } from "./controllers/v2/widget.controller.js";
import { logger } from "./utils/logger.js";
import morgan from "morgan";
import { errorHandler } from "./middlewares/error.middleware.js";
const app = express();
// Morgan request logging and attaching it with winston
const morganFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);
// Security and utility middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
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
//TODO: need to fix the cors for production grade later. currently open for local testing
/* app.use(cors({
  origin: [
    "http://localhost:50778",
    "https://app.example.com",
    "http://localhost:5173"
  ],
  credentials: true,
})); */
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.static('public'));

// A simple health check route to verify the server is alive
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Widget Core API is running perfectly." });
});
// Register the API Routes
app.use("/api/v1", v1Routes);
app.use("/api/v2", v2Routes);
app.use(errorHandler);
const server = createServer(app);
const wss = new WebSocketServer({server})
wss.on('connection', (ws, req) => {
  if (req.url?.startsWith('/api/v1/voice/stream')) {
    console.log('🎙️ Retell AI connected to WebSocket!');
    voiceController.handleStream(ws,req);
    // We will pass this to our new voice controller shortly
  }else if (req.url?.startsWith('/api/v2/widget/ws')) {
    widgetController.handleClientStream(ws, req);
  } 
  else {
    ws.close();
  }
});
export default server;