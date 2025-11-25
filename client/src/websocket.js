// WebSocket utility for connecting to the backend server
export class WebSocketManager {
  constructor(url = "ws://localhost:5000") {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.intentionalClose = false; // Flag to prevent reconnection after intentional stops
    this.messageHandlers = new Set();
    this.errorHandlers = new Set();
    this.closeHandlers = new Set();
  }

  // Add message handler
  onMessage(handler) {
    this.messageHandlers.add(handler);
  }

  // Remove message handler
  offMessage(handler) {
    this.messageHandlers.delete(handler);
  }

  // Add error handler
  onError(handler) {
    this.errorHandlers.add(handler);
  }

  // Remove error handler
  offError(handler) {
    this.errorHandlers.delete(handler);
  }

  // Add close handler
  onClose(handler) {
    this.closeHandlers.add(handler);
  }

  // Remove close handler
  offClose(handler) {
    this.closeHandlers.delete(handler);
  }

  // Connect to WebSocket server
  async connect() {
    if (this.isConnecting || this.isConnected) {
      return Promise.resolve();
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const connectionTimeout = setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          this.isConnecting = false;
          reject(new Error("Connection timeout"));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Call all message handlers
          this.messageHandlers.forEach((handler) => {
            try {
              handler(data);
            } catch (error) {
              // Error in message handler
            }
          });
        } catch (error) {
          // Error parsing WebSocket message
        }
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.isConnected = false;
        this.isConnecting = false;

        // Call all close handlers
        this.closeHandlers.forEach((handler) => {
          try {
            handler(event);
          } catch (error) {
            // Error in close handler
          }
        });

        // Only attempt to reconnect if not a normal closure AND not an intentional close
        if (
          event.code !== 1000 &&
          this.reconnectAttempts < this.maxReconnectAttempts &&
          !this.intentionalClose
        ) {
          this.attemptReconnect();
        }

        // Reset the intentional close flag after handling
        this.intentionalClose = false;
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.isConnected = false;
        this.isConnecting = false;

        // Call all error handlers
        this.errorHandlers.forEach((handler) => {
          try {
            handler(error);
          } catch (error) {
            // Error in error handler
          }
        });

        reject(error);
      };
    });
  }

  // Attempt to reconnect
  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Reconnection failed
      }
    }, delay);
  }

  // Send message to server
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const message = typeof data === "string" ? data : JSON.stringify(data);
        this.ws.send(message);
        return true;
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error("WebSocket not connected");
    }
  }

  // Send audio data to server
  sendAudio(audioData) {
    this.send({ audio_data: audioData });
  }

  // Send terminate session
  terminate() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.send({ terminate_session: true });
      } catch (error) {
        throw error;
      }
    }
  }

  // Force terminate and close
  forceTerminate() {
    // Send terminate if possible
    console.log("ForceTerminate function called");
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.send({ terminate_session: true });
      } catch (e) {
        // Could not send terminate message during force terminate
      }
    }

    // Force close the connection
    this.close();
  }

  // Close connection
  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Error closing WebSocket
      }
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }

  // Close connection intentionally (prevents reconnection)
  closeIntentionally() {
    this.intentionalClose = true;
    this.close();
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      readyState: this.ws ? this.ws.readyState : null,
    };
  }
}
