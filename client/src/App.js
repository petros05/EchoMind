import React, { useRef, useState, useCallback, useEffect } from "react";
import CodeBlock from "./CodeBlock.js";
import "./App.css";
import { WebSocketManager } from "./websocket.js";
import { useRecorder } from "./useRecorder.js";
import Timer from "./Timer.js";
import "katex/dist/katex.min.css";

export default function App() {
  // Speech recognition state
  const [captions, setCaptions] = useState("");
  const [partialText, setPartialText] = useState("");
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const timerRef = useRef();

  // Chat interface state
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [selectedQuickAction, setSelectedQuickAction] = useState("");

  const messagesEndRef = useRef(null);
  const captionsEndRef = useRef(null);
  const wsManagerRef = useRef(null);

  // Audio data handler for recorder
  const handleAudioData = useCallback((base64AudioData) => {
    if (wsManagerRef.current && wsManagerRef.current.getStatus().isConnected) {
      try {
        wsManagerRef.current.sendAudio(base64AudioData);
      } catch (error) {
        setError("Failed to send audio data to server");
      }
    } else {
      if (!wsManagerRef.current) {
        setError("WebSocket connection lost. Please try reconnecting.");
      }
    }
  }, []);

  // Initialize recorder hook
  const {
    isRecording,
    error: recorderError,
    startRecording,
    stopRecording,
    forceStopRecording,
  } = useRecorder(handleAudioData);

  // Scroll to bottom of captions
  const scrollCaptionsToBottom = useCallback(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Initialize WebSocket manager
  useEffect(() => {
    // Only create a new WebSocket manager if one doesn't exist
    if (!wsManagerRef.current) {
      wsManagerRef.current = new WebSocketManager("ws://localhost:5000");
    }

    // Set up message handlers only if not already set up
    if (
      !wsManagerRef.current.messageHandlers ||
      wsManagerRef.current.messageHandlers.size === 0
    ) {
      wsManagerRef.current.onMessage((data) => {
        if (data.error) {
          // Filter out expected connection close messages that shouldn't be shown as errors
          if (
            data.error.includes("AssemblyAI connection closed: 1005") ||
            data.error.includes("AssemblyAI connection closed: 1000") ||
            data.error.includes("AssemblyAI connection closed: 3005") ||
            data.error.includes("Session terminated by user") ||
            data.error.includes("connection closed") ||
            data.error.includes("disconnected")
          ) {
            // These are normal connection close/disconnect messages, don't show as errors
            return;
          }
          setError(data.error);
          return;
        }

        if (data.type === "connection_established") {
          setWsConnected(true);
          setError("");
          return;
        }

        if (data.type === "assemblyai_connected") {
          setIsConnected(true);
          setError("");
          return;
        }

        if (data.type === "assemblyai_error") {
          setError("AssemblyAI connection failed: " + data.error);
          return;
        }

        if (data.type === "session_terminated") {
          setIsConnected(false);
          setError("");
          return;
        }

        if (data.type === "termination_error") {
          setError("Failed to stop recording: " + data.error);
          return;
        }

        if (data.text) {
          if (data.partial) {
            setPartialText(data.text);
          } else if (data.final) {
            setCaptions((prev) => {
              const newText = prev + data.text + " ";
              return newText.replace(/([.!?])\s+/g, "$1\n");
            });
            setPartialText("");
            setTimeout(scrollCaptionsToBottom, 100);
          }
          // Removed fallback - only accept properly flagged messages
        }
      });

      wsManagerRef.current.onError((error) => {
        setIsConnected(false);
        setWsConnected(false);
        setIsConnecting(false);
        setError(
          "WebSocket connection error: " + (error.message || "Unknown error")
        );
      });

      wsManagerRef.current.onClose((event) => {
        setIsConnected(false);
        setWsConnected(false);
        setIsConnecting(false);
        if (isRecording) {
          setError("Connection lost. Please try again.");
          stopRecording(); // Stop recording when connection is lost
        }
      });
    }

    return () => {
      // Safety: Stop AssemblyAI and close connection when component unmounts
      if (wsManagerRef.current) {
        if (wsManagerRef.current.getStatus().isConnected) {
          wsManagerRef.current.terminate();
        }
        wsManagerRef.current.close();
      }
    };
  }, [isRecording, scrollCaptionsToBottom, stopRecording]); // Include dependencies to avoid stale closures

  // Update error state when recorder error changes
  useEffect(() => {
    if (recorderError) {
      setError(recorderError);
    }
  }, [recorderError]);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Connect to WebSocket
  const connectToWebSocket = useCallback(async () => {
    if (isConnecting || wsConnected) {
      return wsConnected;
    }

    setIsConnecting(true);
    setError("");

    try {
      // First check if backend server is running
      try {
        const response = await fetch("http://localhost:5000/test");
        await response.json();
      } catch (fetchError) {
        setError(
          "Backend server is not running. Please start the server first."
        );
        return false;
      }

      // Add a small delay to ensure server is ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await wsManagerRef.current.connect();
      setWsConnected(true);

      return true;
    } catch (error) {
      setError(
        "Failed to connect to speech recognition service. Please make sure the backend server is running on port 5000."
      );
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, wsConnected]);

  // Start recording
  const handleStartRecording = useCallback(async () => {
    if (isRecording || isStartingRecording) {
      return;
    }
    setIsStartingRecording(true);
    setError("");
    setPartialText(""); // Clear any partial text from previous session

    try {
      // Always ensure WebSocket is connected first
      if (!wsConnected) {
        const connected = await connectToWebSocket();

        if (!connected) {
          setError("WebSocket connection failed. Please try again.");
          return;
        }
      }

      // AssemblyAI will connect automatically when we start sending audio data
      // No need to wait for connection here

      // Start audio recording - don't rely on state variables, just start recording
      const success = await startRecording();
      if (!success) {
        setError("Failed to start recording. Please try again.");
      }
    } catch (error) {
      setError("Failed to start recording: " + error.message);
    } finally {
      setIsStartingRecording(false);
      timerRef.current.start();
    }
  }, [
    isRecording,
    isStartingRecording,
    wsConnected,
    connectToWebSocket,
    startRecording,
  ]);

  // Stop recording
  const handleStopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    setIsStartingRecording(false); // Reset starting state
    setError(""); // Clear any existing errors

    try {
      // 1. FIRST: Stop AssemblyAI immediately to prevent costs
      if (wsManagerRef.current) {
        const status = wsManagerRef.current.getStatus();

        if (status.isConnected) {
          wsManagerRef.current.terminate();

          // Wait for termination confirmation or timeout
          let terminationConfirmed = false;
          let attempts = 0;
          const maxAttempts = 10; // 2 seconds max wait

          while (!terminationConfirmed && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            attempts++;

            // Check if we received termination confirmation
            if (!isConnected) {
              terminationConfirmed = true;
            }
          }

          // Close WebSocket intentionally to prevent reconnection
          wsManagerRef.current.closeIntentionally();
        }
      }

      // 2. SECOND: Stop the audio recording
      await stopRecording();

      // 3. Clear any partial text
      setPartialText("");

      // 4. Reset connection states
      setIsConnected(false);
      setWsConnected(false);

      // 5. stop timer
      timerRef.current.stop();
    } catch (error) {
      setError("Error stopping recording: " + error.message);

      // EMERGENCY: Force stop everything to prevent microphone from staying on
      forceStopRecording();

      // Even if there's an error, try to stop AssemblyAI to prevent costs
      try {
        if (wsManagerRef.current) {
          wsManagerRef.current.forceTerminate();
          wsManagerRef.current.closeIntentionally();
        }
      } catch (emergencyError) {
        // Emergency AssemblyAI stop failed
      }

      // Reset states even in error case
      setIsConnected(false);
      setWsConnected(false);
    }
  }, [isRecording, stopRecording, forceStopRecording, isConnected]);

  // Add message to chat
  const addMessage = useCallback(
    (content, type, isError = false) => {
      const newMessage = {
        id: Date.now(),
        content,
        type, // 'user' or 'ai'
        timestamp: new Date(),
        isError,
      };
      setMessages((prev) => [...prev, newMessage]);
      setTimeout(scrollToBottom, 100);
    },
    [scrollToBottom]
  );

  // Send message to OpenAI
  const sendMessage = useCallback(
    async (message, queryType = "question") => {
      if (!message.trim() && queryType === "question") return;
      if (!captions.trim() && queryType !== "question") {
        addMessage(
          "Please record some speech first before using AI features.",
          "ai",
          true
        );
        return;
      }

      // Add user message
      if (queryType === "question") {
        addMessage(message, "user");
      } else {
        const actionText =
          queryType === "summary" ? "Get Summary" : "Find Deadlines";
        addMessage(actionText, "user");
      }

      // Prepare an empty AI message that we'll fill as tokens stream in
      const aiMessageId = Date.now() + 1;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          content: "",
          type: "ai",
          timestamp: new Date(),
          isError: false,
        },
      ]);

      setIsLoadingAI(true);

      try {
        const params = new URLSearchParams({
          transcript: captions || "",
          query: message || "",
          queryType: queryType || "question",
        });

        // Connect directly to backend to avoid dev-proxy buffering SSE
        const eventSource = new EventSource(
          `http://localhost:5000/api/openai/query/stream?${params.toString()}`
        );

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const token = data.token || "";
            if (!token) return;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, content: (msg.content || "") + token }
                  : msg
              )
            );
          } catch (e) {
            // Ignore malformed events
          }
        };

        eventSource.addEventListener("done", () => {
          setIsLoadingAI(false);
          eventSource.close();
        });

        eventSource.addEventListener("error", (event) => {
          try {
            const data = event.data ? JSON.parse(event.data) : null;
            const message =
              data?.error ||
              data?.details ||
              "Failed to process your request";

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: message,
                      isError: true,
                    }
                  : msg
              )
            );
          } catch (e) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: "Failed to process your request",
                      isError: true,
                    }
                  : msg
              )
            );
          } finally {
            setIsLoadingAI(false);
            eventSource.close();
          }
        });
      } catch (error) {
        if (
          error.message &&
          (error.message.includes("quota exceeded") ||
            error.message.includes("insufficient_quota"))
        ) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content:
                      "OpenAI quota exceeded. Please add billing to your OpenAI account. Visit: https://platform.openai.com/account/billing",
                    isError: true,
                  }
                : msg
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content: error.message || "Failed to process your request",
                    isError: true,
                  }
                : msg
            )
          );
        }
        setIsLoadingAI(false);
      }
    },
    [captions, addMessage]
  );

  // Handle quick actions
  const handleQuickAction = useCallback(
    (action) => {
      setSelectedQuickAction(action);
      sendMessage("", action);
    },
    [sendMessage]
  );

  // Handle send button click
  const handleSend = useCallback(() => {
    if (currentInput.trim()) {
      sendMessage(currentInput, "question");
      setCurrentInput("");
    }
  }, [currentInput, sendMessage]);

  // Handle input key press
  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (currentInput.trim() && !isLoadingAI && !isRecording) {
          handleSend();
        }
      }
    },
    [handleSend, currentInput, isLoadingAI, isRecording]
  );

  // Clear
  const clearAll = () => {
    setCaptions("");
    setPartialText("");
    setError("");
    setMessages([]);
    setCurrentInput("");
    timerRef.current.reset()
  };

  // Format captions for display
  const getDisplayCaptions = () => {
    if (!captions && !partialText) return "";

    return (
      <div>
        {captions && (
          <div className="final-transcript">
            {captions.split("\n").map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        )}
        {partialText && (
          <div className="partial-transcript">
            <em>{partialText}</em>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="App">
      <div className="container">
        {/* Header */}
        <div className="header">
          <div>
            <h1 className="title">
              EchoMind
              <span className="title-gradient"> AI</span>
            </h1>
            
          </div>
          <button
            onClick={clearAll}
            disabled={isRecording}
            className="clear-button"
          >
            Clear All
          </button>
        </div>

        {/* Main Content Container */}
        <div className="main-content">
          {/* Left Side - Navbar */}
          <div className="navbar-section">
            <div className="navbar-header">
              <h3>Navigation</h3>
            </div>
            <div className="navbar-content">
              <div className="navbar-placeholder">
                Navigation menu will go here
              </div>
            </div>
          </div>

          {/* Middle - Chat History */}
          <div className="chat-section">
            <div className="chat-header">
              <h3>Chat History</h3>
            </div>
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="empty-messages">
                  Record some speech, then ask questions or request summaries!
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`message ${message.type}`}>
                    <div
                      className={`message-bubble ${
                        message.isError ? "error" : ""
                      }`}
                    >
                      {message.type === "ai" ? (
                        <CodeBlock content={message.content} />
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoadingAI && (
                <div className="message ai">
                  <div className="message-bubble">
                    <div className="loading-message">
                      Thinking
                      <div className="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="input-area">
              {/* Quick Actions */}
              <div className="quick-actions">
                <button
                  className={`quick-action-btn ${
                    selectedQuickAction === "summary" ? "active" : ""
                  }`}
                  onClick={() => handleQuickAction("summary")}
                  disabled={!captions.trim() || isLoadingAI || isRecording}
                >
                  <i className="fa-solid fa-clipboard-list"></i> Summarize
                </button>
                <button
                  className={`quick-action-btn ${
                    selectedQuickAction === "deadline" ? "active" : ""
                  }`}
                  onClick={() => handleQuickAction("deadline")}
                  disabled={!captions.trim() || isLoadingAI || isRecording}
                >
                  <i className="fa-solid fa-calendar-days"></i> Find Deadlines
                </button>
              </div>

              {/* Input Container */}
              <div className="input-container">
                <div className="input-wrapper">
                  {/* Microphone Button */}
                  <button
                    className={`mic-button ${
                      isRecording
                        ? "recording"
                        : isStartingRecording
                        ? "starting"
                        : isConnecting
                        ? "connecting"
                        : "ready"
                    } ${isStartingRecording ? "disabled" : ""}`}
                    onClick={
                      isRecording ? handleStopRecording : handleStartRecording
                    }
                    disabled={isStartingRecording}
                    title={
                      isRecording
                        ? "Stop Recording"
                        : isStartingRecording
                        ? "Starting Recording..."
                        : isConnecting
                        ? "Connecting..."
                        : "Start Recording"
                    }
                  >
                    {isRecording ? (
                      <div className="stop-icon"></div>
                    ) : isStartingRecording || isConnecting ? (
                      <div className="mic-loading-spinner"></div>
                    ) : (
                      <i className="fas fa-microphone mic-icon"></i>
                    )}
                  </button>

                  {/* Text Input */}
                  <textarea
                    className="chat-input chat-input-auto-resize"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask anything about the class content..."
                    disabled={isLoadingAI || isRecording}
                    rows={1}
                    onInput={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height =
                        Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                  />

                  {/* Send Button - Show when there's text */}
                  {currentInput && currentInput.trim().length > 0 && (
                    <button
                      className={`send-button ${isLoadingAI ? "loading" : ""}`}
                      onClick={handleSend}
                      disabled={
                        !currentInput.trim() || isLoadingAI || isRecording
                      }
                      title="Send Message"
                    >
                      {isLoadingAI ? "⏳" : "➤"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Captions */}
          <div className="captions-section">
            <div className="captions-header">
              <div>
              <h3>Live Captions</h3>
              <div
              className={`connection-status ${
                 isConnecting
                  ? "connecting"
                  : isConnected
                  ? "connected"
                  : "disconnected"
              }`}
            >
              <div
                className={`connection-dot ${
                  isConnecting
                    ? "connecting"
                    : isConnected
                    ? "connected"
                    : "disconnected"
                }`}
              ></div>
              {isConnecting
                ? "Connecting..."
                : isConnected
                ? "Recording..."
                : "Disconnected"}
            </div>
            </div>
              <Timer ref={timerRef} />
            </div>
            <div className="captions-area">
              {error ? (
                <div className="error-message">⚠️ {error}</div>
              ) : (
                <div>
                  {captions || partialText ? (
                    getDisplayCaptions()
                  ) : (
                    <div className="captions-placeholder">
                      {isRecording
                        ? "AssemblyAI is listening..."
                        : isStartingRecording
                        ? "Starting recording..."
                        : isConnecting
                        ? "Connecting to speech service..."
                        : isConnected
                        ? "Click the microphone to start recording"
                        : wsConnected
                        ? "Waiting for AssemblyAI..."
                        : "Click the microphone to connect and start recording"}
                    </div>
                  )}
                  <div ref={captionsEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
