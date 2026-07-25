import { useState, useEffect, useCallback } from "react";
import { Article } from "./types";
import { INITIAL_ARTICLES } from "./data/initialArticles";
import DashboardStats from "./components/DashboardStats";
import CSVImporterExporter from "./components/CSVImporterExporter";
import ChapterizerPanel from "./components/ChapterizerPanel";
import AICategoryManager from "./components/AICategoryManager";
import ArticleList from "./components/ArticleList";
import ArticleEditor from "./components/ArticleEditor";
import OpenRouterModelSelector from "./components/OpenRouterModelSelector";
import { ShieldCheck, Sparkles, BookOpen, Heart, RefreshCw, AlertTriangle } from "lucide-react";

export default function App() {
  const [openRouterEnabled, setOpenRouterEnabled] = useState(true);
  const [openRouterModels, setOpenRouterModels] = useState<{ id: string; name: string }[]>([
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
  ]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("openrouter_global_model") || "google/gemini-2.5-flash";
  });
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Load database from local storage if available, fallback to beautiful defaults
  const [articles, setArticles] = useState<Article[]>(() => {
    try {
      const saved = localStorage.getItem("articles_db");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load local storage database:", e);
    }
    return INITIAL_ARTICLES;
  });

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem("articles_db", JSON.stringify(articles));
    } catch (e) {
      console.error("Failed to sync articles database to localStorage:", e);
    }
  }, [articles]);

  // Fetch OpenRouter activation and models list
  useEffect(() => {
    setModelsLoading(true);
    fetch("/api/ai/models")
      .then((r) => {
        const contentType = r.headers.get("content-type");
        if (!r.ok || (contentType && contentType.includes("text/html"))) {
          throw new Error("پاسخ سرور قالب وب‌سایت HTML است. این نشان می‌دهد سرور شما در Coolify به عنوان یک پروژه استاتیک (Static / Pure HTML / React SPA) پیکربندی شده و کدهای سرور Node.js (فایل server.ts) اجرا نمی‌شوند، یا مسیریابی وب‌سرور (Nginx) درخواست‌های /api را به بک‌اند پروکسی نمی‌کند. لطفاً نوع پروژه را در کولیفای روی NodeJS / Custom Dockerfile تنظیم کنید.");
        }
        return r.json();
      })
      .then((modelData) => {
        if (modelData) {
          if (Array.isArray(modelData.data)) {
            setOpenRouterModels(modelData.data);
          }
          if (modelData.isFallback) {
            setIsFallback(true);
            setErrorDetails(modelData.errorDetails || "Unknown backend error");
          } else {
            setIsFallback(false);
            setErrorDetails(null);
          }
        }
      })
      .catch((err) => {
        console.error("Error loading OpenRouter models list", err);
        setIsFallback(true);
        setErrorDetails(err.message || String(err));
      })
      .finally(() => setModelsLoading(false));
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("openrouter_global_model", model);
  };

  // If no article is active, default to selecting the first active article on load
  const selectedArticle = articles.find((a) => a.id === selectedArticleId) || articles.find((a) => a.is_published !== "2") || articles[0] || null;

  // Set the default selection ID on mount or when clean database is imported
  useEffect(() => {
    if (articles.length > 0 && !selectedArticleId) {
      const active = articles.find((a) => a.is_published !== "2") || articles[0];
      setSelectedArticleId(active.id);
    }
  }, [articles, selectedArticleId]);

  // Actions
  const handleImport = (newArticles: Article[], append: boolean) => {
    // Briefly reset selected ID to clear editor cache and force synchronous re-sync
    setSelectedArticleId(null);
    
    setTimeout(() => {
      if (append) {
        setArticles((prev) => {
          // Create lookup map of existing IDs
          const existingIds = new Set(prev.map((a) => a.id));
          const filteredNew = newArticles.filter((n) => !existingIds.has(n.id));
          
          // Overwrite existing matching elements
          const updatedPrev = prev.map((item) => {
            const matchingNew = newArticles.find((n) => n.id === item.id);
            return matchingNew ? { ...matchingNew, ...matchingNew } : item;
          });

          const merged = [...updatedPrev, ...filteredNew];
          if (merged.length > 0) {
            setSelectedArticleId(merged[0].id);
          }
          return merged;
        });
      } else {
        setArticles(newArticles);
        if (newArticles.length > 0) {
          setSelectedArticleId(newArticles[0].id);
        } else {
          setSelectedArticleId(null);
        }
      }
    }, 10);
  };

  const handleSaveArticle = useCallback((updated: Article) => {
    setArticles((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }, []);

  const handleDeleteArticle = useCallback((articleId: string) => {
    setArticles((prev) => {
      const updated = prev.map((item) =>
        item.id === articleId ? { ...item, is_published: "2" } : item
      );
      if (selectedArticleId === articleId) {
        const nextActive = updated.find((item) => item.is_published !== "2");
        setSelectedArticleId(nextActive ? nextActive.id : null);
      }
      return updated;
    });
  }, [selectedArticleId]);

  const handleAddArticle = () => {
    const timestampNow = new Date().toISOString().replace("T", " ").substring(0, 19);
    const uniqueId = String(Date.now() + Math.floor(Math.random() * 100));
    
    const newArticle: Article = {
      id: uniqueId,
      category_id: "1",
      is_published: "0",
      base_image: "",
      title: "مقاله جدید بدون عنوان",
      slug: `new-article-${uniqueId}`,
      description: "توضیحات یا چکیده کوتاه این مقاله را در اینجا بنویسید...",
      body: "<p>محتوای با کیفیت فرسی خود را در اینجا آغاز فرمایید...</p>",
      view_count: "0",
      reading_time: "3",
      en_title: "",
      en_description: "",
      en_body: "",
      ar_title: "",
      ar_description: "",
      ar_body: "",
      deleted_at: "",
      created_at: timestampNow,
      updated_at: timestampNow,
      tags: "",
      isEdited: true, // Mark additions as edited initially
    };

    setArticles((prev) => [newArticle, ...prev]);
    setSelectedArticleId(newArticle.id);
  };

  // Reset demo back to beautiful Isfahan defaults
  const handleResetToDefaults = () => {
    setShowResetModal(true);
  };

  const executeReset = () => {
    try {
      localStorage.removeItem("articles_db");
      localStorage.removeItem("ai_taxonomy_cache");
    } catch (e) {
      console.error("Failed to clear localStorage caches:", e);
    }
    setArticles(INITIAL_ARTICLES);
    setSelectedArticleId(INITIAL_ARTICLES[0]?.id || null);
    setResetKey((prev) => prev + 1);
    setShowResetModal(false);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-[#e0e0e0] pb-12 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Dynamic Header Banner */}
      <header className="h-16 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-md sticky top-0 z-40 shadow-[0_4px_24px_rgba(0,0,0,0.6)] dir-rtl text-right">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)] text-white shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight sm:text-base text-white flex items-center gap-2">
                سامانه هوشمند مدیریت مقالات و تصویرسازی کاور
                <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded uppercase select-none">
                  v2.4
                </span>
              </h1>
              <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                پنل مدیریت مولتی‌لینگوال مجهز به دستیار هوش مصنوعی و تصویرساز اختصاصی Gemini
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {openRouterEnabled && (
              <div className="flex items-center gap-1.5" dir="rtl">
                <span className="text-[10px] font-extrabold text-cyan-400 hidden xs:inline shrink-0">
                  مدل هوش مصنوعی:
                </span>
                <OpenRouterModelSelector
                  models={openRouterModels}
                  selectedModel={selectedModel}
                  onModelChange={handleModelChange}
                  isLoading={modelsLoading}
                  isFallback={isFallback}
                  errorDetails={errorDetails}
                />
              </div>
            )}

            <button
              onClick={handleResetToDefaults}
              className="bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              بازنشانی دمو
            </button>
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              ذخیره محلی فعال
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Dynamic Counters Overview Dashboard */}
        <DashboardStats articles={articles} />

        {/* CSV import/export hub section */}
        <CSVImporterExporter articles={articles} onImport={handleImport} />

        {/* Custom Chapterizer and specialized JSON export panel */}
        <ChapterizerPanel
          key={`chap-${resetKey}`}
          articles={articles}
          selectedArticleId={selectedArticleId}
          onUpdateArticles={(updated) => setArticles(updated)}
          selectedModel={selectedModel}
        />

        {/* AI Multi-level Category & Taxonomy Manager */}
        <AICategoryManager
          key={`tax-${resetKey}`}
          articles={articles}
          onUpdateArticles={(updated) => setArticles(updated)}
          selectedModel={selectedModel}
        />

        {/* Workspace divide list & editor */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* List panel (column-span 4/12) */}
          <section className="lg:col-span-4 lg:sticky lg:top-20">
            <ArticleList
              articles={articles}
              selectedId={selectedArticle ? selectedArticle.id : null}
              onSelect={(art) => setSelectedArticleId(art.id)}
              onAdd={handleAddArticle}
              onDelete={handleDeleteArticle}
            />
          </section>

          {/* Active editor panel (column-span 8/12) */}
          <section className="lg:col-span-8">
            <ArticleEditor
              article={selectedArticle}
              onSave={handleSaveArticle}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
          </section>
        </div>
      </main>

      {/* Modern Compact Page Footer */}
      <footer className="mt-16 py-6 border-t border-white/10 bg-[#08080c] text-center max-w-7xl mx-auto px-4 text-xs text-gray-500 dir-rtl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 font-light">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              سامانه متصل به دیتابیس محلی زمان اجرا
            </span>
            <span className="text-gray-600 hidden sm:inline">|</span>
            <span>دستیار هوشمند: Gemini AI Translation & Expansion</span>
          </div>
          <div className="flex items-center gap-1">
            <span>ساخته شده با عشق به هنر محتوا و تم Immersive v2.4</span>
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500 shrink-0" />
          </div>
        </div>
      </footer>
      {/* Modal Dialog for Reset Demo Confirmation */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm dir-rtl animate-fadeIn">
          <div className="bg-[#0f1015] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl text-right space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">بازنشانی کامل دمو</h3>
                <p className="text-xs text-slate-400 mt-0.5">آیا مطمئن هستید؟</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
              با این اقدام، تمام تغییرات مقالات و حافظه کش دسته‌بندی‌های ساخته شده توسط AI پاک شده و داده‌های اولیه اصفهان به حالت پیش‌فرض بازگردانی می‌شوند.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={executeReset}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.4)] transition cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                بله، بازنشانی کن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
