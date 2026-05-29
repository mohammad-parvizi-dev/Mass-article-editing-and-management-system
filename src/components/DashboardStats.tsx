import { Article } from "../types";
import { BookOpen, FileCheck, CheckCircle, Clock, Eye, Trash2 } from "lucide-react";

interface DashboardStatsProps {
  articles: Article[];
}

export default function DashboardStats({ articles }: DashboardStatsProps) {
  const total = articles.length;
  const published = articles.filter(a => a.is_published === "1").length;
  const drafts = articles.filter(a => a.is_published === "0").length;
  const deleted = articles.filter(a => a.is_published === "2").length;
  const edited = articles.filter(a => a.isEdited).length;
  
  const totalViews = articles.reduce((sum, a) => {
    const num = parseInt(a.view_count) || 0;
    return sum + num;
  }, 0);

  const avgReadingTime = total > 0 
    ? Math.round(articles.reduce((sum, a) => sum + (parseInt(a.reading_time) || 0), 0) / total) 
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6 dir-rtl text-right">
      {/* Total Articles */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">کل مقالات</span>
          <BookOpen className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-white">{total}</span>
          <span className="text-[10px] text-gray-400 block mt-1">مقالات ذخیره شده</span>
        </div>
      </div>

      {/* Published */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">منتشر شده</span>
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-emerald-400">{published}</span>
          <span className="text-[10px] text-gray-400 block mt-1">منتشر شده روی سایت</span>
        </div>
      </div>

      {/* Drafts */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">پیش‌نویس</span>
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-amber-400">{drafts}</span>
          <span className="text-[10px] text-gray-400 block mt-1">در انتظار ویرایش نهایی</span>
        </div>
      </div>

      {/* Deleted */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-rose-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">بایگانی حذف‌شده</span>
          <Trash2 className="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-rose-400">{deleted}</span>
          <span className="text-[10px] text-gray-400 block mt-1">منتظر خروجی جداگانه</span>
        </div>
      </div>

      {/* Edited status */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">تولید هوشمند / ویرایش</span>
          <FileCheck className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-indigo-400">{edited}</span>
          <span className="text-[10px] text-gray-400 block mt-1">تغییریافته در سشن جاری</span>
        </div>
      </div>

      {/* Total Views */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">کل بازدیدها</span>
          <Eye className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-white">
            {totalViews.toLocaleString("fa-IR")}
          </span>
          <span className="text-[10px] text-gray-400 block mt-1">مجموع بازدیدهای اینترنتی</span>
        </div>
      </div>

      {/* Avg Reading Time */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 hover:bg-white/[0.05] transition duration-300">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[10px] uppercase tracking-widest font-bold">زمان خواندن</span>
          <Clock className="w-4 h-4 text-cyan-300" />
        </div>
        <div>
          <span className="text-2xl font-black font-mono text-white">
            ~{avgReadingTime} <span className="text-xs font-sans font-normal text-gray-400">دقیقه</span>
          </span>
          <span className="text-[10px] text-gray-400 block mt-1">میانگین زمان مطالعه مقالات</span>
        </div>
      </div>
    </div>
  );
}
