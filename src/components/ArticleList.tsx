import { useState } from "react";
import { Search, Plus, Trash2, Eye, Filter, CheckCircle, HelpCircle, FileEdit, Globe } from "lucide-react";
import { Article } from "../types";

interface ArticleListProps {
  articles: Article[];
  selectedId: string | null;
  onSelect: (article: Article) => void;
  onAdd: () => void;
  onDelete: (articleId: string) => void;
}

export default function ArticleList({
  articles,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: ArticleListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pubFilter, setPubFilter] = useState<"all" | "published" | "draft" | "deleted">("all");
  const [editFilter, setEditFilter] = useState<"all" | "edited" | "original">("all");

  const filteredArticles = articles.filter((article) => {
    // Search query matching Persian, English, or Arabic titles, description, or slug
    const query = searchQuery.trim().toLowerCase();
    const matchSearch =
      query === "" ||
      article.title?.toLowerCase().includes(query) ||
      article.en_title?.toLowerCase().includes(query) ||
      article.ar_title?.toLowerCase().includes(query) ||
      article.slug?.toLowerCase().includes(query) ||
      article.description?.toLowerCase().includes(query);

    // Publication filter
    const matchPub =
      pubFilter === "all" ||
      (pubFilter === "published" && article.is_published === "1") ||
      (pubFilter === "draft" && article.is_published === "0") ||
      (pubFilter === "deleted" && article.is_published === "2");

    // Editing filter
    const matchEdit =
      editFilter === "all" ||
      (editFilter === "edited" && !!article.isEdited) ||
      (editFilter === "original" && !article.isEdited);

    return matchSearch && matchPub && matchEdit;
  });

  return (
    <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[750px] dir-rtl text-right">
      {/* List Header */}
      <div className="p-4 bg-black/40 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-white text-sm">لیست مقالات موجود</h3>
          <span className="text-[11px] text-cyan-400 font-mono mt-0.5 block">
            {filteredArticles.length} / {articles.length} ردیف مقاله یافت شد
          </span>
        </div>

        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-md"
        >
          <Plus className="w-3.5 h-3.5" />
          مقاله نو
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-white/5 bg-black/20 space-y-3 shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="جستجو در عنوان، لینک یا توضیحات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-black/40 text-white placeholder-slate-500 border border-white/10 rounded-lg text-sm focus:border-cyan-500 focus:outline-hidden"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3.5" />
        </div>

        {/* Filters */}
        <div className="flex gap-2 text-xs">
          {/* Publication Filter */}
          <div className="flex-1 min-w-[70px]">
            <select
              value={pubFilter}
              onChange={(e: any) => setPubFilter(e.target.value)}
              className="w-full p-2 border border-white/10 rounded-lg bg-black/40 text-slate-300 focus:outline-hidden focus:border-cyan-500 text-center font-bold"
            >
              <option value="all" className="bg-slate-900 text-slate-300">کلیه وضعیت‌ها</option>
              <option value="published" className="bg-slate-900 text-slate-300">منتشر شده</option>
              <option value="draft" className="bg-slate-900 text-slate-300">پیش‌نویس</option>
              <option value="deleted" className="bg-slate-900 text-rose-300 font-bold">حذف شده</option>
            </select>
          </div>

          {/* Edit status filter */}
          <div className="flex-1 min-w-[70px]">
            <select
              value={editFilter}
              onChange={(e: any) => setEditFilter(e.target.value)}
              className="w-full p-2 border border-white/10 rounded-lg bg-black/40 text-slate-300 focus:outline-hidden focus:border-cyan-500 text-center font-bold"
            >
              <option value="all" className="bg-slate-900 text-slate-300">نوع ویرایش</option>
              <option value="edited" className="bg-slate-900 text-slate-300">ویرایش شده</option>
              <option value="original" className="bg-slate-900 text-slate-300">اصلی (دست‌نخورده)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items Scroll Tray */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2 space-y-1">
        {filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-full">
            <HelpCircle className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-bold text-slate-400">هیچ مقاله‌ای یافت نشد</p>
            <p className="text-xs text-slate-500 mt-1">
              جستجو یا فیلتر خود را تغییر دهید یا مقاله‌ای اضافه کنید
            </p>
          </div>
        ) : (
          filteredArticles.map((article) => {
            const isSelected = article.id === selectedId;
            const isPublished = article.is_published === "1";
            const isEdited = !!article.isEdited;

            return (
              <div
                key={article.id}
                onClick={() => onSelect(article)}
                className={`group p-3 rounded-xl flex flex-col justify-between border transition duration-150 cursor-pointer text-right relative ${
                  isSelected
                    ? "border-cyan-500 bg-cyan-500/10 shadow-[0_2px_8px_rgba(6,182,212,0.15)]"
                    : "border-white/5 hover:border-white/10 hover:bg-white/[0.01]"
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-extrabold text-slate-200 text-sm group-hover:text-cyan-400 transition truncate leading-relaxed">
                      {article.title || (
                        <span className="text-slate-500 font-normal italic">عنوان وارد نشده</span>
                      )}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate text-left dir-ltr">
                      /{article.slug || "no-slug"}
                    </span>
                  </div>

                  {/* ID box */}
                  <span className="font-mono text-[9px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded leading-none shrink-0 self-start border border-white/5">
                    ID: {article.id}
                  </span>
                </div>

                {/* Second Line: description preview */}
                <p className="text-xs text-slate-400 line-clamp-1 mt-1 font-medium">
                  {article.description || "بدون توضیح..."}
                </p>

                {/* Stats & statuses bottom row */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-dotted border-white/5">
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Published status badge */}
                    {article.is_published === "1" ? (
                      <span className="bg-emerald-500/10 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold border border-emerald-500/20">
                        <CheckCircle className="w-2.5 h-2.5" />
                        منتشر شده
                      </span>
                    ) : article.is_published === "2" ? (
                      <span className="bg-rose-500/10 text-red-400 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold border border-rose-500/20">
                        حذف شده
                      </span>
                    ) : (
                      <span className="bg-amber-500/10 text-amber-300 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold border border-amber-500/20">
                        پیش‌نویس
                      </span>
                    )}

                    {/* Edit badge status */}
                    {isEdited && (
                      <span className="bg-cyan-500/10 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold border border-cyan-500/20 animate-pulse">
                        <FileEdit className="w-2.5 h-2.5" />
                        ویرایش شده
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View Tracker indicator */}
                    <span className="text-[10px] font-mono font-bold text-slate-400 flex items-center gap-0.5">
                      <Eye className="w-3 h-3 text-cyan-400" />
                      {article.view_count || 0}
                    </span>

                    {/* Language coverage check */}
                    <span className="flex gap-0.5 text-[8px] font-bold text-slate-500">
                      <span className={article.title ? "text-slate-300" : ""}>FA</span>
                      <span>•</span>
                      <span className={article.en_title ? "text-slate-300" : ""}>EN</span>
                      <span>•</span>
                      <span className={article.ar_title ? "text-slate-300" : ""}>AR</span>
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(article.id);
                      }}
                      className="p-1 rounded text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
                      title="حذف مقاله (انتقال به بایگانی حذف‌شده)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
