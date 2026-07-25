import { useState, useEffect } from "react";
import { Article, LangTab } from "../types";
import HtmlWpEditor from "./HtmlWpEditor";
import OpenRouterModelSelector from "./OpenRouterModelSelector";
import {
  Save, Sparkles, Languages, FileText, CheckCircle, Clock, Eye, AlertCircle, Link as LinkIcon, RefreshCw, FileCode, Check, Copy, Image as ImageIcon, Tag, Plus, X, Cpu
} from "lucide-react";

interface ArticleEditorProps {
  article: Article | null;
  onSave: (updatedArticle: Article) => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

export default function ArticleEditor({
  article,
  onSave,
  selectedModel: propSelectedModel,
  onModelChange
}: ArticleEditorProps) {
  // If no article is selected
  if (!article) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-12 text-center text-slate-400 h-[750px] dir-rtl text-right">
        <FileText className="w-12 h-12 text-slate-300 mb-3" />
        <h3 className="font-bold text-slate-700 text-base">مقاله‌ای جهت ویرایش انتخاب نشده است</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
          یک مقاله را از لیست انتخاب کنید یا روی دکمه «مقاله نو» برای شروع ایجاد مقاله‌ای مدرن کلیک فرمایید.
        </p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<LangTab>("fa");
  const [formState, setFormState] = useState<Article>({ ...article });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [aiPromptText, setAiPromptText] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [openRouterEnabled, setOpenRouterEnabled] = useState(false);
  const [defaultModel, setDefaultModel] = useState("google/gemini-2.5-flash");
  const [selectedModel, setSelectedModel] = useState(propSelectedModel || "google/gemini-2.5-flash");
  const [openRouterModels, setOpenRouterModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Fetch AI configurations on mount
  useEffect(() => {
    fetch("/api/ai/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.openRouterEnabled) {
          setOpenRouterEnabled(true);
          setDefaultModel(data.defaultModel);
          if (!propSelectedModel) {
            setSelectedModel(data.defaultModel);
          }
          setModelsLoading(true);
          fetch("/api/ai/models")
            .then((r) => r.json())
            .then((modelData) => {
              if (modelData && Array.isArray(modelData.data)) {
                setOpenRouterModels(modelData.data);
              }
            })
            .catch((err) => console.error("Error loading OpenRouter models in ArticleEditor", err))
            .finally(() => setModelsLoading(false));
        }
      })
      .catch((err) => console.error("Failed to load AI configuration status", err));
  }, []);

  // Sync state when model selected globally changes
  useEffect(() => {
    if (propSelectedModel) {
      setSelectedModel(propSelectedModel);
    }
  }, [propSelectedModel]);

  const handleModelSelectionChange = (newVal: string) => {
    setSelectedModel(newVal);
    if (onModelChange) {
      onModelChange(newVal);
    }
  };

  // Sync state when article selection updates or is updated externally
  useEffect(() => {
    setFormState({ ...article });
    setAiError(null);
    setAiSuccess(null);
    setSaveSuccess(null);
  }, [article?.id, article?.updated_at]);

  // Synchronize changes on formState immediately with the parent in real-time
  useEffect(() => {
    if (formState && article && formState.id === article.id) {
      onSave(formState);
    }
  }, [formState, article?.id, onSave]);

  const handleChange = (key: keyof Article, value: any) => {
    setFormState((prev) => {
      const nextState = { ...prev };
      (nextState as any)[key] = value;
      // If we are overriding isEdited flag manually, respect that boolean value.
      // Otherwise, any user editing of standard fields automatically marks it as modified (true)
      if (key === "isEdited") {
        nextState.isEdited = !!value;
      } else {
        nextState.isEdited = true;
      }
      return nextState;
    });
  };

  const handleSaveClick = () => {
    const updated = {
      ...formState,
      updated_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    };
    onSave(updated);
    setSaveSuccess("تغییرات مقاله جاری با موفقیت روی حافظه داخلی ذخیره گردید و در بانک اطلاعاتی ثبت شد!");
    setTimeout(() => {
      setSaveSuccess(null);
    }, 4000);
  };

  // Convert Farsi title to a neat URL slug
  const handleAutoSlug = () => {
    const baseText = formState.en_title || formState.title || "";
    const generatedSlug = baseText
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w\u0600-\u06FF-]+/g, "") // Keep English and Persian characters
      .substring(0, 80);

    handleChange("slug", generatedSlug);
  };

  const executeTranslate = async (target: "en") => {
    setAiError(null);
    setAiSuccess(null);
    setAiLoading(true);

    const sourceTitle = formState.title;
    const sourceDesc = formState.description;
    const sourceBody = formState.body;

    if (!sourceTitle) {
      setAiError("لطفا ابتدا عنوان فارسی مقاله را تکمیل فرمایید.");
      setAiLoading(false);
      return;
    }

    try {
      // Translate title
      const titleRes = await fetch("/api/gemini/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceTitle, targetLang: "English", model: selectedModel }),
      });
      const titleData = await titleRes.json();
      if (!titleRes.ok) throw new Error(titleData.error || "ترجمه عنوان انجام نشد.");

      // Translate Description
      let translatedDesc = "";
      if (sourceDesc) {
        const descRes = await fetch("/api/gemini/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceDesc, targetLang: "English", model: selectedModel }),
        });
        const descData = await descRes.json();
        if (descRes.ok) translatedDesc = descData.translation;
      }

      // Translate Body HTML
      let translatedBody = "";
      if (sourceBody) {
        const bodyRes = await fetch("/api/gemini/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceBody, targetLang: "English", model: selectedModel }),
        });
        const bodyData = await bodyRes.json();
        if (bodyRes.ok) translatedBody = bodyData.translation;
      }

      setFormState((prev) => ({
        ...prev,
        en_title: titleData.translation,
        en_description: translatedDesc,
        en_body: translatedBody,
        isEdited: true,
      }));

      setAiSuccess(`ترجمه تمام بخش‌ها به انگلیسی با موفقیت انجام شد!`);
    } catch (err: any) {
      setAiError(err.message || "ترجمه با خطا روبرو شد.");
    } finally {
      setAiLoading(false);
    }
  };

  const [fieldAiLoading, setFieldAiLoading] = useState<Record<string, boolean>>({});

  const handleFieldGenerateAI = async (
    fieldTarget: "title" | "description" | "long_summary" | "en_title" | "en_description" | "slug" | "tags",
    instruction: string,
    contextContent: string
  ) => {
    setFieldAiLoading(prev => ({ ...prev, [fieldTarget]: true }));
    setAiError(null);
    setAiSuccess(null);

    try {
      const systemInstruction = `You are a professional blog and news web content editor. Optimize the field exactly as requested. Output ONLY the resulting string value absolutely without any markdown wrapper headers, markdown block quotes, explanations, surrounding quotation marks, or notes. Keep it concise, professional, and refined.`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${instruction}\n\nمتن مبدا/زمینه:\n${contextContent}`,
          currentContent: formState[fieldTarget] || "",
          field: fieldTarget,
          model: selectedModel,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تولید محتوا با خطا روبرو شد.");

      let cleaned = data.content ? data.content.trim() : "";
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
        cleaned = cleaned.replace(/`/g, "");
      }

      if (fieldTarget === "tags") {
        // Normalize Persian commas, semicolons, and newlines to english commas
        cleaned = cleaned.replace(/،/g, ",").replace(/؛/g, ",").replace(/;/g, ",").replace(/\r?\n/g, ",");
        const tagsList = cleaned.split(",")
          .map(t => t.trim())
          .map(t => t.replace(/^\d+[-.]\s*/, "").replace(/^-\s*/, "")) // remove numbering list numbering
          .map(t => t.trim())
          .filter(Boolean);
        cleaned = tagsList.join(",");
      }

      handleChange(fieldTarget, cleaned);
      setAiSuccess(`فیلد مربوطه با موفقیت توسط هوش مصنوعی بروزرسانی شد!`);
    } catch (err: any) {
      setAiError(err.message || "بروز خطای هوش مصنوعی");
    } finally {
      setFieldAiLoading(prev => ({ ...prev, [fieldTarget]: false }));
    }
  };

  const executeAISynthesis = async () => {
    if (!aiPromptText.trim()) return;
    setAiError(null);
    setAiSuccess(null);
    setAiLoading(true);

    try {
      let activeFieldKey: "body" | "en_body" = "body";
      if (activeTab === "en") activeFieldKey = "en_body";

      const currentContent = formState[activeFieldKey] || "";

      // System instruction for clean, beautiful and structured HTML output
      const systemInstruction = `You are an expert editorial writer and layout artist. Your job is to rewrite or expand the provided HTML body content based on the user's specific instruction. You MUST output ONLY valid, beautifully structured modern HTML markup tags (such as <h2>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>, <pre>, <code>, etc.). DO NOT wrap your output in markdown code blocks like \`\`\`html or \`\`\`. Start immediately with the HTML tags. Preserve original HTML formatting where appropriate but make sure the content expands cleanly, elegantly, and professionally. No commentary, introduction, or surrounding chat text.`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPromptText,
          currentContent,
          field: `${activeTab} body`,
          model: selectedModel,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ویرایش ناموفق بود.");

      let cleanHtml = data.content || "";
      // Clean up pre/post markdown wrappers from AI output if any
      cleanHtml = cleanHtml.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();

      handleChange(activeFieldKey, cleanHtml);
      setAiSuccess("محتوای متنی با موفقیت با توجه به دستور شما بازنویسی و با تگ‌های HTML قالب‌بندی شد.");
      setAiPromptText("");
    } catch (err: any) {
      setAiError(err.message || "بروز خطا در ویرایش مصنوعی.");
    } finally {
      setAiLoading(false);
    }
  };

  const executeAIAutoImprove = async () => {
    setAiError(null);
    setAiSuccess(null);
    setAiLoading(true);

    try {
      let activeFieldKey: "body" | "en_body" = "body";
      let langLabel = "Persian";
      if (activeTab === "en") {
        activeFieldKey = "en_body";
        langLabel = "English";
      }

      const currentContent = formState[activeFieldKey] || "";

      const promptText = `لطفا کل متن مقاله فعلی را بررسی کرده، غلط‌های املایی و نگارشی آن را اصلاح کنی و ساختار محتوا را با هدینگ‌های زیبای h2، پاراگراف‌های روان، لیست‌های بولت‌دار <ul>/<li> و تگ‌های قالب‌بندی دیگر (مانند <strong>) برای بهبود خوانایی ارتقا دهی. لحن متن باید کاملاً حرفه‌ای و متناسب با موضوع مقاله باشد.`;

      const systemInstruction = `You are an expert copyeditor, proofreader, and SEO technician. Optimize the provided content's flow, paragraph structure, style, typography, and grammar in the ${langLabel} language. Break long walls of text into clean semantic paragraphs separated by <h2> subheadings, bullet lists (<ul>/<li>), highlighted keywords (<strong>), or blockquotes (<blockquote>) where appropriate. Fix any grammatical, spelling, or punctuation errors. You MUST output ONLY valid, beautifully structured modern HTML markup suited for the body of a web article. Do NOT wrap your output in markdown code blocks like \`\`\`html or \`\`\`. Start immediately with the HTML tags. No commentary, intro or outro chat.`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent,
          field: `${activeTab} body`,
          model: selectedModel,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ارتقای خودکار ناموفق بود.");

      let cleanHtml = data.content || "";
      // Clean up markdown markers if any
      cleanHtml = cleanHtml.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();

      handleChange(activeFieldKey, cleanHtml);
      setAiSuccess("متن مقاله با موفقیت به پیشنهاد هوش مصنوعی ویرایش، اصلاح ساختاری و مجددا قالب‌بندی شد.");
    } catch (err: any) {
      setAiError(err.message || "بروز خطا در ارتقای خودکار مقاله.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-[#0c0c14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-[850px] dir-rtl text-right">
      {/* Editor Header */}
      <div className="p-4 bg-white/[0.02] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-cyan-400/10 text-cyan-400 font-bold px-2.5 py-0.5 rounded border border-cyan-400/20">
            ID: {formState.id}
          </span>
          <h3 className="font-bold text-white text-sm">پنل مدیریت و ویرایش مقاله</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Real-time sync badge */}
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ذخیره خودکار در لحظه
          </div>

          {/* Status edit manually overrides */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-200 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 transition">
            <input
              type="checkbox"
              checked={!!formState.isEdited}
              onChange={(e) => {
                const checked = e.target.checked;
                handleChange("isEdited", checked);
                setSaveSuccess(`وضعیت مقاله به عنوان ${checked ? "«ویرایش شده»" : "«اصلی (دست‌نخورده)»"} ثبت و ذخیره دائم شد.`);
                setTimeout(() => setSaveSuccess(null), 3500);
              }}
              className="w-4 h-4 text-cyan-500 rounded focus:ring-cyan-500 border-white/20 bg-black/40 cursor-pointer"
            />
            وضعیت ویرایش شده
          </label>

          <button
            onClick={handleSaveClick}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-[0_4px_12px_rgba(8,145,178,0.3)] cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-cyan-100" />
            تأیید نهایی و اتمام
          </button>
        </div>
      </div>

      {/* Primary fields form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-black/30">
        {/* Row 1: Common Configurations */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/10">
          {/* Publication switch */}
          <div>
            <label className="block text-xs font-extrabold text-[#f1f5f9] mb-1.5 flex items-center gap-1.5 justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
              وضعیت انتشار
            </label>
            <select
              value={formState.is_published}
              onChange={(e) => handleChange("is_published", e.target.value)}
              className="w-full text-xs font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="1" className="bg-[#0c0c14] text-emerald-400 font-bold">منتشر شده (Public)</option>
              <option value="0" className="bg-[#0c0c14] text-amber-400 font-bold">پیش‌نویس (Draft)</option>
              <option value="2" className="bg-[#0c0c14] text-rose-400 font-bold">حذف شده (Deleted)</option>
            </select>
          </div>

          {/* Category ID */}
          <div>
            <label className="block text-xs font-extrabold text-[#f1f5f9] mb-1.5 flex items-center gap-1.5 justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
              شناسه دسته‌بندی
            </label>
            <input
              type="text"
              value={formState.category_id}
              onChange={(e) => handleChange("category_id", e.target.value)}
              placeholder="مثلاً 5"
              className="w-full text-xs font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 text-center font-mono focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          {/* Reading Time */}
          <div>
            <label className="block text-xs font-extrabold text-[#f1f5f9] mb-1.5 flex items-center gap-1.5 justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
              زمان مطالعه (دقیقه)
            </label>
            <input
              type="number"
              value={formState.reading_time}
              onChange={(e) => handleChange("reading_time", e.target.value)}
              placeholder="مثلاً 6"
              className="w-full text-xs font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 text-center font-mono focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          {/* Views count */}
          <div>
            <label className="block text-xs font-extrabold text-[#f1f5f9] mb-1.5 flex items-center gap-1.5 justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
              تعداد بازدیدها
            </label>
            <input
              type="number"
              value={formState.view_count}
              onChange={(e) => handleChange("view_count", e.target.value)}
              placeholder="مثلاً 120"
              className="w-full text-xs font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 text-center font-mono focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            />
          </div>
        </div>

        {/* Row 2: Header cover photo (Direct link only - no upload or AI preview required as specified) */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/10 space-y-2">
          <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-start">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
            لینک مستقیم تصویر اصلی شاخص کاور (base_image)
          </label>
          <input
            type="text"
            value={formState.base_image}
            onChange={(e) => handleChange("base_image", e.target.value)}
            placeholder="مثلاً: https://yourdomain.com/images/cover.jpg"
            className="w-full text-xs font-mono bg-black/60 text-white border border-white/20 rounded-lg p-2.5 text-left focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-400 font-bold"
            dir="ltr"
          />
        </div>

        {/* Dynamic multilingual tab switcher - Farsi & English only */}
        <div className="border-b border-white/10">
          <div className="flex justify-between items-center bg-white/[0.02] px-2 rounded-t-lg border-t border-x border-white/10">
            <nav className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab("fa")}
                className={`py-2 px-4 text-xs font-bold border-b-2 transition cursor-pointer select-none ${
                  activeTab === "fa"
                    ? "border-cyan-400 text-cyan-400 font-extrabold bg-cyan-400/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                زبان فارسی (FA)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("en")}
                className={`py-2 px-4 text-xs font-bold border-b-2 transition cursor-pointer select-none ${
                  activeTab === "en"
                    ? "border-cyan-400 text-cyan-400 font-extrabold bg-cyan-400/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                English (EN)
              </button>
            </nav>

            {/* AI translate utilities - English target only */}
            <div className="flex gap-1.5 py-1">
              <button
                type="button"
                onClick={() => executeTranslate("en")}
                className="text-[10px] bg-white/5 border border-white/10 hover:border-cyan-500/40 hover:bg-white/10 px-3 py-1.5 rounded-md text-cyan-300 flex items-center gap-1 font-bold transition cursor-pointer"
                title="ترجمه کل متن فارسی به انگلیسی به کمک هوش مصنوعی"
                disabled={aiLoading}
              >
                <Languages className="w-3 h-3 text-cyan-400" />
                ترجمه به انگلیسی (AI)
              </button>
            </div>
          </div>
        </div>

        {/* Multi-language edit form panel using premium HtmlWpEditor */}
        <div className="space-y-4 text-right animate-fadeIn">
          {activeTab === "fa" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse select-none"></span>
                    عنوان مقاله (فارسی)
                  </label>
                  <button
                    type="button"
                    disabled={fieldAiLoading["title"] || (!formState.description && !formState.body)}
                    onClick={() => handleFieldGenerateAI("title", "با توجه به توضیحات یا متن بدنه زیر، یک عنوان فارسی جذاب، ترغیب‌کننده، خلاصه و متناسب با اصول سئو پیشنهاد دهيد. خروجی فقط شامل عنوان پیشنهادی باشد بدون گیومه یا کلمه اضافه.", formState.description || formState.body || "")}
                    className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
                  >
                    {fieldAiLoading["title"] ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                    )}
                    پیشنهاد عنوان با AI
                  </button>
                </div>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="عنوان فارسی مقاله را وارد کنید..."
                  className="w-full text-sm font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
                    چکیده / توضیحات کوتاه (فارسی)
                  </label>
                  <button
                    type="button"
                    disabled={fieldAiLoading["description"] || (!formState.title && !formState.body)}
                    onClick={() => handleFieldGenerateAI("description", "با استفاده از عنوان و متن بدنه زیر، یک چکیده (توضیحات کوتاه چند خطی در حدود ۲ جمله، زیر ۱۵۰ کاراکتر) به زبان فارسی که جذابیت بالایی برای کلیک روی این مطلب ایجاد کند تولید کنید. خروجی فقط شامل خلاصه نهایی باشد.", (formState.title || "") + "\n" + (formState.body || ""))}
                    className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
                  >
                    {fieldAiLoading["description"] ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                    )}
                    خلاصه‌سازی با AI
                  </button>
                </div>
                <textarea
                  value={formState.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="چکیده کوتاه مقاله جهت نمایش در نتایج موتورهای جستجو..."
                  className="w-full text-xs bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 leading-relaxed font-sans placeholder:text-slate-400"
                  rows={2}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 select-none"></span>
                    خلاصه مفصل / مقدمه مقاله (فارسی)
                  </label>
                  <button
                    type="button"
                    disabled={fieldAiLoading["long_summary"] || (!formState.title && !formState.body)}
                    onClick={() => handleFieldGenerateAI("long_summary", "با استفاده از عنوان و متن بدنه زیر، یک خلاصه مفصل و مقدمه جامع (حدود ۳ تا ۵ جمله، در حدود ۱۵۰ الی ۲۵۰ کلمه) به زبان فارسی که به عنوان مقدمه اصلی و خلاصه طولانی مقاله عمل کند تولید کن. خروجی فقط و فقط شامل خلاصه مفصل نهایی باشد بدون کلمه اضافه.", (formState.title || "") + "\n" + (formState.body || ""))}
                    className="text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
                  >
                    {fieldAiLoading["long_summary"] ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                    )}
                    تولید مقدمه/خلاصه مفصل با AI
                  </button>
                </div>
                <textarea
                  value={formState.long_summary || ""}
                  onChange={(e) => handleChange("long_summary", e.target.value)}
                  placeholder="مقدمه جامع و خلاصه مفصل مقاله جهت استفاده در ابتدای نوشته یا بخش خلاصه‌سازی..."
                  className="w-full text-xs bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-purple-400 focus:ring-1 focus:ring-purple-400 leading-relaxed font-sans placeholder:text-slate-400"
                  rows={3}
                />
              </div>

              {/* WordPress-style Advanced HTML Body Editor */}
              <div>
                <label className="block text-xs font-extrabold text-[#f1f5f9] mb-2 flex items-center gap-1.5 justify-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse select-none"></span>
                  پیکره اصلی محتوا و بدنه (HTML / متن فارسی)
                </label>
                <HtmlWpEditor
                  value={formState.body || ""}
                  onChange={(val) => handleChange("body", val)}
                  lang="fa"
                  placeholder="محتوای متنی فارسی مینیاتوری یا کدهای HTML پیشرفته مقاله خود را در اینجا بنویسید یا ویرایش کنید..."
                />
              </div>
            </div>
          )}

          {activeTab === "en" && (
            <div className="space-y-4 text-left" dir="ltr">
              <div>
                <div className="flex items-center justify-between mb-1.5" dir="rtl">
                  <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-end">
                    English Title
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse select-none"></span>
                  </label>
                  <button
                    type="button"
                    disabled={fieldAiLoading["en_title"] || !formState.title}
                    onClick={() => handleFieldGenerateAI("en_title", "Translate or generate a catchy SEO-optimized English article Title based on the Persian title/content below. Output ONLY the raw english title.", formState.title || "")}
                    className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
                  >
                    {fieldAiLoading["en_title"] ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                    )}
                    English Title with AI
                  </button>
                </div>
                <input
                  type="text"
                  value={formState.en_title}
                  onChange={(e) => handleChange("en_title", e.target.value)}
                  placeholder="Enter English title..."
                  className="w-full text-sm font-bold bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5" dir="rtl">
                  <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-end">
                    English Short Description
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
                  </label>
                  <button
                    type="button"
                    disabled={fieldAiLoading["en_description"] || (!formState.en_title && !formState.en_body && !formState.description)}
                    onClick={() => handleFieldGenerateAI("en_description", "Generate a compact, catchy 150-characters English meta description for this article. Output ONLY the raw description of 1-2 lines.", (formState.en_title || "") + "\n" + (formState.en_body || formState.description || ""))}
                    className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
                  >
                    {fieldAiLoading["en_description"] ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                    )}
                    Describe in English with AI
                  </button>
                </div>
                <textarea
                  value={formState.en_description}
                  onChange={(e) => handleChange("en_description", e.target.value)}
                  placeholder="Short description for summary cards..."
                  className="w-full text-xs bg-black/60 text-white border border-white/20 rounded-lg p-2.5 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 leading-relaxed font-sans placeholder:text-slate-400"
                  rows={2}
                />
              </div>

              {/* WordPress-style Advanced HTML Body Editor */}
              <div className="text-right">
                <label className="block text-xs font-extrabold text-[#f1f5f9] mb-2 flex items-center gap-1.5 justify-end">
                  Body Content (HTML English)
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse select-none"></span>
                </label>
                <HtmlWpEditor
                  value={formState.en_body || ""}
                  onChange={(val) => handleChange("en_body", val)}
                  lang="en"
                  placeholder="Type/Edit modern HTML body content in English mode..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Part 3: Slug and Dates Configuration */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 text-right">
                <LinkIcon className="w-4 h-4 text-cyan-400 animate-pulse select-none" />
                لینک یکتا انگلیسی مینیاتوری (Slug)
              </label>
              <button
                type="button"
                disabled={fieldAiLoading["slug"] || (!formState.en_title && !formState.title)}
                onClick={() => handleFieldGenerateAI("slug", "Create a modern, clean, ultra-short, SEO-friendly English URL Slug (lowercase-english-letters-with-hyphens-only) for the following title. No spaces, no underscores, no quote marks. Output ONLY the resulting slug string.", formState.en_title || formState.title || "")}
                className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
              >
                {fieldAiLoading["slug"] ? (
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                )}
                اصلاح انگلیسی با AI
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={formState.slug}
                onChange={(e) => handleChange("slug", e.target.value)}
                placeholder="slug-of-the-article"
                className="flex-1 text-xs font-mono bg-black/60 text-white border border-white/20 rounded-lg p-2.5 text-left focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-400"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleAutoSlug}
                className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-white/10 font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 transition cursor-pointer"
                title="جداسازی خودکار کلمات با خط فاصله"
              >
                جداسازی خودکار
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-extrabold text-[#f1f5f9] mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 select-none"></span>
              آخرین زمان به روز رسانی
            </span>
            <span className="text-xs font-mono text-white tracking-widest block bg-black/40 border border-white/10 py-2.5 rounded-lg text-center font-bold">
              {formState.updated_at || "اکنون"}
            </span>
          </div>
        </div>

        {/* Part 3.5: Tags Configuration */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/10 text-right font-sans">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-extrabold text-[#f1f5f9] flex items-center gap-1.5 justify-end">
              <Tag className="w-4 h-4 text-cyan-400" />
              تگ‌ها و کلیدواژه‌های مقاله (Tags)
            </label>
            <button
              type="button"
              disabled={fieldAiLoading["tags"]}
              onClick={() => handleFieldGenerateAI("tags", "با توجه به اطلاعات مقاله زیر (شامل عنوان، چکیده و متن بدنه)، بین 3 تا 10 تگ (برچسب یا کلمه کلیدی) پرسرچ و کاملاً مرتبط با موضوع تولید کن که ترکیبی از تگ‌های فارسی و انگلیسی باشند (مثلاً تعدادی به فارسی و تعدادی معادل انگلیسی آن‌ها). تگ‌ها را فقط و فقط با کامای انگلیسی (,) از هم جدا کن. هیچ متن اضافی، عدد شماره‌گذاری، توضیح اضافه یا مقدمه و مؤخره ننویس.", `${formState.title}\n${formState.description}\n${formState.body}`)}
              className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer disabled:opacity-40 font-bold"
            >
              {fieldAiLoading["tags"] ? (
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              )}
              تولید تگ با AI
            </button>
          </div>
          
          {/* Tags list and Input */}
          <div className="flex flex-wrap items-center gap-2 bg-black/40 border border-white/10 p-3 rounded-lg min-h-[46px]">
            {/* Render tag pills */}
            {formState.tags && formState.tags.split(",").map(t => t.trim()).filter(Boolean).length > 0 ? (
              formState.tags.split(",").map(t => t.trim()).filter(Boolean).map((tag, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg text-xs font-bold"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => {
                      const currentTags = formState.tags
                        ? formState.tags.split(",").map(t => t.trim()).filter(Boolean)
                        : [];
                      const updatedTags = currentTags.filter(t => t !== tag).join(",");
                      handleChange("tags", updatedTags);
                    }}
                    className="hover:text-rose-400 focus:outline-hidden cursor-pointer p-0.5 rounded transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500 select-none mr-1">هنوز هیچ تگی ثبت نشده است.</span>
            )}
            
            {/* Input to type new tag */}
            <div className="flex items-center gap-1.5 ms-auto w-full sm:w-auto mt-2 sm:mt-0">
              <input
                type="text"
                placeholder="تگ جدید..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newTagInput.trim()) {
                      const trimmed = newTagInput.trim();
                      const currentTags = formState.tags
                        ? formState.tags.split(",").map(t => t.trim()).filter(Boolean)
                        : [];
                      if (!currentTags.includes(trimmed)) {
                        const updatedTags = [...currentTags, trimmed].join(",");
                        handleChange("tags", updatedTags);
                      }
                      setNewTagInput("");
                    }
                  }
                }}
                className="bg-white/5 text-white text-xs border border-white/15 rounded-md px-2.5 py-1.5 focus:outline-hidden focus:border-cyan-400 placeholder:text-slate-500 w-full sm:w-32"
              />
              <button
                type="button"
                onClick={() => {
                  if (newTagInput.trim()) {
                    const trimmed = newTagInput.trim();
                    const currentTags = formState.tags
                      ? formState.tags.split(",").map(t => t.trim()).filter(Boolean)
                      : [];
                    if (!currentTags.includes(trimmed)) {
                      const updatedTags = [...currentTags, trimmed].join(",");
                      handleChange("tags", updatedTags);
                    }
                    setNewTagInput("");
                  }
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white p-1.5 rounded-md transition cursor-pointer"
                title="افزودن تگ"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-400 mt-1.5">
            برای ثبت تگ جدید، نام آن را وارد کرده و دکمه <span className="text-slate-200">Enter</span> یا دکمه + را بزنید. تگ‌ها به صورت خودکار ذخیره و در قالب CSV و JSON خروجی گرفته می‌شوند.
          </p>
        </div>

        {/* Gemini AI / OpenRouter Article Text Copilot Assistant */}
        <div className="border border-cyan-500/20 bg-cyan-950/10 p-4 rounded-xl space-y-3.5">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-1.5 justify-start">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs font-extrabold text-[#f1f5f9]">
                {openRouterEnabled ? "دستیار چندمدله هوش مصنوعی (OpenRouter AI)" : "دستیار بازنویسی و بسط محتوا (Gemini AI)"}
              </span>
            </div>
            
            {openRouterEnabled ? (
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded font-extrabold font-mono" dir="ltr">
                {selectedModel.split("/").pop() || selectedModel}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">Model: gemini-3.5-flash</span>
            )}
          </div>

          <p className="text-xs text-slate-100 leading-relaxed font-semibold">
            با نوشتن یک دستور کوتاه، هوش مصنوعی متن زبانه فعال شما را بازبینی، تکمیل یا به متن ادبی تبدیل می‌کند. مثال: «مقدمه‌ای جذاب در مورد سی‌و‌سه‌پل اصفهان به متن اضافه کن».
          </p>

          <div className="space-y-3">
            {/* Input with Custom Prompt Button */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={aiPromptText}
                onChange={(e) => setAiPromptText(e.target.value)}
                placeholder="مثلا: متن بالا را گسترش بده و نکات سئو بیشتری در آن اضافه کن..."
                className="flex-1 bg-black/60 text-white border border-white/20 text-xs px-3 py-2.5 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-cyan-500 placeholder:text-slate-500 font-bold"
              />
              <button
                type="button"
                onClick={executeAISynthesis}
                disabled={aiLoading || !aiPromptText.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition shrink-0 disabled:opacity-40 cursor-pointer shadow-[0_4px_12px_rgba(8,145,178,0.2)] flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                بسط اصولی با هوش مصنوعی
              </button>
            </div>

            {/* Direct Auto-Improve Button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={executeAIAutoImprove}
                disabled={aiLoading}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)] flex items-center gap-1.5 self-end"
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-200" />
                ویرایش و ارتقای مقاله به پیشنهاد هوش مصنوعی (نیمه‌اتوماتیک)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Operation Feedback notices */}
      {aiLoading && (
        <div className="bg-slate-800 text-white text-xs px-4 py-2.5 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>هوش مصنوعی در حال پردازش داده‌های ترجمه/بسط شماست... لطفا شکیبا باشید.</span>
        </div>
      )}

      {aiError && (
        <div className="bg-rose-600 text-white text-xs px-4 py-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {aiError}
          </span>
          <button onClick={() => setAiError(null)} className="text-[10px] underline">متوجه شدم</button>
        </div>
      )}

      {aiSuccess && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            {aiSuccess}
          </span>
          <button onClick={() => setAiSuccess(null)} className="text-[10px] underline">بستن خبر</button>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-cyan-600 text-white text-xs px-4 py-2.5 flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-1.5 font-bold">
            <CheckCircle className="w-4 h-4 text-cyan-200" />
            {saveSuccess}
          </span>
          <button onClick={() => setSaveSuccess(null)} className="text-[10px] underline font-bold text-cyan-100">بستن</button>
        </div>
      )}
    </div>
  );
}
