// server.js
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";
import { AssemblyAIStreaming } from "./router/assemblyai-streaming.js";
import testRouter from "./router/test.js";
import openaiRouter, { getOpenAI } from "./router/openai.js";
import createAuthRouter from "./router/auth.js";
import { checkAndAnswerIfQuestion } from "./question-detection.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

const assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;

// SSE connections for detected-question answers (sessionId -> response)
const sessionIdToSSE = new Map();

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Routers
app.use("/", testRouter);
app.use("/api/openai", openaiRouter);

let auth;
try {
  const authModule = await import("./auth.js");
  auth = authModule.default;
} catch {
  auth = {
    async signup() {
      return { message: "Auth not configured" };
    },
    async login() {
      return { message: "Auth not configured" };
    },
  };
}
app.use("/", createAuthRouter(auth));

// SSE endpoint for detected-question answers (client opens with sessionId from WebSocket)
app.get("/api/openai/detected-questions/stream", (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "sessionId required" }));
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  sessionIdToSSE.set(sessionId, res);
  res.on("close", () => sessionIdToSSE.delete(sessionId));
});

// WebSocket connection handler
function setupWebSocketHandlers(wss) {
  wss.on("connection", async (client) => {
    const sessionId = crypto.randomUUID();
    client.sessionId = sessionId;
    const assemblyAI = new AssemblyAIStreaming(assemblyAIKey);
    let isSessionActive = false;
    let isTerminating = false;
    let accumulatedTranscript = "";
    let lastFinalText = "";

    try {
      client.send(
        JSON.stringify({
          type: "connection_established",
          message: "WebSocket connection established successfully",
          sessionId,
        })
      );
    } catch (sendError) {
      // Error sending connection confirmation to frontend
    }

    const connectToAssemblyAI = async () => {
      if (isSessionActive || isTerminating) return;

      try {
        await assemblyAI.connect(
          (data) => {
            if (data.final && data.text) {
              const text = (data.text || "").trim();
              if (text) {
                accumulatedTranscript += text + " ";
                lastFinalText = text;
                try {
                  const openai = getOpenAI();
                  const sseRes = sessionIdToSSE.get(client.sessionId);
                  const callbacks = sseRes
                    ? {
                        onQuestion(question) {
                          sseRes.write(
                            `event: question\ndata: ${JSON.stringify({ question })}\n\n`
                          );
                          if (typeof sseRes.flush === "function") sseRes.flush();
                        },
                        onToken(token) {
                          sseRes.write(
                            `event: token\ndata: ${JSON.stringify({ token })}\n\n`
                          );
                          if (typeof sseRes.flush === "function") sseRes.flush();
                        },
                        onDone() {
                          sseRes.write(`event: done\ndata: {}\n\n`);
                          if (typeof sseRes.flush === "function") sseRes.flush();
                        },
                      }
                    : null;
                  checkAndAnswerIfQuestion(
                    openai,
                    lastFinalText,
                    accumulatedTranscript,
                    callbacks
                  ).catch((err) => {
                    if (sseRes)
                      sseRes.write(
                        `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
                      );
                  });
                } catch (e) {
                  // OPENAI_API_KEY missing or invalid
                }
              }
            }
            try {
              client.send(JSON.stringify(data));
            } catch (sendError) {
              // Error sending message to frontend
            }
          },
          (error) => {
            isSessionActive = false;
            try {
              client.send(
                JSON.stringify({
                  error: "AssemblyAI connection error: " + error.message,
                })
              );
            } catch (sendError) {
              // Error sending error to frontend
            }
          },
          (code, reason) => {
            isSessionActive = false;
            try {
              if (code === 4001) {
                client.send(
                  JSON.stringify({ error: "Invalid AssemblyAI API key" })
                );
              } else if (code === 4105) {
                client.send(
                  JSON.stringify({ error: "AssemblyAI model deprecated" })
                );
              } else {
                client.send(
                  JSON.stringify({
                    error: `AssemblyAI connection closed: ${code} - ${reason}`,
                  })
                );
              }
            } catch (sendError) {
              // Error sending close message to frontend
            }
          }
        );

        isSessionActive = true;

        try {
          client.send(
            JSON.stringify({
              type: "assemblyai_connected",
              message: "AssemblyAI connection established successfully",
            })
          );
        } catch (sendError) {
          // Error sending AssemblyAI confirmation to frontend
        }
      } catch (connectionError) {
        isSessionActive = false;
        try {
          client.send(
            JSON.stringify({
              type: "assemblyai_error",
              error:
                "Failed to connect to AssemblyAI: " +
                connectionError.message,
            })
          );
        } catch (sendError) {
          // Error sending AssemblyAI error to frontend
        }
      }
    };

    client.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.terminate_session) {
          isSessionActive = false;
          isTerminating = true;

          try {
            assemblyAI.terminate();

            try {
              client.send(
                JSON.stringify({
                  type: "session_terminated",
                  message: "AssemblyAI session terminated successfully",
                })
              );
            } catch (sendError) {
              // Error sending termination confirmation to frontend
            }
          } catch (error) {
            try {
              client.send(
                JSON.stringify({
                  type: "termination_error",
                  error:
                    "Failed to terminate AssemblyAI session: " + error.message,
                })
              );
            } catch (sendError) {
              // Error sending termination error to frontend
            }
          } finally {
            isTerminating = false;
          }
          return;
        }

        if (data.audio_data) {
          if (!isSessionActive && !isTerminating) {
            await connectToAssemblyAI();
          }

          if (
            isSessionActive &&
            !isTerminating &&
            assemblyAI &&
            assemblyAI.ws &&
            assemblyAI.ws.readyState === 1
          ) {
            try {
              assemblyAI.sendAudio(data.audio_data);
            } catch (audioError) {
              // Error sending audio to AssemblyAI
            }
          }
        }
      } catch (e) {
        client.send(JSON.stringify({ error: "Invalid message format" }));
      }
    });

    client.on("close", () => {
      if (isSessionActive) {
        assemblyAI.terminate();
        isSessionActive = false;
      }
    });

    client.on("error", (err) => {
      if (isSessionActive) {
        assemblyAI.terminate();
        isSessionActive = false;
      }
    });
  });
}

const server = app.listen(PORT, () => {
  console.log(`Server Running in ${PORT}`);
});

const wss = new WebSocketServer({ server });
setupWebSocketHandlers(wss);
