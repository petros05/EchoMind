## EchoMind AI – Real-Time Speech-to-Text with AI Assistance

EchoMind is a real-time speech-to-text and AI assistant web application. It captures spoken audio from your microphone, streams it to AssemblyAI for transcription, and lets you query the transcript using OpenAI for summaries, deadline extraction, and general questions.

The app is built as a React single-page frontend (`client`) and a Node.js/Express + WebSocket backend (`server`).

---

## Table of Contents

- **Overview**
- **Key Features**
- **Architecture**
- **Requirements**
- **Getting Started**
  - Clone from GitHub
  - Backend setup (`server`)
  - Frontend setup (`client`)
- **Usage Guide**
- **Configuration**
- **Development Notes**
- **Troubleshooting**

---

## Overview

EchoMind is designed for lectures, meetings, and study sessions where you:

- Stream live microphone audio to AssemblyAI for accurate transcription.
- View live captions (partial + finalized text) with automatic punctuation and basic line formatting.
- Use an AI chat panel to summarize the transcript, extract deadlines, or ask questions about the spoken content or general topics.

The application is optimized for real-time, low-latency transcription with clear UX: a mic button, live captions panel, and a chat-style AI assistant.

---

## Key Features

- **Real-time transcription**
  - Microphone recording via Web Audio API and `AudioWorklet`.
  - Audio converted to 16 kHz mono PCM and streamed over WebSockets to the backend.
  - Backend connects to AssemblyAI’s streaming API for live transcription.
  - Final transcripts are formatted with line breaks for readability.

- **AI assistant (OpenAI)**
  - **Summarize**: Generate concise summaries of the recorded session.
  - **Find Deadlines**: Extract dates, due dates, and time-bound tasks from the transcript.
  - **Ask Questions**: Ask questions about the transcript content or general questions. The backend decides when to answer from the transcript versus general knowledge.

- **Modern UI**
  - React SPA with a three-column layout:
    - Left: Navigation placeholder.
    - Middle: Chat history with AI and user messages (rendered with Markdown, code highlighting, and KaTeX).
    - Right: Live captions and recording status.
  - Timer showing active recording duration.
  - “Clear All” button to reset transcript and chat state.

- **Robust connection handling**
  - Frontend `WebSocketManager` manages connection state and limited auto-reconnect.
  - Backend shields AssemblyAI from unnecessary reconnects and terminates sessions when recording stops.
  - Frontend differentiates between backend connection and AssemblyAI session state.

---

## Architecture

### High-Level Flow

1. **User clicks the microphone button** in the React app.
2. `useRecorder` requests microphone access, starts an `AudioWorklet`, and streams 16 kHz mono PCM frames to the frontend WebSocket manager.
3. The frontend sends base64-encoded audio frames via WebSocket to the Node.js server.
4. The server (`index.js`) forwards audio frames to AssemblyAI’s real-time transcription API using `AssemblyAIStreaming`.
5. AssemblyAI sends back transcript updates (partial and final), which the server forwards over WebSocket to the frontend.
6. The React app updates:
   - `partialText` for live captions.
   - `captions` when finalized text is received.
7. The user can then query OpenAI via HTTP POST `/api/openai/query`, sending the transcript and a query type.

### Frontend (`client`)

- `App.js`: Main React component, orchestrates recording, WebSocket state, captions, and chat UI.
- `useRecorder.js`: Custom hook handling microphone access, `AudioContext`, `AudioWorklet`, and conversion to base64 PCM frames.
- `websocket.js`: `WebSocketManager` class managing connection lifecycle, reconnection attempts, and message handlers.
- `CodeBlock.js`: Renders AI responses with Markdown, syntax highlighting, and KaTeX for math.
- `Timer.js`: Simple timer component controlled via ref to show recording duration.
- `App.css`: All UI styling (layout, typography, buttons, chat bubbles, captions, etc.).

### Backend (`server`)

- `index.js`:
  - Express server exposing:
    - `POST /api/openai/query` – forwards transcript and query to OpenAI Chat Completions.
    - `GET /test` – simple health-check endpoint.
  - Creates an HTTP server and attaches a `WebSocketServer` (from `ws`).
  - For each WebSocket client:
    - Lazily connects to AssemblyAI using `AssemblyAIStreaming` when audio data first arrives.
    - Forwards AssemblyAI messages back to the client.
    - Handles session termination requests from the client to stop the AssemblyAI stream promptly.
- `assemblyai-streaming.js`: Helper for connecting to AssemblyAI’s streaming API (WebSocket wrapper, not shown here but required by `index.js`).

---

## Requirements

- **Runtime**
  - Node.js 16 or higher (recommended: latest LTS).
  - npm (comes with Node.js).

- **Browser**
  - Modern browser with WebSocket and Web Audio API support.
  - Recommended: Latest **Chrome** or **Microsoft Edge**.

- **Hardware & Permissions**
  - Working microphone.
  - Permission to use microphone in the browser.
  - Stable internet connection.

- **API Keys**
  - AssemblyAI API key (for streaming speech-to-text).
  - OpenAI API key (for chat, summaries, and deadline extraction).

---

## Getting Started

### 1. Clone from GitHub

If this project is hosted on GitHub, you can clone it with:

```bash
git clone https://github.com/petros05/EchoMind.git
cd EchoMind
```

If you downloaded the code as a ZIP, extract it and `cd` into the root folder instead.

### 2. Backend Setup (`server`)

From the project root:

```bash
cd server
npm install
```

Create a `.env` file in the `server` directory:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
PORT=5000
```

Then start the backend (with auto-reload via `nodemon` if installed via `npm install`):

```bash
npm start
```
OR 
```bash
node index.js
```

By default the server will run on `http://localhost:5000`. The React app proxies `/api` calls to this port via the `proxy` value in `client/package.json`.

### 3. Frontend Setup (`client`)

In a separate terminal, from the project root:

```bash
cd client
npm install
npm start
```

This will start the React development server at `http://localhost:3000`.

The client is configured with:

- `proxy: "http://localhost:5000"` so that API calls like `/api/openai/query` go to the Node server.
- WebSocket connections to `ws://localhost:5000` (see `WebSocketManager`).

---

## Usage Guide

1. Ensure the **backend server** is running on port `5000`.
2. Start the **React app** and open `http://localhost:3000` in your browser.
3. Grant microphone access when prompted.

### Recording and Transcription

- Click the **microphone button** to start recording.
  - The connection status indicator in the “Live Captions” panel will show connection/recording status.
  - A timer starts to show how long you have been recording.
- Speak normally; live captions will appear in the right-hand panel:
  - **Partial transcript** is shown in italic while speech is ongoing.
  - **Final transcript** is written as regular text, with basic punctuation and line breaks.
- Click the microphone button again to **stop recording**.
  - The backend stops the AssemblyAI session and terminates streaming to avoid unnecessary usage.

### AI Assistant

After you have some transcript content, you can use the middle “Chat History” panel:

- **Summarize**
  - Click the **Summarize** quick-action button.
  - The app sends the full transcript to OpenAI with a summarization prompt.
  - The AI response appears as an “AI” message, rendered with Markdown and syntax highlighting.

- **Find Deadlines**
  - Click the **Find Deadlines** quick-action button.
  - The app asks OpenAI to extract deadlines, due dates, and important dates from the transcript.

- **Ask a Question**
  - Type a question in the input box and press **Enter** (or click the send button).
  - If your question looks related to the transcript and there is transcript text, the backend asks OpenAI to answer based on the transcript.
  - Otherwise, the backend will treat your question as a general query.

- **Clear All**
  - Use the **Clear All** button in the header to reset:
    - Transcript
    - Partial text
    - Error messages
    - Chat history
    - Timer

---

## Configuration

### Environment Variables (Backend)

In `server/.env`:

- `ASSEMBLYAI_API_KEY` – your AssemblyAI API key (required).
- `OPENAI_API_KEY` – your OpenAI API key (required).
- `PORT` – port for the Express + WebSocket server (default: `5000`).

### Frontend Configuration

In `client/package.json`:

- `"proxy": "http://localhost:5000"` – used by the React dev server to forward `/api/*` requests.

In `client/src/websocket.js`:

- The `WebSocketManager` defaults to `ws://localhost:5000`. If you deploy the server elsewhere, adjust this URL accordingly in `App.js` where the manager is instantiated.

### Audio Settings

Controlled by `useRecorder.js`:

- Sample rate: **16 kHz**.
- Channel count: **1 (mono)**.
- Browser audio constraints: echo cancellation, noise suppression, and auto gain control enabled.

---

## Development Notes

### Project Structure

```text
├── client/                  # React frontend
│   ├── public/
│   │   ├── index.html
│   │   └── audio-processor.js   # AudioWorklet script
│   └── src/
│       ├── App.js               # Main application component
│       ├── App.css              # All styles
│       ├── CodeBlock.js         # Markdown, code, and math rendering
│       ├── Timer.js             # Recording timer
│       ├── useRecorder.js       # Audio capture and worklet hook
│       └── websocket.js         # WebSocket manager
├── server/                  # Node.js backend
│   ├── index.js             # Express + WebSocket server, OpenAI routes
│   └── assemblyai-streaming.js  # AssemblyAI streaming helper
└── README.md                # Project documentation
```

### Scripts

From `server`:

- `npm start` – start the backend with `nodemon index.js`.

From `client`:

- `npm start` – start the React development server.
- `npm run build` – build the production bundle.

---

## Troubleshooting

### Backend Not Detected

- The frontend checks `http://localhost:5000/test` before attempting a WebSocket connection.
- If you see an error like “Backend server is not running” in the UI:
  - Ensure `npm start` is running in the `server` folder.
  - Verify that port `5000` is not used by another process.

### WebSocket / AssemblyAI Issues

- If you lose connection while recording:
  - The app will stop recording and show an error.
  - Try stopping recording, then starting again.
  - Ensure your internet connection is stable.

### Microphone Access

- If you see an error like “Microphone access denied”:
  - Check browser permissions (site settings) and allow microphone access.
  - Ensure no other application is exclusively using your microphone.

### OpenAI Errors

- If you see messages about invalid API key or insufficient quota:
  - Confirm `OPENAI_API_KEY` is correct in `server/.env`.
  - Check your OpenAI billing and quota at `https://platform.openai.com/account/billing`.

### AssemblyAI Errors

- If the backend logs or UI mention AssemblyAI errors (invalid key, deprecated model, etc.):
  - Verify `ASSEMBLYAI_API_KEY` in `server/.env`.
  - Check your AssemblyAI dashboard for key status and any API changes.

---

## Notes for Production Deployment

- Update WebSocket URL from `ws://localhost:5000` to your deployed server URL.
- Serve the frontend build (from `client/build`) via a production web server (NGINX, a Node static file server, etc.).
- Ensure environment variables (`ASSEMBLYAI_API_KEY`, `OPENAI_API_KEY`, `PORT`) are set in your production environment and are **never** committed to source control.

---

## License

If you intend to share or open source this project, add a `LICENSE` file in the root and reference it here (for example, MIT, Apache-2.0, etc.).