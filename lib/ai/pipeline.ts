import { generateText, generateObject } from "ai";

// Vercel AI Gateway — no API key needed, billed through Vercel account
// Uses google/gemini-2.0-flash by default (free tier via gateway)
const MODEL = "google/gemini-2.0-flash";

export async function generateGuide(events: unknown[]) {
  const { text } = await generateText({
    model: MODEL,
    system: `You are an expert technical writer. Convert browser recording events into a clear, step-by-step guide.
Return a JSON object with: title, summary, tags (array), and steps (array of {order, title, instruction, tip}).`,
    prompt: `Convert these browser events into a guide:\n${JSON.stringify(events, null, 2)}`,
  });
  return JSON.parse(text);
}

export async function rewriteTone(content: string, tone: string) {
  const { text } = await generateText({
    model: MODEL,
    prompt: `Rewrite the following guide content in a ${tone} tone. Keep all steps intact.\n\n${content}`,
  });
  return text;
}

export async function detectSensitive(steps: unknown[]) {
  const { text } = await generateText({
    model: MODEL,
    system: "Identify any steps that may contain sensitive information (passwords, PII, credentials). Return JSON array of step indices.",
    prompt: JSON.stringify(steps),
  });
  return JSON.parse(text);
}
