import express from "express";
import OpenAI from "openai";

const router = express.Router();

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

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

// POST /api/openai/query - non-streaming (kept for compatibility)
router.post("/query", async (req, res) => {
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

    const openai = getOpenAI();
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

// GET /api/openai/query/stream - Server-Sent Events streaming
router.get("/query/stream", async (req, res) => {
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

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    res.write(`: connected\n\n`);

    const { systemPrompt, userPrompt } = buildOpenAIPrompts({
      transcript,
      query,
      queryType,
    });

    const openai = getOpenAI();
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

export default router;
