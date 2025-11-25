// server.js
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import OpenAI from "openai";
import { AssemblyAIStreaming } from "./assemblyai-streaming.js";
import cors from "cors";

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

// Get AssemblyAI API key from environment or use fallback
const assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;

// API key configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000", // React dev server
    credentials: true,
  })
);
app.use(express.json());

// Helper to build OpenAI prompts
function buildOpenAIPrompts({ transcript, query, queryType }) {
  let systemPrompt = "";
  let userPrompt = "";

  switch (queryType) {
    case "summary":
      systemPrompt =
        "You are a helpful AI assistant that creates concise, educational summaries of classroom transcripts. Focus on key concepts, important points, and learning objectives.";
      userPrompt = `Please provide a summary of this class transcript:\n\n${transcript}`;
      break;
    case "deadline":
      systemPrompt =
        "You are a helpful AI assistant that identifies deadlines, due dates, and important dates mentioned in classroom transcripts. Extract and list all deadlines with clear formatting.";
      userPrompt = `Please identify any deadlines, due dates, or important dates mentioned in this class transcript:\n\n${transcript}`;
      break;
    case "question": {
      const isTranscriptRelated =
        transcript &&
        (query.toLowerCase().includes("class") ||
          query.toLowerCase().includes("lecture") ||
          query.toLowerCase().includes("transcript") ||
          query.toLowerCase().includes("discussed") ||
          query.toLowerCase().includes("mentioned") ||
          transcript.toLowerCase().includes(query.toLowerCase().split(" ")[0]));

      if (isTranscriptRelated && transcript.trim()) {
        systemPrompt =
          "Answer questions based on the provided class transcript. For math: use $expression$ for inline math and $$expression$$ for display math. Never use ( ) or [ ] for math.";
        userPrompt = `Class transcript:\n\n${transcript}\n\nQuestion: ${query}`;
      } else {
        systemPrompt =
          "Answer the question directly. For math: use $expression$ for inline math and $$expression$$ for display math. Never use ( ) or [ ] for math.";
        userPrompt = query;
      }
      break;
    }
    default:
      systemPrompt =
        "Answer questions directly. For math: use $expression$ for inline math and $$expression$$ for display math. Never use ( ) or [ ] for math.";
      userPrompt = query || `Analyze this transcript:\n\n${transcript}`;
  }

  return { systemPrompt, userPrompt };
}

// OpenAI API endpoint - non-streaming (kept for compatibility)
app.post("/api/openai/query", async (req, res) => {
  try {
    const { transcript, query, queryType } = req.body;

    if (!transcript && !query) {
      return res.status(400).json({ error: "Transcript or query is required" });
    }

    const { systemPrompt, userPrompt } = buildOpenAIPrompts({
      transcript,
      query,
      queryType,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });

    const response = completion.choices[0].message.content;

    res.json({ response });
  } catch (error) {
    if (error.code === "invalid_api_key") {
      return res.status(401).json({
        error: "Invalid OpenAI API key. Please check your .env file.",
      });
    }

    if (error.code === "insufficient_quota" || error.status === 429) {
      return res.status(429).json({
        error:
          "OpenAI quota exceeded. Your free credits may have expired or you need to add billing to your OpenAI account.",
        details:
          "Visit https://platform.openai.com/account/billing to add a payment method, even for free usage.",
        errorType: "quota_exceeded",
      });
    }

    res.status(500).json({
      error: "Failed to process request with OpenAI",
      details: error.message,
    });
  }
});

// OpenAI API endpoint - Server-Sent Events streaming
app.get("/api/openai/query/stream", async (req, res) => {
  try {
    const { transcript = "", query = "", queryType = "question" } = req.query;

    if (!transcript && !query) {
      res.writeHead(400, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      });
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: "Transcript or query is required",
        })}\n\n`
      );
      return res.end();
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    // Flush headers immediately if possible so the browser starts the stream
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    // Send an initial comment to open the SSE stream
    res.write(`: connected\n\n`);

    const { systemPrompt, userPrompt } = buildOpenAIPrompts({
      transcript,
      query,
      queryType,
    });

    const stream = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.4,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
      }
    }

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      });
    }

    let errorPayload = {
      error: "Failed to process request with OpenAI",
      details: error.message,
    };

    if (error.code === "invalid_api_key") {
      errorPayload = {
        error: "Invalid OpenAI API key. Please check your .env file.",
      };
    } else if (error.code === "insufficient_quota" || error.status === 429) {
      errorPayload = {
        error:
          "OpenAI quota exceeded. Your free credits may have expired or you need to add billing to your OpenAI account.",
        details:
          "Visit https://platform.openai.com/account/billing to add a payment method, even for free usage.",
        errorType: "quota_exceeded",
      };
    }

    res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
    res.end();
  }
});

// Signup POST Method
app.post(
  "/signup/:first_name/:last_name/:email/:password",
  async (req, res) => {
    const { first_name, last_name, email, password } = req.params;
    try {
      const signup = await auth.signup(first_name, last_name, email, password);

      res.json(signup);
    } catch (err) {
      console.log(err);
    }
  }
);

app.post("/login/:email/:password/", async (req, res) => {
  const { email, password } = req.params;
  try {
    const login = await auth.login(email, password);
    res.json(login);
  } catch (err) {
    console.log(err);
  }
});

// WebSocket connection handler
function setupWebSocketHandlers(wss) {
  wss.on("connection", async (client) => {
    // Connect to AssemblyAI Realtime API
    const assemblyAI = new AssemblyAIStreaming(assemblyAIKey);
    let isSessionActive = false;
    let isTerminating = false;

    // Send initial connection confirmation to frontend first
    try {
      client.send(
        JSON.stringify({
          type: "connection_established",
          message: "WebSocket connection established successfully",
        })
      );
    } catch (sendError) {
      // Error sending connection confirmation to frontend
    }

    // Function to connect to AssemblyAI when needed
    const connectToAssemblyAI = async () => {
      if (isSessionActive || isTerminating) return; // Already connected or terminating

      try {
        await assemblyAI.connect(
          // onMessage
          (data) => {
            // Forward all messages to frontend
            try {
              client.send(JSON.stringify(data));
            } catch (sendError) {
              // Error sending message to frontend
            }
          },
          // onError
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
          // onClose
          (code, reason) => {
            isSessionActive = false;
            // Don't automatically reconnect on close - let the user manually restart
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

        // Send AssemblyAI connection confirmation to frontend
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
                "Failed to connect to AssemblyAI: " + connectionError.message,
            })
          );
        } catch (sendError) {
          // Error sending AssemblyAI error to frontend
        }
      }
    };

    // Frontend -> Backend -> AssemblyAI
    client.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.terminate_session) {
          // Set flags immediately to prevent race conditions
          isSessionActive = false;
          isTerminating = true;

          try {
            assemblyAI.terminate();

            // Send confirmation back to frontend
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
            isTerminating = false; // Reset flag after termination attempt
          }
          return;
        }

        if (data.audio_data) {
          // Only connect if not terminating and not already active
          if (!isSessionActive && !isTerminating) {
            await connectToAssemblyAI();
          }

          // Only send audio if session is active and not terminating
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

// Create WebSocket server for frontend clients
const server = app.listen(PORT, () => {
  // Server started
  console.log(`Server Running in ${PORT}`);
});

const wss = new WebSocketServer({ server });
setupWebSocketHandlers(wss);

// Add a simple test endpoint
app.get("/test", (req, res) => {
  res.json({
    message: "Server is running on port " + PORT,
    timestamp: new Date().toISOString(),
  });
});
