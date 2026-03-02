/**
 * Question detection: uses the last final transcript segment and full transcript.
 * If OpenAI detects a question and callbacks are provided, streams the answer via SSE (no console output).
 */

import { streamDetectedQuestionAnswer } from "./router/openai.js";

const CLASSIFIER_PROMPT = `You are a classifier. Given the following transcript segment from a live class (the most recent final utterance), determine if it contains a question—something that asks for information, clarification, or an answer. Reply with exactly one word: YES or NO.`;

/**
 * @param {import("openai").OpenAI} openai - OpenAI client
 * @param {string} lastFinalText - The most recent final transcript segment
 * @param {string} fullTranscript - Full transcript so far
 * @param {{ onQuestion: (q: string) => void, onToken: (t: string) => void, onDone: () => void } | null} callbacks - If provided, answer is streamed via callbacks (SSE). If null, nothing is sent.
 */
export async function checkAndAnswerIfQuestion(
  openai,
  lastFinalText,
  fullTranscript,
  callbacks
) {
  if (!lastFinalText || !lastFinalText.trim()) return;

  const classifierUser = `${CLASSIFIER_PROMPT}\n\nSegment: ${lastFinalText}`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: "Reply with only YES or NO." },
        { role: "user", content: classifierUser },
      ],
      max_tokens: 10,
      temperature: 0,
    });
  } catch (err) {
    return;
  }

  const reply = (completion.choices[0]?.message?.content || "").trim().toUpperCase();
  if (reply !== "YES") return;

  if (!callbacks) return;

  try {
    callbacks.onQuestion(lastFinalText);
    await streamDetectedQuestionAnswer(
      openai,
      fullTranscript,
      lastFinalText,
      callbacks.onToken
    );
    callbacks.onDone();
  } catch (err) {
    if (callbacks.onDone) callbacks.onDone();
  }
}
