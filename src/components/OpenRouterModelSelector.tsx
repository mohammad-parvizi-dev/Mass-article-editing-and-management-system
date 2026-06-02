import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Check, Sparkles, Cpu } from "lucide-react";

interface ModelItem {
  id: string;
  name: string;
}

interface OpenRouterModelSelectorProps {
  models: ModelItem[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  isFallback?: boolean;
  errorDetails?: string | null;
}

export default function OpenRouterModelSelector({
  models,
  selectedModel,
  onModelChange,
  isLoading,
  isFallback,
  errorDetails
}: OpenRouterModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Find clear name of current active model
  const currentModelObj = models.find((m) => m.id === selectedModel);
  const currentDisplayName = currentModelObj ? (currentModelObj.name || currentModelObj.id) : selectedModel;

  // Filter models list based on query
  const filteredModels = models.filter((model) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      model.id.toLowerCase().includes(term) ||
      (model.name && model.name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="relative inline-block text-right" ref={dropdownRef} dir="rtl">
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 bg-slate-950/80 hover:bg-slate-900 border border-cyan-500/30 hover:border-cyan-500/50 text-white rounded-lg px-3 py-1.5 text-xs transition cursor-pointer font-semibold min-w-[140px] max-w-[280px]"
      >
        <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate text-right flex-1 select-none text-[11px]">
          {isLoading ? "در حال دریافت..." : currentDisplayName}
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[430px]">
          {/* Header & Search box */}
          <div className="p-2 border-b border-white/5 bg-white/[0.02] space-y-1.5">
            <div className="flex items-center justify-between px-1.5 pt-0.5">
              <span className="text-[10px] text-cyan-400 font-extrabold flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" />
                انتخاب مدل هوش مصنوعی
              </span>
              <span className="text-[9px] text-slate-500 font-mono font-bold">
                {models.length} مدل لود شده
              </span>
            </div>

            {isFallback && (
              <div className="bg-amber-950/45 border border-amber-500/25 text-amber-200 p-2 rounded-lg text-[10px] leading-relaxed select-text" dir="rtl">
                ⚠️ <span className="text-amber-400 font-black">بارگذاری زنده ناموفق بود!</span> سرور شما نتوانست لیست زنده مدل‌ها را از OpenRouter دریافت کند (لیست زیر آفلاین است).
                {errorDetails && (
                  <div className="mt-1 font-mono text-[9px] text-amber-400/80 bg-black/40 p-1 rounded overflow-x-auto select-all max-h-16 text-left" dir="ltr">
                    {errorDetails}
                  </div>
                )}
              </div>
            )}
            
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="جستجوی مدل (مثلاً deepseek, gpt)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 border border-white/10 rounded-lg pr-8 pl-3 py-1.5 focus:outline-hidden focus:border-cyan-400 font-medium"
              />
            </div>
          </div>

          {/* Model listing body with custom scrollbar */}
          <div className="overflow-y-auto flex-1 max-h-64 py-1 divide-y divide-white/[0.02]">
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const isSelected = model.id === selectedModel;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onModelChange(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-right px-3 py-2 flex flex-col gap-0.5 transition hover:bg-cyan-500/10 cursor-pointer ${
                      isSelected ? "bg-cyan-500/5 text-cyan-400" : "text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold truncate">
                        {model.name || model.id}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 truncate self-start" dir="ltr">
                      {model.id}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500 font-medium">
                هیچ مدلی متناسب با جستجوی شما یافت نشد.
              </div>
            )}
          </div>

          {/* Direct typing fallback */}
          <div className="p-2 bg-slate-900/40 border-t border-white/5 flex gap-1.5 items-center">
            <input
              type="text"
              placeholder="شناسه مدل دلخواه..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-slate-950 text-[10px] font-mono text-white placeholder-slate-600 border border-white/10 rounded-md px-2 py-1 focus:outline-hidden focus:border-cyan-500 text-left"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => {
                if (searchQuery.trim()) {
                  onModelChange(searchQuery.trim());
                  setIsOpen(false);
                  setSearchQuery("");
                }
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap"
            >
              ثبت مدل جدید
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
