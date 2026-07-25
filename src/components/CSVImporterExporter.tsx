import React, { useRef, useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle, FileText, Settings, Sparkles } from "lucide-react";
import { Article } from "../types";
import { parseCSV, serializeToCSV } from "../utils/csv";

interface CSVImporterExporterProps {
  articles: Article[];
  onImport: (newArticles: Article[], append: boolean) => void;
}

export default function CSVImporterExporter({ articles, onImport }: CSVImporterExporterProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expected CSV Schema Headers in correct order
  const EXPECTED_HEADERS = [
    "id", "category_id", "is_published", "base_image", "title", "slug", "description", "long_summary", "body",
    "view_count", "reading_time", "en_title", "en_description", "en_body", "ar_title",
    "ar_description", "ar_body", "deleted_at", "created_at", "updated_at", "tags"
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);
    setSuccess(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("فایل انتخاب شده باید با فرمت CSV باشد.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setError("محتوای فایل خالی است.");
          return;
        }

        const parsedRows = parseCSV(text);
        if (parsedRows.length < 2) {
          setError("فایل فاقد ستون‌های کافی یا اطلاعات مقاله است.");
          return;
        }

        const headers = parsedRows[0].map(h => h.trim().toLowerCase());
        
        // Let's verify mapping headers (excluding optional tags and long_summary fields)
        const missingHeaders = EXPECTED_HEADERS.filter(eh => eh !== "tags" && eh !== "long_summary" && !headers.includes(eh));
        if (missingHeaders.length > 0) {
          setError(`ستون‌های اصلی پیدا نشدند: ${missingHeaders.join(", ")}`);
          return;
        }

        // Loop over parsed content starting from index 1 (under headers)
        const importedList: Article[] = [];
        for (let i = 1; i < parsedRows.length; i++) {
          const rowValues = parsedRows[i];
          if (rowValues.length === 0 || (rowValues.length === 1 && rowValues[0] === "")) continue;

          const articleObj: any = {};
          EXPECTED_HEADERS.forEach((header) => {
            const headerColIndex = headers.indexOf(header);
            articleObj[header] = headerColIndex !== -1 && rowValues[headerColIndex] !== undefined
              ? rowValues[headerColIndex]
              : "";
          });

          // Core standard properties
          if (!articleObj.id) {
            articleObj.id = String(Date.now() + i);
          }
          // Preserve importing status ("0", "1", "2") from CSV if valid; otherwise default to "0" (draft)
          if (articleObj.is_published !== "1" && articleObj.is_published !== "2" && articleObj.is_published !== "0") {
            articleObj.is_published = "0";
          }
          articleObj.isEdited = false; // Freshly imported, reset editing status badge
          importedList.push(articleObj as Article);
        }

        if (importedList.length === 0) {
          setError("هیچ داده معتبری از مقالات در فایل یافت نشد.");
          return;
        }

        onImport(importedList, importMode === "merge");
        setSuccess(`مجموعاً ${importedList.length} مقاله با موفقیت بارگذاری شد (${importMode === "merge" ? "ادغام با داده‌های پیشین" : "جایگزینی کامل"}).`);
        
        // Reset file input element
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (err: any) {
        setError(`خطا در پردازش فایل: ${err.message || err}`);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleExport = () => {
    try {
      // Export ALL articles so that any status changes (including "deleted" - "2") and edited text are fully saved to the CSV file
      const activeArticles = articles;
      const csvContent = serializeToCSV(EXPECTED_HEADERS, activeArticles);
      // Create element and download
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" }); // UTF-8 BOM
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `articles-export-${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(`خطا در صادرات خروجی: ${err.message || err}`);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 shadow-2xl mb-8 dir-rtl text-right">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            ورود و خروج مقالات (فرمت CSV)
          </h2>
          <p className="text-xs text-slate-400 mt-1 pb-1">
            یک فایل متنی با فرمت کاما دلخواه (CSV) آپلود یا دانلود کنید. این برنامه از زبان‌های فارسی، انگلیسی و عربی پشتیبانی می‌کند.
          </p>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200 shadow-[0_4px_12px_rgba(8,145,178,0.3)] hover:shadow-[0_4px_20px_rgba(8,145,178,0.5)] cursor-pointer"
        >
          <Download className="w-4 h-4 text-cyan-100" />
          دانلود خروجی CSV نهایی
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Zone */}
        <div className="lg:col-span-2">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition duration-300 flex flex-col items-center justify-center min-h-[180px] ${
              dragActive
                ? "border-cyan-500 bg-cyan-500/10"
                : "border-white/10 hover:border-cyan-500/40 bg-white/[0.01] hover:bg-white/[0.03]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="bg-white/5 border border-white/10 p-3 rounded-full shadow-sm mb-3">
              <Upload className="w-6 h-6 text-cyan-400" />
            </div>
            <p className="text-sm font-semibold text-white">
              برای بارگذاری فایل CSV، آن را به اینجا بکشید یا کلیک کنید
            </p>
            <p className="text-xs text-slate-400 mt-1">
              تنها فایل‌های <span className="font-mono bg-white/10 px-1 py-0.5 rounded text-cyan-300">.csv</span> با انکودینگ UTF-8 پذیرفته می‌شوند.
            </p>
          </div>
        </div>

        {/* Options & Status */}
        <div className="flex flex-col justify-between bg-black/40 border border-white/5 rounded-xl p-5">
          <div>
            <span className="text-xs font-bold text-gray-400 flex items-center gap-2 mb-3">
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
              تنظیمات وارد کردن (Import)
            </span>
            <div className="space-y-3.5">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="w-4 h-4 text-cyan-500 border-white/20 focus:ring-cyan-500 bg-black/60"
                />
                <span>ادغام با مقالات فعلی بر اساس شناسه (Merge)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="w-4 h-4 text-rose-500 border-white/20 focus:ring-rose-500 bg-black/60"
                />
                <span className="text-rose-400 font-semibold">جایگزینی کامل دیتابیس فعلی (Replace)</span>
              </label>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 text-xs">
            <div className="text-gray-500 font-medium font-sans">ساختار الزامی ستون‌ها:</div>
            <div className="font-mono text-[10px] text-cyan-400/80 mt-1.5 overflow-x-auto whitespace-nowrap bg-black/60 p-2 border border-white/10 rounded">
              {EXPECTED_HEADERS.join(", ")}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mt-4 flex items-start gap-2.5 bg-rose-950/20 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-start gap-2.5 bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
          <div>{success}</div>
        </div>
      )}
    </div>
  );
}
