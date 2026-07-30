import React, { useState, useEffect, useRef } from "react";
import { parseHtmlToChapters, transformToSiteJson, stripImages, StructuredChapter } from "../utils/chapterizer";
import { Article } from "../types";
import { 
  Sparkles, Layers, FileJson, Check, Copy, HelpCircle, FileText, ChevronDown, CheckCircle, Flame, Download, ImageOff, Trash2,
  RefreshCw, Play, Pause, AlertTriangle, Languages, Link as LinkIcon, Cpu, Clock, Filter, User
} from "lucide-react";

interface ChapterizerPanelProps {
  key?: React.Key;
  articles: Article[];
  selectedArticleId: string | null;
  onUpdateArticles: (updatedList: Article[]) => void;
  selectedModel?: string;
}

export default function ChapterizerPanel({
  articles,
  selectedArticleId,
  onUpdateArticles,
  selectedModel
}: ChapterizerPanelProps) {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedObj, setCopiedObj] = useState<boolean>(false);

  const [exportAuthor, setExportAuthor] = useState<string>(() => {
    return localStorage.getItem("site_json_author") || "mohammadpp955.pp955@gmail.com";
  });

  const handleAuthorChange = (newVal: string) => {
    setExportAuthor(newVal);
    localStorage.setItem("site_json_author", newVal);
  };

  // Find currently selected article
  const currentArticle = articles.find(a => a.id === selectedArticleId) || null;

  // --- STATE FOR BATCH AI QUEUE ---
  const [safetyDelay, setSafetyDelay] = useState<number>(3); // safety delay in seconds
  const [batchOp, setBatchOp] = useState<"translate" | "tags" | "slug" | "description" | "long_summary" | null>(null);
  const [filterMode, setFilterMode] = useState<"only_empty" | "all">("only_empty");
  
  interface QueueItem {
    id: string;
    title: string;
    status: "idle" | "processing" | "success" | "error";
    errorMsg?: string;
  }
  
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  const [queueIndex, setQueueIndex] = useState<number>(-1);

  // We use references to always read the absolute latest variables inside async loops
  const isRunningRef = useRef(isQueueRunning);
  useEffect(() => {
    isRunningRef.current = isQueueRunning;
  }, [isQueueRunning]);

  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const safetyDelayRef = useRef(safetyDelay);
  useEffect(() => {
    safetyDelayRef.current = safetyDelay;
  }, [safetyDelay]);

  const batchOpRef = useRef(batchOp);
  useEffect(() => {
    batchOpRef.current = batchOp;
  }, [batchOp]);

  // Helper to filter target articles based on empty field requirement or all
  const getTargetArticles = (
    operation: "translate" | "tags" | "slug" | "description" | "long_summary",
    onlyEmpty: boolean
  ) => {
    const active = articles.filter((art) => art.is_published !== "2");
    if (!onlyEmpty) return active;

    return active.filter((art) => {
      if (operation === "translate") {
        return !art.en_title?.trim() || !art.en_description?.trim() || !art.en_body?.trim();
      }
      if (operation === "description") {
        return !art.description?.trim();
      }
      if (operation === "long_summary") {
        return !art.long_summary?.trim();
      }
      if (operation === "tags") {
        return !art.tags?.trim();
      }
      if (operation === "slug") {
        return !art.slug?.trim();
      }
      return true;
    });
  };

  const handleInitQueue = (
    operation: "translate" | "tags" | "slug" | "description" | "long_summary",
    overrideOnlyEmpty?: boolean
  ) => {
    const useEmptyFilter = overrideOnlyEmpty !== undefined ? overrideOnlyEmpty : filterMode === "only_empty";
    const targetArticles = getTargetArticles(operation, useEmptyFilter);
    
    if (targetArticles.length === 0) {
      setSuccessMsg(
        useEmptyFilter
          ? "هیچ مقاله‌ای با فیلد خالی برای این عملیات یافت نشد (تمامی مقالات این فیلد را دارا هستند)."
          : "هیچ مقاله فعالی جهت پردازش گروهی یافت نشد."
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      return;
    }
    
    const initialQueue: QueueItem[] = targetArticles.map((art) => ({
      id: art.id,
      title: art.title || "بدون عنوان",
      status: "idle",
    }));
    
    setQueue(initialQueue);
    queueRef.current = initialQueue;
    setBatchOp(operation);
    setIsQueueRunning(false);
    setQueueIndex(-1);

    const opLabels: Record<string, string> = {
      translate: "ترجمه دوزبانه انگلیسی",
      description: "چکیده / توضیحات کوتاه (فارسی)",
      long_summary: "خلاصه مفصل / مقدمه مقاله (فارسی)",
      tags: "کلیدواژه‌ساز ترکیبی",
      slug: "اسلاگ‌ساز انگلیسی",
    };

    const modeText = useEmptyFilter ? "فقط مقالات دارای فیلد خالی" : "تمامی مقالات فعال";
    setSuccessMsg(
      `صف پردازش «${opLabels[operation]}» برای ${targetArticles.length} مقاله (${modeText}) با موفقیت آماده شد. کلید شروع را فشار دهید تا کار آغاز شود.`
    );
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  const processQueueItemApi = async (articleId: string, op: "translate" | "tags" | "slug" | "description" | "long_summary"): Promise<Partial<Article>> => {
    const currentArticles = articlesRef.current;
    const article = currentArticles.find(a => a.id === articleId);
    if (!article) throw new Error("مقاله در حافظه یافت نشد.");

    const modelToUse = selectedModel || "google/gemini-2.5-flash";

    if (op === "translate") {
      const systemInstruction = `You are an expert translator and content localization engineer. Translate the given article from Persian to English. You MUST output a clean, valid, standard JSON object containing "en_title", "en_description", and "en_body" keys. Keep any HTML structure (like <h2>, <p>, <strong>, etc.) inside the en_body intact and translate the text inside them beautifully. Do NOT wrap your output in markdown code blocks like \`\`\`json or \`\`\`. Start immediately with the raw JSON string { and end with }. No introductory text or conversational wrapper.`;
      
      const promptText = `عنوان فارسی مقاله: ${article.title}
توضیحات کوتاه فارسی: ${article.description || ""}
بدنه فارسی مقاله (به همراه فرمت HTML): ${article.body || ""}`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent: "",
          field: "translation",
          model: modelToUse,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ارتباط با سرور هوش مصنوعی.");

      let rawText = data.content ? data.content.trim() : "";
      rawText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

      try {
        const parsed = JSON.parse(rawText);
        return {
          en_title: parsed.en_title || "",
          en_description: parsed.en_description || "",
          en_body: parsed.en_body || "",
          isEdited: true,
          updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
        };
      } catch (e) {
        console.error("JSON parsing failed, raw was:", rawText);
        throw new Error("قالب جیسون پاسخ مدل نامعتبر بود. مجدداً تلاش کنید.");
      }
    } else if (op === "tags") {
      const systemInstruction = `You are an expert copyeditor, metadata optimization manager, and SEO specialist. Output ONLY a comma-separated list of 3 to 10 high-traffic, relevant tags/keywords summarizing the article. Select some in Persian and some in English to target global audiences. Do NOT wrap in markdown blockquotes, quotes, or lists. Output strictly in the format: tag1, tag2, tag3... No introductory or concluding comments.`;

      const promptText = `عنوان مقاله: ${article.title}
توضیحات: ${article.description || ""}
کل محتوای بدنه مقاله: ${article.body || ""}`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent: article.tags || "",
          field: "tags",
          model: modelToUse,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تراکنش هوش مصنوعی ناموفق بود.");

      let cleaned = data.content ? data.content.trim() : "";
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
        cleaned = cleaned.replace(/`/g, "");
      }

      cleaned = cleaned.replace(/،/g, ",").replace(/؛/g, ",").replace(/;/g, ",").replace(/\r?\n/g, ",");
      const tagsList = cleaned.split(",")
        .map(t => t.trim())
        .map(t => t.replace(/^\d+[-.]\s*/, "").replace(/^-\s*/, ""))
        .map(t => t.trim())
        .filter(Boolean);
      cleaned = tagsList.join(",");

      return {
        tags: cleaned,
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    } else if (op === "slug") {
      const systemInstruction = `You are an expert SEO copywriter. Generate a clean, lowercase, URL-friendly English Slug using only alphanumeric characters and hyphens (-). Do NOT include quotes, backticks, or other characters. Output ONLY the raw slug string. Max 60 characters. No commentary.`;

      const promptText = `عنوان انگلیسی مقاله: ${article.en_title || ""}
عنوان فارسی مقاله: ${article.title}
توضیحات کوتاه: ${article.description || ""}`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent: article.slug || "",
          field: "slug",
          model: modelToUse,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تراکنش هوش مصنوعی ناموفق بود.");

      let cleaned = data.content ? data.content.trim() : "";
      cleaned = cleaned.replace(/["'`]/g, "").toLowerCase().trim();
      cleaned = cleaned.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");

      return {
        slug: cleaned,
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    } else if (op === "description") {
      const systemInstruction = `You are an expert SEO copywriter and content summarizer. Generate a compelling, high-CTR Persian short description/summary (under 180 characters, around 1-2 sentences) based on the title and body content of the given article. Output ONLY the clean summary text without quotes, backticks, markdown blockquotes, or extra commentary.`;

      const promptText = `عنوان مقاله: ${article.title}
متن بدنه مقاله: ${article.body || ""}`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent: article.description || "",
          field: "description",
          model: modelToUse,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تراکنش هوش مصنوعی ناموفق بود.");

      let cleaned = data.content ? data.content.trim() : "";
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
        cleaned = cleaned.replace(/`/g, "");
      }

      return {
        description: cleaned.trim(),
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    } else if (op === "long_summary") {
      const systemInstruction = `You are an expert editorial writer, copywriter, and SEO content summarizer. Generate a compelling, comprehensive Persian long summary / introduction (around 3-5 sentences, 150-250 words) based on the title and body content of the given article. This serves as the main article overview/intro. Output ONLY the clean summary text in Persian without quotes, backticks, markdown blockquotes, headers, or extra conversational commentary.`;

      const promptText = `عنوان مقاله: ${article.title}
متن بدنه مقاله: ${article.body || ""}`;

      const res = await fetch("/api/gemini/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          currentContent: article.long_summary || "",
          field: "long_summary",
          model: modelToUse,
          systemInstruction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تراکنش هوش مصنوعی ناموفق بود.");

      let cleaned = data.content ? data.content.trim() : "";
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
        cleaned = cleaned.replace(/`/g, "");
      }

      return {
        long_summary: cleaned.trim(),
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    }

    return {};
  };

  const executeQueueRunner = async () => {
    const currentOp = batchOpRef.current;
    if (!currentOp) return;

    const currentQueue = [...queueRef.current];
    const nextIndex = currentQueue.findIndex(item => item.status === "idle" || item.status === "error");

    if (nextIndex === -1) {
      setIsQueueRunning(false);
      setSuccessMsg("پردازش تمامی موارد صف هوش مصنوعی با موفقیت به پایان رسید.");
      setTimeout(() => setSuccessMsg(null), 6000);
      return;
    }

    setQueueIndex(nextIndex);

    const updatedQueueStep1 = currentQueue.map((item, idx) =>
      idx === nextIndex ? { ...item, status: "processing" as const } : item
    );
    setQueue(updatedQueueStep1);
    queueRef.current = updatedQueueStep1;

    try {
      const targetItem = currentQueue[nextIndex];
      const updatedFields = await processQueueItemApi(targetItem.id, currentOp);

      // Save immediately so state saves incremental progress
      const refreshedList = articlesRef.current.map(a =>
        a.id === targetItem.id ? { ...a, ...updatedFields } : a
      );
      onUpdateArticles(refreshedList);

      const updatedQueueStep2 = updatedQueueStep1.map((item, idx) =>
        idx === nextIndex ? { ...item, status: "success" as const, errorMsg: undefined } : item
      );
      setQueue(updatedQueueStep2);
      queueRef.current = updatedQueueStep2;

    } catch (err: any) {
      console.error(`Error processing queue item:`, err);
      const updatedQueueStep2 = updatedQueueStep1.map((item, idx) =>
        idx === nextIndex ? { ...item, status: "error" as const, errorMsg: err.message || "خطای ترافیک یا سرویس" } : item
      );
      setQueue(updatedQueueStep2);
      queueRef.current = updatedQueueStep2;
    }

    // Delay interval before the next item to circumvent rate limit
    setTimeout(() => {
      if (isRunningRef.current) {
        executeQueueRunner();
      }
    }, safetyDelayRef.current * 1000);
  };

  const startQueue = () => {
    if (isQueueRunning) return;
    setIsQueueRunning(true);
    setTimeout(() => {
      executeQueueRunner();
    }, 50);
  };

  const handleSingleRetry = async (idx: number) => {
    const currentOp = batchOp;
    if (!currentOp) return;

    const currentQueue = [...queue];
    const item = currentQueue[idx];
    if (!item) return;

    const step1 = currentQueue.map((q, qidx) => qidx === idx ? { ...q, status: "processing" as const } : q);
    setQueue(step1);

    try {
      const updatedFields = await processQueueItemApi(item.id, currentOp);
      
      const refreshedList = articles.map(a =>
        a.id === item.id ? { ...a, ...updatedFields } : a
      );
      onUpdateArticles(refreshedList);

      const step2 = step1.map((q, qidx) => qidx === idx ? { ...q, status: "success" as const, errorMsg: undefined } : q);
      setQueue(step2);
      setSuccessMsg(`مورد «${item.title}» با تلاش مجدد بازنشانی و به‌روزرسانی موثر گردید.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      const step2 = step1.map((q, qidx) => qidx === idx ? { ...q, status: "error" as const, errorMsg: err.message || "فراخوانی ناموفق" } : q);
      setQueue(step2);
    }
  };

  // 1. Chapterization for individual article
  const handleChapterizeSingle = () => {
    if (!currentArticle) return;
    
    const chapters = parseHtmlToChapters(currentArticle.body, currentArticle.title || "مقدمه");
    const updated: Article = {
      ...currentArticle,
      chapters,
      isEdited: true,
      updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    onUpdateArticles(articles.map(art => art.id === updated.id ? updated : art));
    setSuccessMsg(`مقاله جاری با موفقیت به ${chapters.length} چپتر بر پایه تگ‌های هدینگ سرتیتر دسته‌بندی شد!`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // 2. Chapterization for all articles in bulk
  const handleChapterizeAll = () => {
    if (articles.length === 0) return;
    
    const updatedList = articles.map(art => {
      if (!art) return art;
      const chapters = parseHtmlToChapters(art.body || "", art.title || "مقدمه");
      return {
        ...art,
        chapters,
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    });

    onUpdateArticles(updatedList);
    setSuccessMsg(`تمامی ${articles.length} مقاله موجود به صورت هوشمند و بر اساس سرتیترهای هدینگ چپتربندی شدند!`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // 2b. Remove all images from active single article (cleans Persian, English and Arabic fields)
  const handleStripImagesSingle = () => {
    if (!currentArticle) return;

    const cleanedBody = stripImages(currentArticle.body || "");
    const cleanedEnBody = stripImages(currentArticle.en_body || "");
    const cleanedArBody = stripImages(currentArticle.ar_body || "");
    
    const cleanedChapters = currentArticle.chapters?.map((ch) => ({
      ...ch,
      content: stripImages(ch.content || "")
    }));

    const updated: Article = {
      ...currentArticle,
      body: cleanedBody,
      en_body: cleanedEnBody,
      ar_body: cleanedArBody,
      chapters: cleanedChapters,
      isEdited: true,
      updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    onUpdateArticles(articles.map(art => art.id === updated.id ? updated : art));
    setSuccessMsg(`تمامی تگ‌های تصاویر با موفقیت از محتوا و چپترهای مقاله جاری حذف گردید.`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 2c. Remove all images from all articles in bulk (cleans Persian, English and Arabic fields)
  const handleStripImagesAll = () => {
    if (articles.length === 0) return;

    const updatedList = articles.map(art => {
      if (!art) return art;
      const cleanedBody = stripImages(art.body || "");
      const cleanedEnBody = stripImages(art.en_body || "");
      const cleanedArBody = stripImages(art.ar_body || "");
      
      const cleanedChapters = art.chapters?.map((ch) => ({
        ...ch,
        content: stripImages(ch.content || "")
      }));

      return {
        ...art,
        body: cleanedBody,
        en_body: cleanedEnBody,
        ar_body: cleanedArBody,
        chapters: cleanedChapters,
        isEdited: true,
        updated_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
    });

    onUpdateArticles(updatedList);
    setSuccessMsg(`عملیات موفقیت‌آمیز: تگ‌های تصاویر تمامی ${articles.length} مقاله موجود به طور کامل پاکسازی شدند.`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // 3. Export Single Article Site JSON
  const handleExportSingleJson = () => {
    if (!currentArticle) return;
    
    // Ensure chapters exist
    const chapters = currentArticle.chapters || parseHtmlToChapters(currentArticle.body, currentArticle.title || "مقدمه");
    const siteJson = transformToSiteJson(currentArticle, chapters, exportAuthor);
    
    const blob = new Blob([JSON.stringify(siteJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `article-${currentArticle.slug || currentArticle.id}-site-export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setSuccessMsg("فایل JSON تک‌مقاله بر اساس ساختار اختصاصی سایت با موفقیت تولید و دانلود شد.");
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // 4. Export All Articles Bulk Site JSON List (Array of formatted items)
  const handleExportAllJson = () => {
    const activeArticles = articles.filter(art => art.is_published !== "2");
    if (activeArticles.length === 0) {
      setSuccessMsg("هیچ مقاله فعالی (غیر حذف شده) برای صادر کردن یافت نشد.");
      setTimeout(() => setSuccessMsg(null), 4000);
      return;
    }

    const formattedList = activeArticles.map(art => {
      const chapters = art.chapters || parseHtmlToChapters(art.body, art.title || "مقدمه");
      return transformToSiteJson(art, chapters, exportAuthor);
    });

    // We export as a master JSON array or as a beautiful wrapper
    const blob = new Blob([JSON.stringify(formattedList, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `all-articles-site-export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMsg(`فایل دیتابیس جامع حاوی ${activeArticles.length} مقاله فعال با موفقیت دانلود شد.`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 4-b. Export Only Deleted Articles Bulk JSON List
  const handleExportDeletedJson = () => {
    const deletedArticles = articles.filter(art => art.is_published === "2");
    if (deletedArticles.length === 0) {
      setSuccessMsg("هیچ فراداده و مقاله‌ای با وضعیت «حذف شده» جهت صادرات یافت نشد.");
      setTimeout(() => setSuccessMsg(null), 5000);
      return;
    }

    const formattedList = deletedArticles.map(art => {
      const chapters = art.chapters || parseHtmlToChapters(art.body, art.title || "مقدمه");
      return transformToSiteJson(art, chapters, exportAuthor);
    });

    const blob = new Blob([JSON.stringify(formattedList, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `deleted-articles-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMsg(`فایل پشتیبان حاوی ${deletedArticles.length} مقاله حذف شده با موفقیت دانلود گردید.`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 5. Copy current article output schema to clipboard for fast inspection
  const handleCopySingleJson = () => {
    if (!currentArticle) return;
    const chapters = currentArticle.chapters || parseHtmlToChapters(currentArticle.body, currentArticle.title || "مقدمه");
    const siteJson = transformToSiteJson(currentArticle, chapters, exportAuthor);
    
    navigator.clipboard.writeText(JSON.stringify(siteJson, null, 2))
      .then(() => {
        setCopiedObj(true);
        setTimeout(() => setCopiedObj(false), 2000);
      });
  };

  return (
    <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-cyan-500/20 rounded-2xl p-6 shadow-2xl mb-8 dir-rtl text-right">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400 animate-pulse" />
            جعبه ابزار چپتربندی مقالات و صادرات ساختاریافته (JSON اختصاصی)
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            محتوای پیوسته مقالات را بر اساس تگ‌های هدر (<span className="font-mono text-cyan-400 font-bold">H2/H3/...</span>) به چپترهای تکی تقسیم کرده و فایل نهایی جیسون منطبق با ساختار دیتابیس سایت دریافت فرمایید.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex p-0.5 bg-black/40 border border-white/10 rounded-lg shrink-0">
          <button
            onClick={() => setActiveTab("single")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "single"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-extrabold shadow-[0_2px_8px_rgba(6,182,212,0.15)]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            تک مقاله جاری
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "bulk"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-extrabold shadow-[0_2px_8px_rgba(6,182,212,0.15)]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            عملیات گروهی همه
          </button>
        </div>
      </div>

      {/* Global Author Input Field */}
      <div className="mb-5 p-3.5 bg-slate-900/90 border border-cyan-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 dir-rtl text-right shadow-inner">
        <div className="flex items-center gap-2">
          <User className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
          <div>
            <label htmlFor="export-author-input" className="text-xs font-extrabold text-white block cursor-pointer">
              تنظیم نویسنده خروجی (فیلد author در JSON):
            </label>
            <span className="text-[10px] text-slate-400">مقدار مشخص شده در این تک‌فیلد به عنوان نویسنده در تمامی خروجی‌های JSON تکی و کلی سایت قرار خواهد گرفت.</span>
          </div>
        </div>
        <div className="w-full sm:w-80">
          <input
            id="export-author-input"
            type="text"
            value={exportAuthor}
            onChange={(e) => handleAuthorChange(e.target.value)}
            placeholder="mohammadpp955.pp955@gmail.com"
            className="w-full bg-black/70 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-1.5 px-3 rounded-lg outline-none font-mono dir-ltr text-left placeholder:text-slate-600 transition"
          />
        </div>
      </div>

      {/* Success Notifications */}
      {successMsg && (
        <div className="mb-5 flex items-start gap-2.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-xs font-bold animate-fadeIn">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === "single" && (
        <div className="space-y-4 animate-fadeIn">
          {currentArticle ? (
            <div className="bg-black/20 rounded-xl p-4 border border-white/5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              <div className="md:col-span-6 space-y-1">
                <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 inline-block">
                  مقاله فعال جهت پردازش
                </span>
                <h4 className="text-sm font-bold text-white mt-1.5 truncate">
                  {currentArticle.title}
                </h4>
                <div className="flex gap-4 text-xs text-slate-400 font-medium">
                  <span>وضعیت چپترها: {currentArticle.chapters && currentArticle.chapters.length > 0 ? (
                    <span className="text-emerald-400 font-extrabold">دارای {currentArticle.chapters.length} چپتر ذخیره‌شده</span>
                  ) : (
                    <span className="text-amber-400 font-bold">بخش‌بندی نشده (تک‌پاراگراف)</span>
                  )}</span>
                </div>
              </div>

              {/* Action Buttons list */}
              <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Chapterization button */}
                <button
                  type="button"
                  onClick={handleChapterizeSingle}
                  className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs p-3 rounded-xl transition duration-200 cursor-pointer shadow-lg outline-none"
                >
                  <Layers className="w-4 h-4 text-cyan-100" />
                  چپتربندی مقاله جاری
                </button>

                {/* 2. Download JSON button */}
                <button
                  type="button"
                  onClick={handleExportSingleJson}
                  className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/10 font-bold text-xs p-3 rounded-xl transition duration-200 cursor-pointer outline-none"
                >
                  <Download className="w-4 h-4 text-cyan-300" />
                  دانلود JSON مخصوص سایت
                </button>

                {/* 2b. Clear Images button */}
                <button
                  type="button"
                  onClick={handleStripImagesSingle}
                  className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/20 font-bold text-xs p-3 rounded-xl transition duration-200 cursor-pointer outline-none"
                >
                  <ImageOff className="w-4 h-4 text-rose-400" />
                  حذف تمامی تصاویر محتوای این مقاله
                </button>

                {/* 3. Copy schema code to clipboard */}
                <button
                  type="button"
                  onClick={handleCopySingleJson}
                  className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-black/40 hover:bg-black/60 text-slate-300 border border-white/10 font-sans text-xs p-2 rounded-lg transition duration-200 cursor-pointer"
                >
                  {copiedObj ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 font-bold" />
                      <span className="text-emerald-400">ساختار JSON کپی شد!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>کپی ساختار JSON جهت اعتبارسنجی سریع</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-black/30 text-center text-slate-400 p-8 rounded-xl border border-dashed border-white/15 text-xs font-semibold">
              هیچ مقاله‌ای جهت پردازش انتخاب نشده است. لطفا ابتدا یک مقاله را کلیک فرمایید.
            </div>
          )}

          {/* Chapters Live visualizer preview */}
          {currentArticle?.chapters && currentArticle.chapters.length > 0 && (
            <div className="mt-4 bg-black/40 border border-white/5 rounded-xl p-4">
              <span className="text-[10px] text-slate-400 font-extrabold flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                لیست زنده چپترهای تولید شده بر اساس سرتیترها:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {currentArticle.chapters.map((ch, idx) => (
                  <div key={idx} className="bg-white/[0.02] border border-white/10 rounded-lg p-3 hover:border-cyan-500/30 transition text-right">
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                      <span className="text-[10px] font-mono font-bold text-cyan-400">Order: {ch.order}</span>
                      <span className="text-[9px] bg-white/5 text-slate-300 px-1.5 py-0.5 rounded font-bold">CHAPTER</span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-200 mt-2 truncate">{ch.title}</h5>
                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: ch.content }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "bulk" && (
        <div className="bg-black/20 rounded-xl p-5 border border-white/5 space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-emerald-400 font-extrabold text-xs flex items-center gap-1">
                <Flame className="w-4 h-4 text-amber-400" />
                بخش کنترل و اجرای فله‌ای (Bulk Operation Dashboard)
              </span>
              <p className="text-xs text-slate-400 mt-1.5">
                تعداد مقالات لود شده در دیتابیس زمان اجرا: <strong className="text-white font-mono">{articles.length} مقاله</strong>. هماهنگ با فرمت JSON دیتابیس لوکال و سایت شما.
              </p>
            </div>

            <div className="flex gap-2">
              {/* Reset Database helper link */}
              <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-400/20 px-3 py-1.5 rounded-lg font-bold">
                تمام تغییرات مگامانیتور ذخیره محلی می‌گردد
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* 1. Bulk Chapterizer Button */}
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  چپتربندی فله‌ای تمامی مقالات
                </h4>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  سیستم به طور خودکار شروع به خواندن تگ‌های هدینگ در تک تک مقالات کرده و چپترهای مجزا تولید می‌کند.
                </p>
              </div>
              <button
                onClick={handleChapterizeAll}
                className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-all cursor-pointer text-center outline-none shadow-md"
              >
                اجرای چپتر‌بندی سراسری
              </button>
            </div>

            {/* 2. Bulk Export JSON Button */}
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-amber-400" />
                  دانلود فایل JSON جامع (مخصوص سایت)
                </h4>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  دریافت فایل کل مقالات به همراه بخش‌های سکشن‌بندی و آرایه چندسطحی چپترهای پارس شده، کاملا منطبق با نمونه دیتابیس.
                </p>
              </div>
              <button
                onClick={handleExportAllJson}
                className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-all cursor-pointer text-center outline-none shadow-md"
              >
                بارگیری فایل دیتابیس جامع JSON
              </button>
            </div>

            {/* 3. Export Deleted JSON Button */}
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-rose-300 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  خروجی پشتیبان حذف‌شده‌ها
                </h4>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  دانلود یک فایل JSON جداگانه حاوی اطلاعات تمام مقالاتی که حذف شده‌اند، جهت استفاده یا بازیابی در آینده.
                </p>
              </div>
              <button
                onClick={handleExportDeletedJson}
                className="mt-4 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/30 text-xs font-bold py-2.5 px-4 rounded-lg transition-all cursor-pointer text-center outline-none shadow-md"
              >
                دانلود مقالات حذف شده
              </button>
            </div>

            {/* 4. Bulk Strip Images Button */}
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-rose-300 flex items-center gap-1.5">
                  <ImageOff className="w-4 h-4 text-rose-400" />
                  حذف فله‌ای تمام تصاویر مقالات
                </h4>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  حذف کامل تمامی تگ‌های تصویر (img) و عکس‌های لینک‌شده از دیتابیس محلی کل مقالات با یک کلیک ساده.
                </p>
              </div>
              <button
                onClick={handleStripImagesAll}
                className="mt-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-all cursor-pointer text-center outline-none shadow-md"
              >
                پاکسازی فله‌ای تصاویر
              </button>
            </div>
          </div>

          {/* ADVANCED AI QUEUE MANAGER */}
          <div className="mt-8 border-t border-white/10 pt-6 space-y-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400 rotate-12" />
              <div>
                <h3 className="text-sm font-black text-white">مدیریت صف پیشرفته هوش مصنوعی (AI Bulk Queue Runner)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">عملیات گروهی سنگین روی کل محتوای مقالات فعال با فواصل ایمن قابل تنظیم (پیشگیری از خطای ۴۲۹)، کنترل تعلیق/ادامه هوشمند و بازیابی خطاهای تک‌به‌تک.</p>
              </div>
            </div>

            {batchOp === null ? (
              <div className="bg-black/40 border border-dashed border-white/15 p-5 rounded-xl space-y-4">
                {/* Filter Mode Header Switcher */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/80 p-3 rounded-xl border border-white/10 text-right">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-xs font-extrabold text-white block">حالت انتخاب مقالات برای صف:</span>
                      <span className="text-[10px] text-slate-400">می‌توانید تمام مقالات یا فقط مواردی که فیلد آن‌ها خالی است را هدف قرار دهید.</span>
                    </div>
                  </div>
                  <div className="flex items-center p-1 bg-black/60 border border-white/10 rounded-lg gap-1 shrink-0 w-full sm:w-auto justify-center">
                    <button
                      type="button"
                      onClick={() => setFilterMode("only_empty")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        filterMode === "only_empty"
                          ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      فقط مقالات دارای فیلد خالی / بدون مقدار
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("all")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        filterMode === "all"
                          ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      تمامی مقالات فعال (بازنویسی کامل)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                  {/* 1. Translation */}
                  {(() => {
                    const emptyCount = getTargetArticles("translate", true).length;
                    const totalCount = getTargetArticles("translate", false).length;
                    const activeCount = filterMode === "only_empty" ? emptyCount : totalCount;
                    return (
                      <div className="flex flex-col justify-between p-4 bg-cyan-950/20 hover:bg-cyan-950/30 border border-cyan-500/20 rounded-xl transition group">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Languages className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition" />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              emptyCount > 0 
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-mono" 
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            }`}>
                              {emptyCount > 0 ? `${emptyCount} مقاله بدون ترجمه` : "ترجمه کامل"}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-cyan-200">مترجم دوزبانه انگلیسی</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            ترجمه فیلدهای عنوان، چکیده و بدنه HTML مقالات.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <button
                            onClick={() => handleInitQueue("translate")}
                            className="w-full py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer"
                          >
                            ایجاد صف ({activeCount} مقاله)
                          </button>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <button
                              type="button"
                              onClick={() => handleInitQueue("translate", true)}
                              className="hover:text-cyan-300 underline cursor-pointer"
                            >
                              فقط بدون ترجمه ({emptyCount})
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleInitQueue("translate", false)}
                              className="hover:text-cyan-300 underline cursor-pointer"
                            >
                              همه ({totalCount})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2. Short Description */}
                  {(() => {
                    const emptyCount = getTargetArticles("description", true).length;
                    const totalCount = getTargetArticles("description", false).length;
                    const activeCount = filterMode === "only_empty" ? emptyCount : totalCount;
                    return (
                      <div className="flex flex-col justify-between p-4 bg-purple-950/20 hover:bg-purple-950/30 border border-purple-500/20 rounded-xl transition group">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <FileText className="w-6 h-6 text-purple-400 group-hover:scale-110 transition" />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              emptyCount > 0 
                                ? "bg-purple-500/20 text-purple-300 border-purple-500/30 font-mono" 
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            }`}>
                              {emptyCount > 0 ? `${emptyCount} مقاله بدون چکیده` : "چکیده‌ها کامل است"}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-purple-200">چکیده / توضیحات کوتاه (فارسی)</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            خلاصه‌سازی هوشمند و تولید چکیده کوتاه زیر ۱۸۰ کاراکتر.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <button
                            onClick={() => handleInitQueue("description")}
                            className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer"
                          >
                            ایجاد صف ({activeCount} مقاله)
                          </button>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <button
                              type="button"
                              onClick={() => handleInitQueue("description", true)}
                              className="hover:text-purple-300 underline cursor-pointer"
                            >
                              فقط بدون چکیده ({emptyCount})
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleInitQueue("description", false)}
                              className="hover:text-purple-300 underline cursor-pointer"
                            >
                              همه ({totalCount})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3. Long Summary / Introduction */}
                  {(() => {
                    const emptyCount = getTargetArticles("long_summary", true).length;
                    const totalCount = getTargetArticles("long_summary", false).length;
                    const activeCount = filterMode === "only_empty" ? emptyCount : totalCount;
                    return (
                      <div className="flex flex-col justify-between p-4 bg-indigo-950/20 hover:bg-indigo-950/30 border border-indigo-500/20 rounded-xl transition group">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Sparkles className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition" />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              emptyCount > 0 
                                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono" 
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            }`}>
                              {emptyCount > 0 ? `${emptyCount} مقاله بدون مقدمه` : "مقدمه‌ها کامل است"}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-indigo-200">خلاصه مفصل / مقدمه مقاله (فارسی)</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            تولید مقدمه چند پاراگرافی و خلاصه جامع برای مقالات.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <button
                            onClick={() => handleInitQueue("long_summary")}
                            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer"
                          >
                            ایجاد صف ({activeCount} مقاله)
                          </button>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <button
                              type="button"
                              onClick={() => handleInitQueue("long_summary", true)}
                              className="hover:text-indigo-300 underline cursor-pointer"
                            >
                              فقط بدون مقدمه ({emptyCount})
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleInitQueue("long_summary", false)}
                              className="hover:text-indigo-300 underline cursor-pointer"
                            >
                              همه ({totalCount})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 4. Tags */}
                  {(() => {
                    const emptyCount = getTargetArticles("tags", true).length;
                    const totalCount = getTargetArticles("tags", false).length;
                    const activeCount = filterMode === "only_empty" ? emptyCount : totalCount;
                    return (
                      <div className="flex flex-col justify-between p-4 bg-emerald-950/20 hover:bg-emerald-950/30 border border-emerald-500/20 rounded-xl transition group">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <CheckCircle className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition" />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              emptyCount > 0 
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-mono" 
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            }`}>
                              {emptyCount > 0 ? `${emptyCount} مقاله بدون برچسب` : "برچسب‌ها کامل است"}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-emerald-200">کلیدواژه‌ساز ترکیبی</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            تولید بین ۳ الی ۱۰ برچسب فارسی و انگلیسی.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <button
                            onClick={() => handleInitQueue("tags")}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer"
                          >
                            ایجاد صف ({activeCount} مقاله)
                          </button>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <button
                              type="button"
                              onClick={() => handleInitQueue("tags", true)}
                              className="hover:text-emerald-300 underline cursor-pointer"
                            >
                              فقط بدون برچسب ({emptyCount})
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleInitQueue("tags", false)}
                              className="hover:text-emerald-300 underline cursor-pointer"
                            >
                              همه ({totalCount})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 5. Slug */}
                  {(() => {
                    const emptyCount = getTargetArticles("slug", true).length;
                    const totalCount = getTargetArticles("slug", false).length;
                    const activeCount = filterMode === "only_empty" ? emptyCount : totalCount;
                    return (
                      <div className="flex flex-col justify-between p-4 bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/20 rounded-xl transition group">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <LinkIcon className="w-6 h-6 text-amber-400 group-hover:scale-110 transition" />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              emptyCount > 0 
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono" 
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            }`}>
                              {emptyCount > 0 ? `${emptyCount} مقاله بدون اسلاگ` : "اسلاگ‌ها کامل است"}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-amber-200">اسلاگ‌ساز انگلیسی یکتا</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            تولید اسلاگ سئو استاندارد انگلیسی برای آدرس صفحات.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                          <button
                            onClick={() => handleInitQueue("slug")}
                            className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer"
                          >
                            ایجاد صف ({activeCount} مقاله)
                          </button>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <button
                              type="button"
                              onClick={() => handleInitQueue("slug", true)}
                              className="hover:text-amber-300 underline cursor-pointer"
                            >
                              فقط بدون اسلاگ ({emptyCount})
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleInitQueue("slug", false)}
                              className="hover:text-amber-300 underline cursor-pointer"
                            >
                              همه ({totalCount})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="bg-black/40 border border-white/10 rounded-xl p-5 space-y-5 animate-fadeIn">
                {/* Active Op header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      {isQueueRunning && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isQueueRunning ? "bg-cyan-500" : "bg-amber-500"}`}></span>
                    </span>
                    <span className="text-xs font-bold text-slate-200">
                      فرآیند انتخابی فعال: {" "}
                      <span className="text-cyan-400">
                        {batchOp === "translate" && "مترجم دوزبانه انگلیسی"}
                        {batchOp === "description" && "ساخت چکیده / توضیحات کوتاه (فارسی)"}
                        {batchOp === "long_summary" && "ساخت خلاصه مفصل / مقدمه مقاله (فارسی)"}
                        {batchOp === "tags" && "تولید کلیدواژه‌های SEO ترکیبی"}
                        {batchOp === "slug" && "تولید اسلاگ (Slug) آدرس صفحات"}
                      </span>
                    </span>
                  </div>

                  {/* Config: Safety delay */}
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] text-slate-300 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                      تاخیر ایمن ارسال (ثانیه):
                    </label>
                    <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 rounded px-2 py-1">
                      <button 
                        disabled={isQueueRunning} 
                        onClick={() => setSafetyDelay(Math.max(1, safetyDelay - 1))}
                        className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer font-bold px-1"
                      >-</button>
                      <span className="text-xs font-mono font-bold text-white px-1 w-5 text-center">{safetyDelay}</span>
                      <button 
                        disabled={isQueueRunning} 
                        onClick={() => setSafetyDelay(safetyDelay + 1)}
                        className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer font-bold px-1"
                      >+</button>
                    </div>
                  </div>
                </div>

                {/* Queue Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-black/55 border border-white/5 rounded-lg p-3 text-center">
                    <span className="text-[10px] text-slate-400 block font-bold">کل صف</span>
                    <span className="text-base font-mono font-extrabold text-white">{queue.length}</span>
                  </div>
                  <div className="bg-black/55 border border-white/5 rounded-lg p-3 text-center">
                    <span className="text-[10px] text-emerald-400 block font-bold">موفقیت‌آمیز</span>
                    <span className="text-base font-mono font-extrabold text-emerald-400">{queue.filter(q => q.status === "success").length}</span>
                  </div>
                  <div className="bg-black/55 border border-white/5 rounded-lg p-3 text-center">
                    <span className="text-[10px] text-rose-400 block font-bold">خطا خورده</span>
                    <span className="text-base font-mono font-extrabold text-rose-400">{queue.filter(q => q.status === "error").length}</span>
                  </div>
                  <div className="bg-black/55 border border-white/5 rounded-lg p-3 text-center">
                    <span className="text-[10px] text-cyan-300 block font-bold">در انتظار پردازش</span>
                    <span className="text-base font-mono font-extrabold text-cyan-300">{queue.filter(q => q.status === "idle").length}</span>
                  </div>
                </div>

                {/* Queue Progress Bar */}
                {queue.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                      <span>پیشرفت کلی صف</span>
                      <span>
                        {Math.round((queue.filter(q => q.status === "success" || q.status === "error").length / queue.length) * 100)}%
                        {" "}({queue.filter(q => q.status === "success" || q.status === "error").length} از {queue.length})
                      </span>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/5">
                      <div 
                        className={`h-full transition-all duration-300 ${isQueueRunning ? "bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse" : "bg-emerald-500"}`}
                        style={{ width: `${(queue.filter(q => q.status === "success" || q.status === "error").length / queue.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Main Queue Actions */}
                <div className="flex flex-wrap gap-2.5">
                  {!isQueueRunning ? (
                    <button
                      onClick={startQueue}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow transition cursor-pointer outline-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      شروع پردازش گروهی صف
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsQueueRunning(false)}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow transition cursor-pointer outline-none"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      توقف موقت پردازش
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setQueue([]);
                      setBatchOp(null);
                      setIsQueueRunning(false);
                      setQueueIndex(-1);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 rounded-lg text-xs font-bold transition cursor-pointer outline-none"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    انصراف و بستن ابزار صف
                  </button>

                  <div className="mr-auto flex items-center text-[10px] text-slate-400 font-bold gap-1 bg-black/25 px-2.5 py-1.5 rounded-lg border border-white/5 font-mono">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    Model: <span className="text-cyan-300">{selectedModel || "google/gemini-2.5-flash"}</span>
                  </div>
                </div>

                {/* Queue Data Grid / Table */}
                <div className="border border-white/5 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-black/50 text-slate-300 font-bold border-b border-white/5">
                        <th className="p-2.5 w-12 text-center font-mono text-[10px]">ردیف</th>
                        <th className="p-2.5">عنوان مقاله</th>
                        <th className="p-2.5 w-52">وضعیت تراکنش</th>
                        <th className="p-2.5 w-24 text-center">تلاش تک‌باره</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {queue.map((item, idx) => (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-white/[0.01] transition ${idx === queueIndex ? "bg-cyan-500/10" : ""}`}
                        >
                          <td className="p-2.5 font-mono text-center text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-semibold text-white truncate max-w-xs">{item.title}</td>
                          <td className="p-2.5">
                            {item.status === "idle" && (
                              <span className="text-slate-400 flex items-center gap-1.5 font-bold text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                در انتظار پردازش
                              </span>
                            )}
                            {item.status === "processing" && (
                              <span className="text-cyan-300 flex items-center gap-1.5 font-bold text-[11px] animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                                در حال ارتباط با مدل...
                              </span>
                            )}
                            {item.status === "success" && (
                              <span className="text-emerald-400 flex items-center gap-1.5 font-semibold text-[11px]">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                موفق ✅
                              </span>
                            )}
                            {item.status === "error" && (
                              <div className="text-rose-400 space-y-0.5">
                                <span className="flex items-center gap-1.5 font-bold text-[11px]">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  خطا و عدم موفقیت
                                </span>
                                <p className="text-[9px] text-rose-300/80 leading-normal line-clamp-1" title={item.errorMsg}>
                                  {item.errorMsg}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {(item.status === "idle" || item.status === "error") && (
                              <button
                                disabled={isQueueRunning}
                                onClick={() => handleSingleRetry(idx)}
                                className="px-2 py-1 text-[10px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 rounded transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              >
                                اجرای تکی
                              </button>
                            )}
                            {item.status === "processing" && (
                              <span className="text-[10px] text-cyan-400/70 font-mono">busy</span>
                            )}
                            {item.status === "success" && (
                              <span className="text-[10px] text-emerald-500/70 font-bold">موفق</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
