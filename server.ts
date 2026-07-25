import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// Helper to robustly extract and parse JSON from AI model outputs
function extractJsonFromText(rawText: string): any {
  if (!rawText || !rawText.trim()) {
    throw new Error("پاسخ دریافتی از هوش مصنوعی خالی بود.");
  }

  const trimmed = rawText.trim();

  // 1. Direct JSON parse attempt
  try {
    return JSON.parse(trimmed);
  } catch (e) {}

  // 2. Remove markdown code fences anywhere in string
  let cleaned = trimmed
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // 3. Extract JSON object substring between first '{' and last '}'
  const startIdx = trimmed.indexOf("{");
  const endIdx = trimmed.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSub = trimmed.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonSub);
    } catch (e) {
      // Clean trailing commas before closing braces/brackets
      const repaired = jsonSub
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u201C\u201D]/g, '"');
      try {
        return JSON.parse(repaired);
      } catch (e2) {}
    }
  }

  // 4. Extract JSON array substring between first '[' and last ']'
  const arrStart = trimmed.indexOf("[");
  const arrEnd = trimmed.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    const arrSub = trimmed.substring(arrStart, arrEnd + 1);
    try {
      return JSON.parse(arrSub);
    } catch (e) {}
  }

  throw new Error("پاسخ هوش مصنوعی شامل ساختار JSON معتبر نبود.");
}

// Unified callAIService that switches to OpenRouter if OPENROUTER_API_KEY is configured
async function callAIService({
  prompt,
  systemInstruction,
  model,
  responseFormatJson = false,
}: {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  responseFormatJson?: boolean;
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

    const requestBody: any = {
      model: userOpenRouterModel,
      messages: messages,
    };

    // Only add response_format for OpenAI or specific models that support json_object
    if (responseFormatJson && (userOpenRouterModel.includes("openai") || userOpenRouterModel.includes("gpt"))) {
      requestBody.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "AI Admin Article Publisher",
        },
        body: JSON.stringify(requestBody),
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
            const config: any = {};
            if (systemInstruction) config.systemInstruction = systemInstruction;
            if (responseFormatJson) config.responseMimeType = "application/json";

            const fallbackResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config,
            });
            if (fallbackResponse.text && fallbackResponse.text.trim()) {
              return fallbackResponse.text;
            }
          } catch (geminiErr: any) {
            console.error("Gemini fallback also failed:", geminiErr);
          }
        }

        if (isRateLimit) {
          throw new Error(`خطای محدودیت ترافیک هوش مصنوعی (Rate Limit - 429): مدل انتخابی در حال حاضر شلوغ یا محدود شده است. لطفاً مدل دیگری انتخاب کنید. جزئیات: ${errMsg}`);
        }
        
        throw new Error(`خطای سرویس هوش مصنوعی (کد ${response.status}): ${errMsg}`);
      }

      const resText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch (jsonErr) {
        console.warn("Failed to parse OpenRouter response as JSON:", resText);
      }

      const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";

      if (content && content.trim()) {
        return content;
      }

      console.warn("OpenRouter returned empty content or non-JSON body. Trying direct Gemini fallback...");
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = getGeminiClient();
          const config: any = {};
          if (systemInstruction) config.systemInstruction = systemInstruction;
          if (responseFormatJson) config.responseMimeType = "application/json";

          const fallbackResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config,
          });
          if (fallbackResponse.text && fallbackResponse.text.trim()) {
            return fallbackResponse.text;
          }
        } catch (geminiErr: any) {
          console.error("Gemini fallback after empty OpenRouter content failed:", geminiErr);
        }
      }

      throw new Error("سرویس هوش مصنوعی پاسخی برنگرداند (پاسخ خالی).");
    } catch (err: any) {
      console.error("OpenRouter request failed, checking fallback:", err);
      // Fallback for network timeouts or generic failures
      if (process.env.GEMINI_API_KEY) {
        console.warn("Attempting fallback to Gemini API after unexpected OpenRouter exception.");
        try {
          const ai = getGeminiClient();
          const config: any = {};
          if (systemInstruction) config.systemInstruction = systemInstruction;
          if (responseFormatJson) config.responseMimeType = "application/json";

          const fallbackResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config,
          });
          if (fallbackResponse.text && fallbackResponse.text.trim()) {
            return fallbackResponse.text;
          }
        } catch (geminiErr: any) {
          console.error("Gemini fallback failed on generic catch:", geminiErr);
        }
      }
      throw err;
    }
  } else {
    console.log("Routing AI request to Gemini API (No OpenRouter Key is configured)");
    const ai = getGeminiClient();
    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseFormatJson) config.responseMimeType = "application/json";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

// AI Taxonomy Analysis and Multi-level Category Recommendation endpoint
app.post("/api/ai/categorize-taxonomy", async (req, res) => {
  try {
    const { articles, existingTaxonomy, batchIndex, totalBatches, model } = req.body;
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ error: "لیست مقالات برای تحلیل الزامی است." });
    }

    const simplifiedArticles = articles.map((a: any) => ({
      id: String(a.id),
      title: a.title || "",
      description: a.description ? String(a.description).substring(0, 250) : "",
      keywords: a.keywords || "",
      tags: a.tags || "",
      category_id: a.category_id || "",
    }));

    const systemInstruction = `You are an expert AI content taxonomist, SEO architect, and enterprise CMS metadata strategist.
Your task is to analyze the provided batch of articles and produce/update a clean, professional multi-level category tree (taxonomy) with trilingual titles (Persian, English, Arabic) and URL-friendly English slugs.

CRITICAL MANDATORY RULES FOR TAXONOMY & CLASSIFICATION:
1. DYNAMIC TAXONOMY OPTIMIZATION, MERGING & EDITING AUTHORITY:
   - When an existing taxonomy tree ("existingCategoriesTree") is provided, you have FULL AUTHORITY to refine, edit, rename, or merge existing categories and subcategories if the new articles reveal a cleaner macro-structure.
   - You MAY move previously categorized articles into new or different subcategories if the new structure offers a better, more specific fit.
   - You MUST CONSOLIDATE duplicate or overlapping categories (e.g., merge redundant topics into a single parent/subcategory node).
   - ALL previously categorized article IDs MUST remain present in the updated tree. DO NOT lose or drop any article IDs from previous batches.

2. UNIQUE PRIMARY CLASSIFICATION (STRICT 1:1 ARTICLE ASSIGNMENT):
   - EVERY ARTICLE ID across all processed batches MUST BE ASSIGNED TO EXACTLY ONE SINGLE CATEGORY OR SUBCATEGORY NODE IN "existingCategoriesTree".
   - DO NOT REPEAT ANY ARTICLE ID ACROSS MULTIPLE CATEGORIES OR SUBCATEGORIES.
   - IF AN ARTICLE BELONGS TO A SUBCATEGORY, PLACE ITS ID ONLY IN THAT SUBCATEGORY'S "articleIds" ARRAY, NOT IN THE PARENT CATEGORY'S ARRAY.

3. REQUIRED JSON FIELD FORMATS:
   - "slug": lower-case URL-friendly English slug (e.g. "digital-marketing", "seo-strategy", "web-development")
   - "nameFa": Professional title in Persian (Farsi)
   - "nameEn": Title in English
   - "nameAr": Title in Arabic
   - "name": Duplicate of "nameFa"
   - "enName": Duplicate of "nameEn"
   - "description": Clear 1-sentence description in Persian of what content this category holds.

4. REQUIRED OUTPUT OBJECT STRUCTURE:
   - "title": "درخت تحلیل و دسته‌بندی جامع و تخصصی مقالات"
   - "summary": A brief strategic overview (2-3 sentences in Persian) summarizing the core topic clusters discovered across the corpus and taxonomy structure.
   - "existingCategoriesTree": Array of top-level category objects (with subcategories and articleIds).
   - "proposedNewCategoriesTree": Array of newly suggested categories (with empty "articleIds": []) for future content expansion, including a "suggestedReason" in Persian for each.

Output MUST be purely valid JSON without markdown code fences or conversational boilerplate.`;

    const allArticleIdsList = simplifiedArticles.map((a: any) => String(a.id));
    
    let prompt = "";
    if (existingTaxonomy && Array.isArray(existingTaxonomy.existingCategoriesTree) && existingTaxonomy.existingCategoriesTree.length > 0) {
      prompt = `درخت دسته‌بندی فعلی حاصل از تحلیل بسته‌های قبلی به شرح زیر است:
${JSON.stringify(existingTaxonomy.existingCategoriesTree, null, 2)}

اکنون بسته شماره ${batchIndex || 1} از ${totalBatches || 1} شامل ${simplifiedArticles.length} مقاله جدید زیر ارائه می‌شود.

دستورالعمل مهم بازبینی و جانمایی:
۱. مقالات جدید این بسته را در دسته‌های موجود جانمایی کنید یا در صورت نیاز دسته‌ها/زیردسته‌های جدید بسازید.
۲. شما اجازه کامل دارید که دسته‌بندی‌های موجود را ویرایش، اصلاح یا ادغام نمایید تا از ایجاد دسته‌های تکراری و موازی جلوگیری شود.
۳. در صورت نیاز می‌توانید مقالات بسته‌های قبلی را نیز به زیردسته‌های جدیدتر و تخصصی‌تر منتقل کنید تا درخت نهایی کاملاً منطقی، یکدست و بدون تکرار باشد.
۴. تمامی شناسه‌های مقالات بسته‌های قبلی همراه با مقالات این بسته باید در درخت نهایی حفظ شوند.

شناسه‌های مقالات جدید در این بسته:
[${allArticleIdsList.join(", ")}]

اطلاعات مقالات جدید این بسته:
${JSON.stringify(simplifiedArticles, null, 2)}`;
    } else {
      prompt = `شما باید تمام ${simplifiedArticles.length} مقاله زیر در بسته اولیه را بر اساس عنوان، توضیحات و کلیدواژه‌ها تحلیل کرده و ساختار درخت دسته‌بندی ۳ زبانه همراه با اسلاگ بسازید.

شناسه‌های مقالات این بسته اولیه:
[${allArticleIdsList.join(", ")}]

اطلاعات مقالات این بسته:
${JSON.stringify(simplifiedArticles, null, 2)}`;
    }

    console.log(`[Categorize Taxonomy] Analyzing batch ${batchIndex || 1}/${totalBatches || 1} (${simplifiedArticles.length} articles) with model ${model || "default"}...`);

    const rawResult = await callAIService({
      prompt,
      systemInstruction,
      model,
      responseFormatJson: true,
    });

    let taxonomyData;
    try {
      taxonomyData = extractJsonFromText(rawResult);
    } catch (parseErr: any) {
      console.error("[Categorize Taxonomy] JSON Parse Error. Raw response was:", rawResult);
      throw new Error(parseErr.message || "پاسخ هوش مصنوعی ساختار JSON معتبر نداشت. لطفاً مجدداً تلاش نمایید.");
    }

    // Ensure fallback arrays exist if model omitted them
    if (!taxonomyData.existingCategoriesTree || !Array.isArray(taxonomyData.existingCategoriesTree)) {
      taxonomyData.existingCategoriesTree = [];
    }
    if (!taxonomyData.proposedNewCategoriesTree || !Array.isArray(taxonomyData.proposedNewCategoriesTree)) {
      taxonomyData.proposedNewCategoriesTree = [];
    }

    // SERVER-SIDE STRICT DEDUPLICATION & COVERAGE GUARANTEE:
    // Ensure every article ID appears in at most 1 category/subcategory node across the entire tree.
    const globalAssignedIds = new Set<string>();

    const cleanTreeNodes = (nodes: any[]) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (Array.isArray(node.articleIds)) {
          node.articleIds = node.articleIds
            .map((id: any) => String(id))
            .filter((id: string) => {
              if (globalAssignedIds.has(id)) {
                return false; // Already assigned to another category, remove duplicate!
              }
              globalAssignedIds.add(id);
              return true;
            });
        } else {
          node.articleIds = [];
        }

        if (Array.isArray(node.subcategories) && node.subcategories.length > 0) {
          cleanTreeNodes(node.subcategories);
        }
      }
    };

    cleanTreeNodes(taxonomyData.existingCategoriesTree);

    // Find any unmapped article IDs from current batch
    const unmappedIds = allArticleIdsList.filter((id: string) => !globalAssignedIds.has(id));

    if (unmappedIds.length > 0) {
      console.log(`[Categorize Taxonomy] Notice: ${unmappedIds.length} articles in batch unassigned by AI. Auto-assigning to General category...`);

      let generalCat = taxonomyData.existingCategoriesTree.find((cat: any) =>
        cat.slug === "general-articles" ||
        cat.slug === "general" ||
        (cat.nameFa && cat.nameFa.includes("عمومی"))
      );

      if (!generalCat) {
        generalCat = {
          id: "cat_general_fallback",
          slug: "general-articles",
          nameFa: "مطالب و مقالات عمومی",
          nameEn: "General Articles",
          nameAr: "المقالات العامة",
          name: "مطالب و مقالات عمومی",
          enName: "General Articles",
          description: "دسته‌بندی جامع شامل مطالب عمومی و مقالات متنوع",
          articleIds: [],
          subcategories: [],
        };
        taxonomyData.existingCategoriesTree.push(generalCat);
      }

      if (!Array.isArray(generalCat.articleIds)) {
        generalCat.articleIds = [];
      }

      unmappedIds.forEach((id: string) => {
        if (!generalCat.articleIds.includes(id)) {
          generalCat.articleIds.push(id);
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...taxonomyData,
        totalArticlesAnalyzed: globalAssignedIds.size,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Categorize Taxonomy] Error:", error);
    res.status(500).json({ error: error.message || "خطا در تحلیل و دسته‌بندی هوشمند مقالات" });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
