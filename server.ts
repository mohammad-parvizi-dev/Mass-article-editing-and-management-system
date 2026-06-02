import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body parser with a large limit for base64 uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded images statically
app.use("/uploads", express.static(UPLOADS_DIR));

// Initialize Gemini SDK lazily to avoid crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Unified callAIService that switches to OpenRouter if OPENROUTER_API_KEY is configured
async function callAIService({
  prompt,
  systemInstruction,
  model
}: {
  prompt: string;
  systemInstruction?: string;
  model?: string;
}): Promise<string> {
  const rawKey = process.env.OPENROUTER_API_KEY;
  const openRouterApiKey = rawKey ? rawKey.replace(/['"]/g, "").trim() : "";
  const userOpenRouterModel = model || process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

  if (openRouterApiKey) {
    console.log(`Routing AI request to OpenRouter using model: ${userOpenRouterModel}`);
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "AI Admin Article Publisher",
        },
        body: JSON.stringify({
          model: userOpenRouterModel,
          messages: messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr: any = null;
        try {
          parsedErr = JSON.parse(errText);
        } catch (e) {}

        const errMsg = parsedErr?.error?.message || errText;
        const isRateLimit = response.status === 429 || errMsg.toLowerCase().includes("rate-limited") || errMsg.toLowerCase().includes("rate limit") || response.status === 503;

        console.error(`OpenRouter failed (status ${response.status}):`, errMsg);

        // Graceful automatic fallback to Google Gemini model if we have a GEMINI_API_KEY config
        if (process.env.GEMINI_API_KEY) {
          console.warn("Attempting automatic fallback to direct Gemini API because OpenRouter returned an error:", response.status);
          try {
            const ai = getGeminiClient();
            const config = systemInstruction ? { systemInstruction } : undefined;
            const fallbackResponse = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: prompt,
              config,
            });
            return fallbackResponse.text || "";
          } catch (geminiErr: any) {
            console.error("Gemini fallback also failed:", geminiErr);
          }
        }

        if (isRateLimit) {
          throw new Error(`خطای محدودیت ترافیک هوش مصنوعی (Rate Limit - 429): مدل انتخابی در حال حاضر شلوغ یا محدود شده است. لطفاً مدل دیگری (مثلاً gpt, gemini یا deepseek) انتخاب کنید یا دقایقی دیگر مجدداً تلاش نمایید. جزئیات: ${errMsg}`);
        }
        
        throw new Error(`خطای سرویس هوش مصنوعی (کد ${response.status}): ${errMsg}`);
      }

      const data: any = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content || "";
      } else {
        throw new Error("قالب پاسخ دریافتی از OpenRouter نامعتبر است.");
      }
    } catch (err: any) {
      console.error("OpenRouter request failed, checking fallback:", err);
      // Fallback for network timeouts or generic failures
      if (process.env.GEMINI_API_KEY) {
        console.warn("Attempting fallback to Gemini API after unexpected OpenRouter exception.");
        try {
          const ai = getGeminiClient();
          const config = systemInstruction ? { systemInstruction } : undefined;
          const fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config,
          });
          return fallbackResponse.text || "";
        } catch (geminiErr: any) {
          console.error("Gemini fallback failed on generic catch:", geminiErr);
        }
      }
      throw err;
    }
  } else {
    console.log("Routing AI request to Gemini API (No OpenRouter Key is configured)");
    const ai = getGeminiClient();
    const config = systemInstruction ? { systemInstruction } : undefined;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config,
    });
    return response.text || "";
  }
}

// API Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// AI Configuration info for UI
app.get("/api/ai/config", (req, res) => {
  res.json({
    openRouterEnabled: true,
    defaultModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
  });
});

// Fetch active OpenRouter models dynamic list
app.get("/api/ai/models", async (req, res) => {
  try {
    const rawKey = process.env.OPENROUTER_API_KEY;
    const cleanKey = rawKey ? rawKey.replace(/['"]/g, "").trim() : "";
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "aistudio-build/2.4",
    };

    if (cleanKey) {
      headers["Authorization"] = `Bearer ${cleanKey}`;
      const safePrefix = cleanKey.substring(0, 10);
      const safeSuffix = cleanKey.substring(cleanKey.length - 4);
      console.log(`[API /api/ai/models] Loaded OpenRouter API Key. Length: ${cleanKey.length} chars. Pattern: ${safePrefix}...${safeSuffix}`);
    } else {
      console.log("[API /api/ai/models] Attention: No OPENROUTER_API_KEY found or it evaluates to empty string.");
    }

    console.log("[API /api/ai/models] Dispatching fetch request to https://openrouter.ai/api/v1/models...");
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "N/A");
      throw new Error(`OpenRouter answered with status ${response.status}: ${response.statusText}. Response body: ${errBody}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.data) && data.data.length > 0) {
      console.log(`[API /api/ai/models] Success! Dynamically fetched and verified ${data.data.length} active models from OpenRouter.`);
      res.json({
        data: data.data,
        isFallback: false
      });
    } else {
      throw new Error("Invalid or empty data structure returned from OpenRouter API.");
    }
  } catch (error: any) {
    console.error("[API /api/ai/models] Error loading models dynamically:", error.message || error);
    
    // Comprehensive premium list of models to choose from if network is blocked
    res.json({
      data: [
        { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash" },
        { id: "google/gemini-2.5-pro", name: "Google: Gemini 2.5 Pro" },
        { id: "deepseek/deepseek-chat", name: "DeepSeek: V3 (Chat)" },
        { id: "deepseek/deepseek-r1", name: "DeepSeek: R1 (Reasoning)" },
        { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o Mini" },
        { id: "openai/gpt-4o", name: "OpenAI: GPT-4o" },
        { id: "anthropic/claude-3.5-sonnet", name: "Anthropic: Claude 3.5 Sonnet" },
        { id: "anthropic/claude-3.5-haiku", name: "Anthropic: Claude 3.5 Haiku" },
        { id: "meta-llama/llama-3-8b-instruct:free", name: "Meta: Llama 3 8B Instruct (Free)" },
        { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B Instruct" },
        { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen: Qwen 2.5 72B Instruct" },
        { id: "mistralai/mistral-large", name: "Mistral: Mistral Large" }
      ],
      isFallback: true,
      errorDetails: error.message || String(error)
    });
  }
});

// File upload endpoint (accepts base64 encoded file)
app.post("/api/upload", (req, res) => {
  try {
    const { fileName, fileType, base64Data } = req.body;
    if (!fileName || !base64Data) {
      return res.status(400).json({ error: "Missing required fields (fileName, base64Data)" });
    }

    // Clean up base64 prefix if present
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    // Generate unique name
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const finalFileName = `${timestamp}_${sanitizedName}`;
    const destinationPath = path.join(UPLOADS_DIR, finalFileName);

    fs.writeFileSync(destinationPath, buffer);

    res.json({
      success: true,
      url: `/uploads/${finalFileName}`,
      fileName: finalFileName,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

// Gemini/OpenRouter Translation endpoint
app.post("/api/gemini/translate", async (req, res) => {
  try {
    const { text, targetLang, model } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: "Missing required fields (text, targetLang)" });
    }

    const prompt = `Translate the following text to ${targetLang}. Only return the translation, with no explanation or introductory words. If the source text contains HTML, Markdown, or special structures, preserve them exactly.
Text: ${text}`;

    const translation = await callAIService({
      prompt,
      model,
    });

    res.json({ translation });
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to translate via AI service" });
  }
});

// Gemini/OpenRouter Expand/Rewrite Content
app.post("/api/gemini/expand", async (req, res) => {
  try {
    const { prompt, currentContent, field, model, systemInstruction: customSystemInstruction } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const systemInstruction = customSystemInstruction || `You are an expert content editor and copywriter. Rewriting or expanding standard blog post fields like titles, descriptions, and body content. Keep HTML tags or markdown formatted headers intact if the original has them. Output ONLY the resulting revised field text without any surrounding commentaries, markdown formatting wrappers (like \`\`\`html), or explanations.`;

    const contents = `Prompt: ${prompt}\n\nCurrent value of ${field || "content"}:\n${currentContent || ""}`;

    const content = await callAIService({
      prompt: contents,
      systemInstruction,
      model,
    });

    res.json({ content });
  } catch (error: any) {
    console.error("Expand error:", error);
    res.status(500).json({ error: error.message || "Failed to expand content via AI service" });
  }
});


// Setup Vite development server or production static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve SPA routes
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
