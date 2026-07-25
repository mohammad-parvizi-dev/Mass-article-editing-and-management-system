import React, { useState, useEffect, useMemo, useRef, MouseEvent } from "react";
import { Article, TaxonomyCategory, TaxonomyResult } from "../types";
import {
  FolderTree,
  Sparkles,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Download,
  RefreshCw,
  Lightbulb,
  Search,
  CheckCircle,
  AlertCircle,
  Code,
  Zap,
  Check,
  Globe,
  Link as LinkIcon,
  Terminal,
  StopCircle,
  Layers,
  FileText
} from "lucide-react";

interface AICategoryManagerProps {
  key?: React.Key;
  articles: Article[];
  onUpdateArticles: (updatedList: Article[]) => void;
  selectedModel?: string;
}

export default function AICategoryManager({
  articles,
  onUpdateArticles,
  selectedModel = "google/gemini-2.5-flash"
}: AICategoryManagerProps) {
  const [activeTab, setActiveTab] = useState<"extracted" | "proposed" | "json">("extracted");
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Batching & Real-time Logs State
  const [batchSize, setBatchSize] = useState<number>(30);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Cached taxonomy result state
  const [taxonomy, setTaxonomy] = useState<TaxonomyResult | null>(() => {
    try {
      const saved = localStorage.getItem("ai_taxonomy_cache");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load taxonomy cache:", e);
    }
    return null;
  });

  // Search & Tree expansion state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<TaxonomyCategory | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active articles list
  const activeArticles = useMemo(
    () => articles.filter((a) => a.is_published !== "2"),
    [articles]
  );

  // Auto-scroll logs terminal to bottom on update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Count total assigned articles in taxonomy tree
  const countArticlesInTree = (nodes?: TaxonomyCategory[]): number => {
    if (!nodes || !Array.isArray(nodes)) return 0;
    let count = 0;
    nodes.forEach((n) => {
      if (n.articleIds && Array.isArray(n.articleIds)) {
        count += n.articleIds.length;
      }
      if (n.subcategories && Array.isArray(n.subcategories)) {
        count += countArticlesInTree(n.subcategories);
      }
    });
    return count;
  };

  // Track article IDs assigned to any category in taxonomy tree
  const mappedArticleIdsSet = useMemo(() => {
    if (!taxonomy || !taxonomy.existingCategoriesTree) return new Set<string>();
    const set = new Set<string>();
    const collect = (nodes: TaxonomyCategory[]) => {
      nodes.forEach((n) => {
        if (n.articleIds && Array.isArray(n.articleIds)) {
          n.articleIds.forEach((id) => set.add(String(id)));
        }
        if (n.subcategories && n.subcategories.length > 0) {
          collect(n.subcategories);
        }
      });
    };
    collect(taxonomy.existingCategoriesTree);
    return set;
  }, [taxonomy]);

  // Find unassigned articles if any
  const unassignedArticles = useMemo(() => {
    return activeArticles.filter((a) => !mappedArticleIdsSet.has(String(a.id)));
  }, [activeArticles, mappedArticleIdsSet]);

  // Auto fix unassigned articles by adding them to a General category
  const handleFixUnassignedArticles = () => {
    if (!taxonomy || !taxonomy.existingCategoriesTree || unassignedArticles.length === 0) return;

    const unassignedIds = unassignedArticles.map((a) => String(a.id));
    const tree = [...taxonomy.existingCategoriesTree];

    let generalNode = tree.find(
      (cat) =>
        cat.slug === "general-articles" ||
        cat.slug === "general" ||
        (cat.nameFa && cat.nameFa.includes("عمومی"))
    );

    if (!generalNode) {
      generalNode = {
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
      tree.push(generalNode);
    }

    if (!generalNode.articleIds) generalNode.articleIds = [];
    unassignedIds.forEach((id) => {
      if (!generalNode!.articleIds.includes(id)) {
        generalNode!.articleIds.push(id);
      }
    });

    const updatedTaxonomy: TaxonomyResult = {
      ...taxonomy,
      existingCategoriesTree: tree,
      totalArticlesAnalyzed: activeArticles.length,
      updatedAt: new Date().toISOString(),
    };

    setTaxonomy(updatedTaxonomy);
    setSuccessMsg(`تعداد ${unassignedIds.length} مقاله باقیمانده با موفقیت به دسته "مطالب و مقالات عمومی" اضافه شدند و پوشش ۱۰۰٪ تکمیل شد.`);
  };

  // Quick copy helper
  const copyText = (text: string, key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Save taxonomy to local storage when updated
  useEffect(() => {
    if (taxonomy) {
      try {
        localStorage.setItem("ai_taxonomy_cache", JSON.stringify(taxonomy));
      } catch (e) {
        console.error("Failed to save taxonomy cache:", e);
      }
    }
  }, [taxonomy]);

  // Expand all root nodes by default when taxonomy is available
  useEffect(() => {
    if (taxonomy) {
      const initialExpanded: Record<string, boolean> = {};
      const collectIds = (nodes: TaxonomyCategory[]) => {
        nodes.forEach((n) => {
          initialExpanded[n.id] = true;
          if (n.subcategories && n.subcategories.length > 0) {
            collectIds(n.subcategories);
          }
        });
      };
      if (taxonomy.existingCategoriesTree) collectIds(taxonomy.existingCategoriesTree);
      if (taxonomy.proposedNewCategoriesTree) collectIds(taxonomy.proposedNewCategoriesTree);
      setExpandedNodes(initialExpanded);
    }
  }, [taxonomy]);

  // Toggle node expand/collapse
  const toggleNode = (nodeId: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleExpandAll = () => {
    if (!taxonomy) return;
    const allExpanded: Record<string, boolean> = {};
    const collectIds = (nodes: TaxonomyCategory[]) => {
      nodes.forEach((n) => {
        allExpanded[n.id] = true;
        if (n.subcategories && n.subcategories.length > 0) {
          collectIds(n.subcategories);
        }
      });
    };
    if (taxonomy.existingCategoriesTree) collectIds(taxonomy.existingCategoriesTree);
    if (taxonomy.proposedNewCategoriesTree) collectIds(taxonomy.proposedNewCategoriesTree);
    setExpandedNodes(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  // Run AI Incremental Batch Taxonomy Analysis
  const handleAnalyzeTaxonomy = async () => {
    if (!articles || articles.length === 0) {
      setError("هیچ مقاله‌ای برای تحلیل وجود ندارد.");
      return;
    }

    const activeArticlesList = articles.filter((a) => a.is_published !== "2");
    if (activeArticlesList.length === 0) {
      setError("هیچ مقاله فعالی برای تحلیل یافت نشد.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setLogs([]);
    setShowLogs(true);
    isCancelledRef.current = false;

    // Split active articles into batches of size `batchSize`
    const chunks: Article[][] = [];
    for (let i = 0; i < activeArticlesList.length; i += batchSize) {
      chunks.push(activeArticlesList.slice(i, i + batchSize));
    }

    const addLog = (msg: string) => {
      const timeStr = new Date().toLocaleTimeString("fa-IR");
      setLogs((prev) => [...prev, `[${timeStr}] ${msg}`]);
    };

    addLog(`🚀 شروع تحلیل هوشمند دسته‌بندی با مدل انتخاب شده: ${selectedModel}`);
    addLog(`📊 تعداد کل مقالات: ${activeArticlesList.length} مقاله | اندازه هر بسته: ${batchSize} تایی | تعداد بسته‌ها: ${chunks.length}`);

    let currentTaxonomy: TaxonomyResult | null = null;

    try {
      for (let index = 0; index < chunks.length; index++) {
        if (isCancelledRef.current) {
          addLog(`⚠️ فرآیند بسته‌ای توسط کاربر متوقف شد.`);
          setSuccessMsg("پردازش بسته‌ای متوقف شد. درخت دسته‌بندی استخراج شده تا این مرحله حفظ گردید.");
          break;
        }

        const chunk = chunks[index];
        const startNum = index * batchSize + 1;
        const endNum = Math.min((index + 1) * batchSize, activeArticlesList.length);

        setBatchProgress({
          current: index + 1,
          total: chunks.length,
          percent: Math.round(((index + 1) / chunks.length) * 100),
        });

        const batchLogMsg = index === 0
          ? `📦 ارسال بسته ۱ از ${chunks.length} شامل ${chunk.length} مقاله (مقالات شماره ${startNum} تا ${endNum})...`
          : `📦 ارسال بسته ${index + 1} از ${chunks.length} شامل ${chunk.length} مقاله (مقالات شماره ${startNum} تا ${endNum}) و ادغام در درخت موجود...`;

        setLoadingStep(batchLogMsg);
        addLog(batchLogMsg);

        const res = await fetch("/api/ai/categorize-taxonomy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articles: chunk,
            existingTaxonomy: currentTaxonomy ? {
              existingCategoriesTree: currentTaxonomy.existingCategoriesTree,
              proposedNewCategoriesTree: currentTaxonomy.proposedNewCategoriesTree,
            } : null,
            batchIndex: index + 1,
            totalBatches: chunks.length,
            model: selectedModel,
          }),
        });

        const rawResText = await res.text();
        let responseData: any = null;
        try {
          responseData = JSON.parse(rawResText);
        } catch (e) {
          throw new Error(`خطای سرور در بسته ${index + 1} (کد ${res.status}): پاسخ دریافت شده JSON معتبر نبود.`);
        }

        if (!res.ok) {
          throw new Error(responseData.error || `خطای سرور در بسته ${index + 1} با کد ${res.status}`);
        }

        if (responseData.success && responseData.data) {
          currentTaxonomy = responseData.data;
          // Live update UI tree
          setTaxonomy(currentTaxonomy);

          const totalMapped = countArticlesInTree(currentTaxonomy.existingCategoriesTree);
          const topCatsCount = currentTaxonomy.existingCategoriesTree?.length || 0;
          addLog(`✅ بسته ${index + 1} با موفقیت پردازش شد. (کل مقالات دسته‌بندی‌شده تاکنون: ${totalMapped} از ${activeArticlesList.length} | تعداد دسته‌های اصلی: ${topCatsCount})`);
        } else {
          throw new Error(responseData.error || `پاسخ دریافتی در بسته ${index + 1} شامل داده‌های معتبر نبود.`);
        }

        // Brief delay for smooth UI feedback
        if (index < chunks.length - 1 && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (!isCancelledRef.current) {
        addLog(`🎉 تحلیل بسته‌ای با موفقیت به پایان رسید! تمامی ${activeArticlesList.length} مقاله آنالیز و در درخت دسته‌بندی قرار گرفتند.`);
        setSuccessMsg(`تحلیل هوشمند بسته‌ای و دسته‌بندی کامل تمامی ${activeArticlesList.length} مقاله با موفقیت انجام شد.`);
      }
    } catch (err: any) {
      console.error("Batch taxonomy error:", err);
      const errMsg = err.message || "خطا در برقراری ارتباط با مدل هوش مصنوعی.";
      setError(errMsg);
      addLog(`❌ خطا در اجرای پردازش بسته‌ای: ${errMsg}`);
    } finally {
      setLoading(false);
      setLoadingStep("");
      setBatchProgress(null);
    }
  };

  const handleCancelBatch = () => {
    isCancelledRef.current = true;
    setLoadingStep("درحال متوقف کردن فرآیند بسته‌ای...");
  };

  // Map AI category English SLUGs back onto articles category_id
  const handleApplyCategoriesToArticles = () => {
    if (!taxonomy || !taxonomy.existingCategoriesTree) return;

    let updatedCount = 0;
    const articleCategoryMap: Record<string, string> = {};

    const mapCategoryNode = (node: TaxonomyCategory) => {
      // Clean URL Slug as category_id
      const rawSlug = node.slug || node.nameEn || node.enName || node.id;
      const slugVal = rawSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      if (node.articleIds && Array.isArray(node.articleIds)) {
        node.articleIds.forEach((artId) => {
          articleCategoryMap[artId] = slugVal;
        });
      }
      if (node.subcategories && node.subcategories.length > 0) {
        node.subcategories.forEach(mapCategoryNode);
      }
    };

    taxonomy.existingCategoriesTree.forEach(mapCategoryNode);

    const updatedArticles = articles.map((article) => {
      if (articleCategoryMap[article.id]) {
        updatedCount++;
        return {
          ...article,
          category_id: articleCategoryMap[article.id],
          isEdited: true,
        };
      }
      return article;
    });

    onUpdateArticles(updatedArticles);
    setSuccessMsg(`اسلاگ دسته‌بندی‌ها (Slug) با موفقیت بر روی فیلد category_id تعداد ${updatedCount} مقاله اعمال شد.`);
  };

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    if (!taxonomy) return;
    navigator.clipboard.writeText(JSON.stringify(taxonomy, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Download JSON file
  const handleDownloadJson = () => {
    if (!taxonomy) return;
    const blob = new Blob([JSON.stringify(taxonomy, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taxonomy-categories-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Flattened article lookup for drawer & tree details
  const articleMap = useMemo(() => {
    const map = new Map<string, Article>();
    articles.forEach((a) => map.set(a.id, a));
    return map;
  }, [articles]);

  // Recursive Category Node Renderer Component
  const renderCategoryNode = (
    node: TaxonomyCategory,
    depth: number = 0,
    isProposed: boolean = false,
    keyPrefix: string = "root"
  ) => {
    const isExpanded = !!expandedNodes[node.id];
    const hasChildren = node.subcategories && node.subcategories.length > 0;
    const assignedArticleIds = node.articleIds || [];
    const articleCount = assignedArticleIds.length;

    const nameFa = node.nameFa || node.name || "بدون عنوان";
    const nameEn = node.nameEn || node.enName || "";
    const nameAr = node.nameAr || "";
    const slug = node.slug || node.id;

    // Filter check for search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesSelf =
        nameFa.toLowerCase().includes(q) ||
        nameEn.toLowerCase().includes(q) ||
        nameAr.toLowerCase().includes(q) ||
        slug.toLowerCase().includes(q) ||
        (node.description && node.description.toLowerCase().includes(q));

      const matchesChildren =
        hasChildren &&
        node.subcategories!.some((child) => {
          return (
            (child.nameFa || child.name || "").toLowerCase().includes(q) ||
            (child.nameEn || child.enName || "").toLowerCase().includes(q) ||
            (child.slug || "").toLowerCase().includes(q)
          );
        });

      if (!matchesSelf && !matchesChildren) {
        return null;
      }
    }

    const isSelected = selectedCategory?.id === node.id;

    return (
      <div key={`${isProposed ? "prop" : "ext"}-${node.id || "cat"}-${keyPrefix}`} className="relative transition-all duration-150 dir-rtl text-right">
        {/* Category Item Row */}
        <div
          onClick={() => setSelectedCategory(node)}
          className={`group flex items-start justify-between p-3 my-1.5 rounded-xl border transition cursor-pointer select-none ${
            isSelected
              ? "bg-cyan-950/50 border-cyan-500/70 shadow-[0_0_15px_rgba(6,182,212,0.2)] text-white"
              : "bg-white/[0.02] hover:bg-white/[0.05] border-white/10 text-slate-200"
          }`}
          style={{ marginRight: `${depth * 18}px` }}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {/* Expand / Collapse Icon */}
            {hasChildren ? (
              <button
                onClick={(e) => toggleNode(node.id, e)}
                className="mt-1 p-1 text-slate-400 hover:text-cyan-400 hover:bg-white/10 rounded transition cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4 rotate-180" />
                )}
              </button>
            ) : (
              <span className="w-6 h-6 inline-block shrink-0" />
            )}

            {/* Folder Icon */}
            <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isProposed ? "bg-amber-500/10 text-amber-400" : "bg-cyan-500/10 text-cyan-400"}`}>
              {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            </div>

            {/* Category Info */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Row 1: Persian Name & Quick Copy */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm text-white group-hover:text-cyan-300 transition">
                  {nameFa}
                </span>

                <button
                  onClick={(e) => copyText(nameFa, `fa-${node.id}`, e)}
                  className="text-[10px] bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1 transition cursor-pointer"
                  title="کپی عنوان فارسی"
                >
                  {copiedKey === `fa-${node.id}` ? (
                    <span className="text-emerald-400 font-bold">کپی شد</span>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>FA</span>
                    </>
                  )}
                </button>

                {isProposed && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    پیشنهادی AI
                  </span>
                )}
              </div>

              {/* Row 2: English Slug & Multilingual Badges with Copy Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                {/* Slug Badge */}
                {slug && (
                  <button
                    onClick={(e) => copyText(slug, `slug-${node.id}`, e)}
                    className="font-mono text-[10px] bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
                    title="کپی اسلاگ انگلیسی"
                  >
                    <LinkIcon className="w-2.5 h-2.5 text-cyan-400" />
                    <span>{slug}</span>
                    {copiedKey === `slug-${node.id}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 text-slate-400 opacity-60" />
                    )}
                  </button>
                )}

                {/* English Name Badge */}
                {nameEn && (
                  <button
                    onClick={(e) => copyText(nameEn, `en-${node.id}`, e)}
                    className="font-sans text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
                    title="کپی نام انگلیسی"
                  >
                    <span className="text-[9px] text-slate-500 font-bold uppercase">EN:</span>
                    <span>{nameEn}</span>
                    {copiedKey === `en-${node.id}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 text-slate-400 opacity-60" />
                    )}
                  </button>
                )}

                {/* Arabic Name Badge */}
                {nameAr && (
                  <button
                    onClick={(e) => copyText(nameAr, `ar-${node.id}`, e)}
                    className="font-sans text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
                    title="کپی نام عربی"
                  >
                    <span className="text-[9px] text-slate-500 font-bold uppercase">AR:</span>
                    <span>{nameAr}</span>
                    {copiedKey === `ar-${node.id}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 text-slate-400 opacity-60" />
                    )}
                  </button>
                )}
              </div>

              {node.description && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{node.description}</p>
              )}

              {isProposed && node.suggestedReason && (
                <p className="text-[11px] text-amber-300/80 mt-1 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-amber-400 shrink-0" />
                  علت پیشنهاد: {node.suggestedReason}
                </p>
              )}
            </div>
          </div>

          {/* Right badge: count of articles */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            {!isProposed ? (
              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                  articleCount > 0
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-slate-800 text-slate-500 border-slate-700"
                }`}
              >
                {articleCount} مقاله
              </span>
            ) : (
              <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                توسعه
              </span>
            )}
          </div>
        </div>

        {/* Subcategories Children Recursive list */}
        {hasChildren && isExpanded && (
          <div className="border-r-2 border-cyan-500/20 mr-4 pr-1 space-y-1">
            {node.subcategories!.map((child, idx) => renderCategoryNode(child, depth + 1, isProposed, `${keyPrefix}-${idx}`))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-5 md:p-6 shadow-2xl text-slate-200 dir-rtl text-right">
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] shrink-0">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              تحلیل هوشمند، دسته‌بندی ۳ زبانه و اسلاگ (AI Taxonomy)
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                Trilingual & Slugs
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              استخراج دسته‌بندی‌های چندسطحی با اسلاگ انگلیسی و عناوین (فارسی، انگلیسی، عربی) + قابلیت کپی تک‌تک فیلدها و جایگزینی Slug روی مقالات
            </p>
          </div>
        </div>

        {/* Top Action Trigger & Batch Size Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Batch Size Selector */}
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-400 font-medium whitespace-nowrap">اندازه بسته:</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={loading}
              className="bg-white/5 border border-white/10 text-cyan-300 font-bold rounded-lg px-2 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-50 text-xs"
            >
              <option value={15} className="bg-slate-900 text-white">۱۵ تایی (خیلی سریع)</option>
              <option value={20} className="bg-slate-900 text-white">۲۰ تایی (توصیه شده)</option>
              <option value={30} className="bg-slate-900 text-white">۳۰ تایی (استاندارد)</option>
              <option value={50} className="bg-slate-900 text-white">۵۰ تایی (بزرگ)</option>
            </select>
          </div>

          {!loading ? (
            <button
              onClick={handleAnalyzeTaxonomy}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-cyan-200" />
              {taxonomy ? "بازتحلیل بسته‌ای با AI" : "شروع تحلیل بسته‌ای (Batching)"}
            </button>
          ) : (
            <button
              onClick={handleCancelBatch}
              className="bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <StopCircle className="w-4 h-4 text-rose-400 animate-pulse" />
              لغو پردازش
            </button>
          )}

          {taxonomy && !loading && (
            <button
              onClick={handleApplyCategoriesToArticles}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="جایگزین کردن Slug دسته‌بندی روی فیلد category_id مقالات"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              اعمال Slug دسته‌ها روی مقالات
            </button>
          )}
        </div>
      </div>

      {/* Loading Progress Overlay & Progress Bar */}
      {loading && (
        <div className="my-5 p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 space-y-3 shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-2 text-cyan-300">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span className="animate-pulse">{loadingStep}</span>
            </div>
            {batchProgress && (
              <span className="font-mono text-cyan-400 bg-cyan-500/20 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                بسته {batchProgress.current} از {batchProgress.total} ({batchProgress.percent}٪)
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {batchProgress && (
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5 dir-ltr">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300 ease-out"
                style={{ width: `${batchProgress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Real-time Terminal Log Viewer Box (بخش لاگ) */}
      {logs.length > 0 && (
        <div className="my-4 rounded-xl bg-[#050608] border border-cyan-500/20 overflow-hidden font-mono text-xs">
          {/* Terminal Header Bar */}
          <div className="bg-slate-900/90 border-b border-white/10 px-3.5 py-2 flex items-center justify-between text-slate-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-cyan-300 text-[11px]">لاگ‌های زنده پردازش بسته‌ای (Batch Terminal)</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                {logs.length} رویداد
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-[10px] text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded transition cursor-pointer"
              >
                {showLogs ? "مخفی‌سازی" : "نمایش لاگ‌ها"}
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-0.5 rounded transition cursor-pointer"
              >
                پاک‌سازی
              </button>
            </div>
          </div>

          {/* Terminal Output Area */}
          {showLogs && (
            <div className="p-3.5 max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar text-[11px] leading-relaxed text-slate-300 dir-ltr text-left selection:bg-cyan-500/30">
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`font-mono ${
                    log.includes("❌")
                      ? "text-rose-400 font-bold"
                      : log.includes("✅") || log.includes("🎉")
                      ? "text-emerald-400"
                      : log.includes("📦")
                      ? "text-cyan-300"
                      : "text-slate-300"
                  }`}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Feedback Alerts */}
      {error && (
        <div className="my-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="my-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      {taxonomy ? (
        <div className="mt-6 space-y-6">
          {/* AI Insights Summary Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-blue-950/20 border border-cyan-500/20 text-xs text-slate-300 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                {taxonomy.title || "خلاصه تحلیل هوش مصنوعی"}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                unassignedArticles.length === 0
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}>
                {unassignedArticles.length === 0 ? "پوشش ۱۰۰٪ کامل مقالات" : `نیاز به تکمیل ${unassignedArticles.length} مقاله`}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{taxonomy.summary}</p>
            <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 font-mono">
              <span>کل مقالات فعال: {activeArticles.length}</span>
              <span>•</span>
              <span className={unassignedArticles.length === 0 ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                مقالات در دسته‌ها: {activeArticles.length - unassignedArticles.length} از {activeArticles.length} (
                {activeArticles.length > 0
                  ? Math.round(((activeArticles.length - unassignedArticles.length) / activeArticles.length) * 100)
                  : 0}
                ٪)
              </span>
              <span>•</span>
              <span>تاریخ بروزرسانی: {new Date(taxonomy.updatedAt).toLocaleTimeString("fa-IR")}</span>
            </div>
          </div>

          {/* Unassigned Articles Notice & Auto Fixer */}
          {unassignedArticles.length > 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4.5 h-4.5 text-amber-400 shrink-0" />
                <div>
                  <p className="font-bold text-amber-300">
                    تعداد {unassignedArticles.length} مقاله در نقشه فعلی هوش مصنوعی جا مانده‌اند!
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    جهت اطمینان از قرارگیری همه مقالات در سیستم، می‌توانید با یک کلیک آنها را به دسته جامع "مطالب و مقالات عمومی" منتقل کنید.
                  </p>
                </div>
              </div>
              <button
                onClick={handleFixUnassignedArticles}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 px-3.5 py-2 rounded-lg font-bold transition cursor-pointer text-xs shrink-0 flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                تکمیل پوشش ۱۰۰٪ (افزودن {unassignedArticles.length} مقاله)
              </button>
            </div>
          )}

          {/* Navigation Tabs & Search Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-white/10 pb-3">
            {/* View Tabs */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
              <button
                onClick={() => setActiveTab("extracted")}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === "extracted"
                    ? "bg-cyan-500 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                دسته‌های مقالات
                <span className="text-[10px] bg-black/30 px-1.5 py-0.2 rounded font-mono">
                  {taxonomy.existingCategoriesTree?.length || 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("proposed")}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === "proposed"
                    ? "bg-amber-500 text-black font-bold shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                پیشنهادهای جدید AI
                <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded font-mono">
                  {taxonomy.proposedNewCategoriesTree?.length || 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("json")}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === "json"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                کد JSON
              </button>
            </div>

            {/* Tree Controls & Search */}
            {activeTab !== "json" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجو بر اساس عنوان، زبان‌ها یا اسلاگ..."
                    className="w-full bg-white/5 border border-white/10 text-xs text-white pr-8 pl-3 py-1.5 rounded-xl focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handleExpandAll}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] px-2.5 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
                  title="باز کردن همه"
                >
                  باز کردن همه
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] px-2.5 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
                  title="بستن همه"
                >
                  بستن همه
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: Extracted Categories Tree */}
          {activeTab === "extracted" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Tree View (Column 7/12) */}
              <div className="lg:col-span-7 space-y-1 max-h-[580px] overflow-y-auto pr-1 custom-scrollbar">
                {taxonomy.existingCategoriesTree && taxonomy.existingCategoriesTree.length > 0 ? (
                  taxonomy.existingCategoriesTree.map((catNode, idx) =>
                    renderCategoryNode(catNode, 0, false, `ext-${idx}`)
                  )
                ) : (
                  <p className="text-xs text-slate-500 text-center py-8">
                    دسته‌بندی استخراج شده‌ای یافت نشد.
                  </p>
                )}
              </div>

              {/* Selected Category Details Sidebar & One-Click Copy Panel (Column 5/12) */}
              <div className="lg:col-span-5 bg-white/[0.02] border border-white/10 rounded-xl p-4 sticky top-20 space-y-4">
                {selectedCategory ? (
                  <div className="space-y-4">
                    <div className="pb-3 border-b border-white/10">
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                        جزئیات دسته انتخاب شده و کلیدهای کپی
                      </span>

                      {/* Header Title */}
                      <h3 className="text-base font-black text-white mt-1">
                        {selectedCategory.nameFa || selectedCategory.name || "بدون عنوان"}
                      </h3>

                      {selectedCategory.description && (
                        <p className="text-xs text-slate-300 mt-2 bg-black/40 p-2.5 rounded-lg border border-white/5">
                          {selectedCategory.description}
                        </p>
                      )}
                    </div>

                    {/* Quick Copy Fields Section */}
                    <div className="space-y-2 bg-black/30 p-3 rounded-xl border border-white/10">
                      <h4 className="text-xs font-bold text-cyan-300 mb-2 flex items-center justify-between">
                        <span>فیلدهای آماده کپی (دکمه‌های اختصاصی)</span>
                        <Globe className="w-3.5 h-3.5 text-cyan-400" />
                      </h4>

                      {/* 1. English Slug */}
                      <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-slate-400 block font-mono">اسلاگ انگلیسی (Slug):</span>
                          <span className="font-mono font-bold text-cyan-300 truncate dir-ltr text-left block">
                            {selectedCategory.slug || selectedCategory.id}
                          </span>
                        </div>
                        <button
                          onClick={(e) => copyText(selectedCategory.slug || selectedCategory.id, `side-slug`, e)}
                          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-2.5 py-1 rounded text-xs border border-cyan-500/30 flex items-center gap-1 shrink-0 transition cursor-pointer"
                        >
                          {copiedKey === `side-slug` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">کپی شد</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>کپی Slug</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 2. Persian Title */}
                      <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-slate-400 block">عنوان فارسی:</span>
                          <span className="font-bold text-white truncate block">
                            {selectedCategory.nameFa || selectedCategory.name || "-"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => copyText(selectedCategory.nameFa || selectedCategory.name || "", `side-fa`, e)}
                          className="bg-white/5 hover:bg-white/10 text-slate-200 px-2.5 py-1 rounded text-xs border border-white/10 flex items-center gap-1 shrink-0 transition cursor-pointer"
                        >
                          {copiedKey === `side-fa` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">کپی شد</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>کپی فارسی</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 3. English Title */}
                      <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-slate-400 block font-mono">English Name:</span>
                          <span className="font-sans font-bold text-slate-200 truncate dir-ltr text-left block">
                            {selectedCategory.nameEn || selectedCategory.enName || "-"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => copyText(selectedCategory.nameEn || selectedCategory.enName || "", `side-en`, e)}
                          className="bg-white/5 hover:bg-white/10 text-slate-200 px-2.5 py-1 rounded text-xs border border-white/10 flex items-center gap-1 shrink-0 transition cursor-pointer"
                        >
                          {copiedKey === `side-en` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">کپی شد</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>کپی EN</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 4. Arabic Title */}
                      <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-slate-400 block">الاسم بالعربية:</span>
                          <span className="font-bold text-slate-200 truncate block">
                            {selectedCategory.nameAr || "-"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => copyText(selectedCategory.nameAr || "", `side-ar`, e)}
                          className="bg-white/5 hover:bg-white/10 text-slate-200 px-2.5 py-1 rounded text-xs border border-white/10 flex items-center gap-1 shrink-0 transition cursor-pointer"
                        >
                          {copiedKey === `side-ar` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">کپی شد</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>کپی AR</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Assigned Articles List */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                        <span>مقالات تخصیص یافته به این دسته</span>
                        <span className="text-cyan-400 font-mono">
                          ({selectedCategory.articleIds?.length || 0} مقاله)
                        </span>
                      </h4>

                      {selectedCategory.articleIds && selectedCategory.articleIds.length > 0 ? (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {selectedCategory.articleIds.map((artId, idx) => {
                            const article = articleMap.get(artId);
                            if (!article) return null;
                            return (
                              <div
                                key={`side-art-${artId}-${idx}`}
                                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-xs text-slate-200 transition"
                              >
                                <p className="font-semibold text-cyan-300 line-clamp-1">
                                  {article.title}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                                  {article.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 py-3 text-center">
                          هیچ مقاله‌ای مستقیماً به این زیردسته اختصاص ندارد.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    <FolderTree className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    جهت مشاهده فیلدهای کپی، عناوین ۳ زبانه و اسلاگ، روی یکی از دسته‌ها کلیک کنید.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI Proposed Categories Tree */}
          {activeTab === "proposed" && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">دسته‌بندی‌های پیشنهادی هوش مصنوعی جهت توسعه محتوا</p>
                  <p className="text-amber-300/80 mt-0.5">
                    این موضوعات و زیردسته‌ها بر اساس خلأهای محتوایی و موضوعات تکمیل‌کننده مقالات موجود پیشنهاد شده‌اند و دارای اسلاگ و عناوین ۳ زبانه هستند.
                  </p>
                </div>
              </div>

              <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                {taxonomy.proposedNewCategoriesTree &&
                taxonomy.proposedNewCategoriesTree.length > 0 ? (
                  taxonomy.proposedNewCategoriesTree.map((propNode, idx) =>
                    renderCategoryNode(propNode, 0, true, `prop-${idx}`)
                  )
                ) : (
                  <p className="text-xs text-slate-500 text-center py-8">
                    دسته‌بندی پیشنهادی جدیدی استخراج نشد.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: JSON Export View */}
          {activeTab === "json" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">Taxonomy Tree JSON Schema</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    className="bg-white/5 hover:bg-white/10 text-cyan-400 text-xs px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        کپی شد!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        کپی JSON
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadJson}
                    className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    دانلود فایل
                  </button>
                </div>
              </div>

              <pre className="p-4 bg-black/60 border border-white/10 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto max-h-[450px] custom-scrollbar text-left ltr dir-ltr">
                {JSON.stringify(taxonomy, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        /* Empty State before running AI analysis */
        <div className="py-12 my-4 border-2 border-dashed border-white/10 rounded-2xl text-center space-y-4 bg-white/[0.01]">
          <div className="w-14 h-14 bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
            <FolderTree className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">
              هنوز درخت دسته‌بندی هوشمند تولید نشده است
            </h3>
            <p className="text-xs text-slate-400">
              روی دکمه زیر کلیک کنید تا هوش مصنوعی تمامی {articles.length} مقاله موجود را آنالیز کرده و درخت دسته‌بندی ۳ زبانه با اسلاگ انگلیسی تولید کند.
            </p>
          </div>
          <button
            onClick={handleAnalyzeTaxonomy}
            disabled={loading}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-cyan-200" />
            شروع تحلیل و استخراج درخت دسته‌بندی با AI
          </button>
        </div>
      )}
    </div>
  );
}
