import WebSocket from "ws";

export class AssemblyAIStreaming {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
  }

  async connect(onMessage, onError, onClose) {
    try {
      if (!this.apiKey) {
        throw new Error("AssemblyAI API key is required");
      }

      // Create socket with correct endpoint, configuration, and headers
      const wsUrl =
        "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&punctuate=true";
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: this.apiKey,
        },
      });

      this.ws.on("open", () => {
        console.log("AssemblyAI Connected - Connection established");
      });

      this.ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle different message types from AssemblyAI
          if (message.type === "Turn") {
            // Handle Turn type messages (formatted with punctuation)
            if (message.transcript) {
              const isPartial = !message.end_of_turn;

              // For partial text, always send (current speech)
              if (isPartial) {
                onMessage({
                  text: message.transcript,
                  partial: true,
                  final: false,
                  confidence: message.end_of_turn_confidence,
                });
              }

              // For final text, only send if it has proper formatting
              else if (message.end_of_turn) {
                const hasProperFormatting =
                  message.transcript.includes(".") ||
                  message.transcript.includes(",") ||
                  message.transcript.includes("!") ||
                  message.transcript.includes("?") ||
                  /[A-Z]/.test(message.transcript);

                if (hasProperFormatting) {
                  onMessage({
                    text: message.transcript,
                    partial: false,
                    final: true,
                    confidence: message.end_of_turn_confidence,
                  });
                }
              }
            }
          } else if (message.message_type === "SessionBegins") {
            onMessage({ type: "session_begins", message: "Session started" });
          } else if (message.message_type === "SessionTerminated") {
            onMessage({
              type: "session_terminated",
              message: "Session terminated",
            });
          }
          // Ignore PartialTranscript and FinalTranscript (raw text) - only use Turn messages (formatted)
        } catch (parseError) {
          // Error parsing AssemblyAI message
        }
      });

      this.ws.on("error", (error) => {
        console.log(`AssemblyAI Connection Error: ${error.message || error}`);
        onError(error);
      });

      this.ws.on("close", (code, reason) => {
        console.log(
          `AssemblyAI Connection Closed - Code: ${code}, Reason: ${reason}`
        );
        onClose(code, reason);
      });
    } catch (error) {
      onError(error);
    }
  }

  sendAudio(base64AudioChunk) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Convert base64 to binary buffer and send as binary data
        const audioBuffer = Buffer.from(base64AudioChunk, "base64");
        this.ws.send(audioBuffer);
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error("AssemblyAI WebSocket not connected");
    }
  }

  terminate() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Simply close the WebSocket - AssemblyAI will handle the termination
        this.ws.close(1000, "Session terminated by user");
      } catch (closeError) {
        // Error closing AssemblyAI WebSocket
      }
    }

    this.ws = null;
  }
}
