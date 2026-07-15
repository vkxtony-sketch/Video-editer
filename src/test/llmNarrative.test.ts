import { describe, it, expect } from "vitest";
import {
  buildNarrativePrompt,
  validateNarrativeResponse,
  buildGroqRequestBody,
  extractGroqContent,
  GROQ_CHAT_URL,
  GROQ_DEFAULT_MODEL,
} from "../lib/llmNarrative";

describe("llmNarrative", () => {
  describe("buildNarrativePrompt", () => {
    it("returns system + user prompt + expected shape summary", () => {
      const prompt = buildNarrativePrompt({
        title: "Monday stream · 12h VOD",
        persona: "long-form broadcast",
        durationSec: 43200,
        scenesDetected: 84,
        silencesCount: 31,
        peakRms: 0.78,
        meanRms: 0.34,
      });
      expect(prompt.system).toMatch(/strategist/i);
      expect(prompt.system).toMatch(/titles.*headlines/i);
      expect(prompt.user).toContain("Monday stream · 12h VOD");
      expect(prompt.user).toContain("12-hour");
      // JSON.stringify produces no whitespace between keys; match a tolerant regex.
      expect(prompt.user).toMatch(/"scenesDetected":\s?84/);
      expect(prompt.user).toMatch(/"silencesCount":\s?31/);
      expect(prompt.user).toMatch(/"peakRms":\s?0\.78/);
      expect(prompt.expectedShape).toEqual({ titles: 5, headlines: 5 });
    });

    it("formats short durations as 'N-minute' or 'N-second'", () => {
      const p = buildNarrativePrompt({
        title: "Demo loop",
        durationSec: 120,
        scenesDetected: 3,
        silencesCount: 1,
        peakRms: 0.5,
        meanRms: 0.2,
      });
      // 120 / 60 = 2 minutes exactly — match the substring.
      expect(p.user).toContain("2-minute");
    });
  });

  describe("validateNarrativeResponse", () => {
    const validJson = JSON.stringify({
      titles: [
        { label: "YouTube Title", body: "The data tells a story", score: 0.9, style: "data-driven" },
        { label: "TikTok Caption", body: "84 scenes in 12 hours", score: 0.8, style: "clickbait" },
        { label: "X Hook", body: "Numbers don't lie.", score: 0.7, style: "matter-of-fact" },
        { label: "LinkedIn Title", body: "12 hours compressed", score: 0.65, style: "professional" },
        { label: "Newsletter Subject", body: "What the scene changes say", score: 0.6, style: "curiosity" },
      ],
      headlines: [
        { headline: "It actually works.", subtext: "and here's the data" },
        { headline: "Don't scroll past this.", subtext: "what nobody tells you" },
        { headline: "Twelve hours in five minutes.", subtext: "the AI did this" },
        { headline: "Quietly life-changing.", subtext: "watch till the end" },
        { headline: "I was wrong about this.", subtext: "until I tried it" },
      ],
    });

    it("accepts a well-formed JSON string", () => {
      const r = validateNarrativeResponse(validJson);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.titles).toHaveLength(5);
        expect(r.payload.headlines).toHaveLength(5);
        expect(r.payload.titles[0]?.body).toMatch(/data/i);
      }
    });

    it("accepts an already-parsed object", () => {
      const obj = JSON.parse(validJson);
      const r = validateNarrativeResponse(obj);
      expect(r.ok).toBe(true);
    });

    it("rejects malformed JSON", () => {
      const r = validateNarrativeResponse("{not json");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/invalid json/i);
    });

    it("rejects when titles or headlines missing", () => {
      const r = validateNarrativeResponse(JSON.stringify({ titles: [] }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/headlines/i);
    });

    it("rejects when a title is missing required fields", () => {
      const broken = JSON.stringify({
        titles: [{ label: "X" }], // missing body/score/style
        headlines: [{ headline: "h", subtext: "s" }],
      });
      const r = validateNarrativeResponse(broken);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/titles/i);
    });

    it("rejects when a title score is out of range", () => {
      const broken = JSON.stringify({
        titles: [
          { label: "X", body: "y", score: 1.5, style: "story" },
        ],
        headlines: [{ headline: "h", subtext: "s" }],
      });
      const r = validateNarrativeResponse(broken);
      expect(r.ok).toBe(false);
    });

    it("rejects when a headline is missing subtext", () => {
      const broken = JSON.stringify({
        titles: [{ label: "X", body: "y", score: 0.5, style: "story" }],
        headlines: [{ headline: "h" }],
      });
      const r = validateNarrativeResponse(broken);
      expect(r.ok).toBe(false);
    });
  });

  describe("buildGroqRequestBody", () => {
    it("targets the Groq OpenAI-compatible chat endpoint", () => {
      const req = buildGroqRequestBody({
        apiKey: "test-key-1234567890",
        system: "you are X",
        user: "hello",
      });
      expect(req.url).toBe(GROQ_CHAT_URL);
      expect(req.init.method).toBe("POST");
      const headers = req.init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-key-1234567890");
      expect(headers["Content-Type"]).toBe("application/json");
      const body = JSON.parse(req.init.body as string);
      expect(body.model).toBe(GROQ_DEFAULT_MODEL);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.stream).toBe(false);
    });

    it("respects a custom model override", () => {
      const req = buildGroqRequestBody({
        apiKey: "k",
        model: "llama-3.3-70b-versatile",
        system: "s",
        user: "u",
      });
      const body = JSON.parse(req.init.body as string);
      expect(body.model).toBe("llama-3.3-70b-versatile");
    });
  });

  describe("extractGroqContent", () => {
    it("extracts the assistant content from a Groq response", () => {
      const resp = {
        id: "chatcmpl-1",
        choices: [
          { index: 0, message: { role: "assistant", content: '{"titles":[],"headlines":[]}' }, finish_reason: "stop" },
        ],
      };
      expect(extractGroqContent(resp)).toBe('{"titles":[],"headlines":[]}');
    });

    it("returns null for missing / malformed choices", () => {
      expect(extractGroqContent(null)).toBeNull();
      expect(extractGroqContent({})).toBeNull();
      expect(extractGroqContent({ choices: [] })).toBeNull();
      expect(extractGroqContent({ choices: [{ message: {} }] })).toBeNull();
    });
  });
});
