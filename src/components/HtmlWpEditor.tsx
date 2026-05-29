import React, { useState, useRef, useEffect } from "react";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link2, Image, Table, Heading1, Heading2, Heading3,
  Code, Quote, Grid, Eye, FileCode, Check, Copy, Palette, Sparkles, HelpCircle
} from "lucide-react";

interface HtmlWpEditorProps {
  value: string;
  onChange: (val: string) => void;
  lang: "fa" | "en";
  placeholder?: string;
}

export default function HtmlWpEditor({ value, onChange, lang, placeholder = "" }: HtmlWpEditorProps) {
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Refs for editor surface synchronization
  const visualRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state to visual editor div only on initialization or if values drift
  useEffect(() => {
    if (editorMode === "visual" && visualRef.current) {
      if (visualRef.current.innerHTML !== value) {
        visualRef.current.innerHTML = value || "";
      }
    }
  }, [value, editorMode]);

  const handleVisualInput = () => {
    if (visualRef.current) {
      const html = visualRef.current.innerHTML;
      // Filter empty tags or placeholder text if needed
      onChange(html === "<br>" ? "" : html);
    }
  };

  const handleHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Switch modes and sync content
  const toggleMode = (mode: "visual" | "html") => {
    setEditorMode(mode);
  };

  // WYSIWYG commands (Visual Mode)
  const execCommand = (command: string, value: string | undefined = undefined) => {
    if (editorMode !== "visual") {
      // In HTML mode, wrap the selection or append the tags
      wrapTextInTextarea(command, value);
      return;
    }
    document.execCommand(command, false, value);
    if (visualRef.current) {
      handleVisualInput();
    }
  };

  // Wrap selections with HTML inside the monospace Textarea (Text Mode)
  const wrapTextInTextarea = (command: string, value: string | undefined = undefined) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let before = "";
    let after = "";

    switch (command) {
      case "bold":
        before = "<strong>";
        after = "</strong>";
        break;
      case "italic":
        before = "<em>";
        after = "</em>";
        break;
      case "underline":
        before = "<u>";
        after = "</u>";
        break;
      case "strikethrough":
        before = "<del>";
        after = "</del>";
        break;
      case "insertUnorderedList":
        before = "\n<ul>\n  <li>";
        after = "</li>\n</ul>\n";
        break;
      case "insertOrderedList":
        before = "\n<ol>\n  <li>";
        after = "</li>\n</ol>\n";
        break;
      case "justifyleft":
        before = '<div style="text-align: left;">';
        after = "</div>";
        break;
      case "justifycenter":
        before = '<div style="text-align: center;">';
        after = "</div>";
        break;
      case "justifyright":
        before = '<div style="text-align: right;">';
        after = "</div>";
        break;
      case "justifyfull":
        before = '<div style="text-align: justify;">';
        after = "</div>";
        break;
      case "formatBlock":
        if (value) {
          before = `<${value}>`;
          after = `</${value}>`;
        }
        break;
      case "createlink":
        const urlStr = value || prompt(lang === "fa" ? "آدرس پیوند را وارد نمایید:" : "Enter full Link URL:", "https://");
        if (urlStr) {
          before = `<a href="${urlStr}" target="_blank" rel="noopener noreferrer" style="color: #22d3ee; text-decoration: underline;">`;
          after = "</a>";
        } else {
          return;
        }
        break;
      default:
        break;
    }

    const newContent = text.substring(0, start) + before + (selected || (lang === "fa" ? "متن پیوند" : "link-label")) + after + text.substring(end);
    onChange(newContent);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + (selected || (lang === "fa" ? "متن پیوند" : "link-label")).length);
    }, 50);
  };

  // Extended Advanced WordPress Helpers
  const insertCustomHtml = (htmlMarkup: string) => {
    if (editorMode === "visual") {
      visualRef.current?.focus();
      document.execCommand("insertHTML", false, htmlMarkup);
      handleVisualInput();
    } else {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newContent = text.substring(0, start) + htmlMarkup + text.substring(end);
      onChange(newContent);
      setTimeout(() => textarea.focus(), 50);
    }
  };

  // Prompts and insertions
  const insertLinkDialog = () => {
    const defaultUrl = "https://";
    const url = prompt(lang === "fa" ? "آدرس اینترنتی یا پیوند:" : "URL Address:", defaultUrl);
    if (!url || url === defaultUrl) return;

    if (editorMode === "visual") {
      // Create element directly for Visual editable frame
      document.execCommand("createlink", false, url);
      // Let's styled the link if possible
      const selection = window.getSelection();
      if (selection && selection.anchorNode) {
        const parent = selection.anchorNode.parentElement;
        if (parent && parent.tagName === "A") {
          parent.setAttribute("style", "color: #06b6d4; text-decoration: underline; font-weight: bold;");
          parent.setAttribute("target", "_blank");
        }
      }
      handleVisualInput();
    } else {
      wrapTextInTextarea("createlink", url);
    }
  };

  const insertImageDialog = () => {
    const url = prompt(lang === "fa" ? "آدرس مستقیم تصویر جهت درج قرارگیری در متن:" : "Direct link of the image:", "https://");
    if (!url) return;
    const alt = prompt(lang === "fa" ? "توضیح متنی جایگزین تصویر (Alt):" : "Alternative Text (Alt):", "image description");
    const style = "display: block; max-width: 100%; height: auto; border-radius: 12px; margin: 24px auto; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);";
    const imgHtml = `<img src="${url}" alt="${alt || ""}" style="${style}" />`;

    insertCustomHtml(imgHtml);
  };

  const insertTableDialog = () => {
    const cols = parseInt(prompt(lang === "fa" ? "تعداد ستون‌های جدول را وارد کنید:" : "Enter number of columns:", "3") || "3", 10);
    const rows = parseInt(prompt(lang === "fa" ? "تعداد ردیف‌های جدول را وارد کنید:" : "Enter number of rows:", "4") || "4", 10);
    if (isNaN(cols) || isNaN(rows)) return;

    let tableHtml = `<div style="overflow-x: auto; margin: 20px 0;"><table style="width: 100%; border-collapse: collapse; border: 1px solid rgba(255,255,255,0.15); text-align: ${lang === "fa" ? "right" : "left"}; font-size: 13px;">`;
    
    // Header
    tableHtml += `<thead><tr style="background-color: rgba(255,255,255,0.06);">`;
    for (let c = 1; c <= cols; c++) {
      tableHtml += `<th style="border: 1px solid rgba(255,255,255,0.15); padding: 12px; font-weight: bold; color: #22d3ee;">${lang === "fa" ? `ستون ${c}` : `Header ${c}`}</th>`;
    }
    tableHtml += "</tr></thead><tbody>";

    // Rows
    for (let r = 1; r <= rows; r++) {
      tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.06); hover:background-color: rgba(255,255,255,0.02);">`;
      for (let c = 1; c <= cols; c++) {
        tableHtml += `<td style="border: 1px solid rgba(255,255,255,0.15); padding: 10px; color: #e2e8f0;">${lang === "fa" ? `داده ${r}-${c}` : `Data ${r}-${c}`}</td>`;
      }
      tableHtml += "</tr>";
    }
    tableHtml += "</tbody></table></div>";

    insertCustomHtml(tableHtml);
  };

  // Preset Visual Blocks (WordPress Cards style)
  const insertStyledCallout = (type: "cyan" | "warning" | "success") => {
    let classes = "";
    let title = "";
    let background = "";
    let border = "";
    let glow = "";

    if (type === "cyan") {
      title = lang === "fa" ? "💡 نکته کلیدی مقاله" : "💡 Golden Insight";
      background = "rgba(6, 182, 212, 0.05)";
      border = "1px solid rgba(6, 182, 212, 0.3)";
      glow = "border-left: 5px solid #06b6d4;";
    } else if (type === "warning") {
      title = lang === "fa" ? "⚠️ هشدار یا نکته بسیار مهم" : "⚠️ Attention Warning";
      background = "rgba(245, 158, 11, 0.05)";
      border = "1px solid rgba(245, 158, 11, 0.3)";
      glow = "border-left: 5px solid #f59e0b;";
    } else {
      title = lang === "fa" ? "✅ نتیجه‌گیری و راهکار نهایی" : "✅ Final Takeaway";
      background = "rgba(16, 185, 129, 0.05)";
      border = "1px solid rgba(16, 185, 129, 0.3)";
      glow = "border-left: 5px solid #10b981;";
    }

    const markup = `
<div style="background-color: ${background}; border: ${border}; ${glow} border-radius: 12px; padding: 20px; margin: 24px 0; color: #f1f5f9; line-height: 1.8;">
  <strong style="color: #ffffff; font-size: 14px; display: block; margin-bottom: 6px;">${title}</strong>
  <p style="margin: 0; font-size: 12.5px; opacity: 0.9;">${lang === "fa" ? "متن و توضیحات سفارشی خودتان را در اینجا قرار دهید..." : "Type or replace this custom notes block information..."}</p>
</div>
`;
    insertCustomHtml(markup);
  };

  // Predefined responsive visual structural column blocks
  const insertGridContainer = () => {
    const markup = `
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 24px 0;">
  <div style="background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
    <h3 style="color: #22d3ee; margin-top: 0; font-size: 14px;">${lang === "fa" ? "بخش یا آیتم اول" : "Column block 1"}</h3>
    <p style="font-size: 12px; margin: 0; line-height: 1.6; color: #cbd5e1;">${lang === "fa" ? "توضیحات مربوط به ستون اول را در اینجا بنویسید." : "Replace with paragraph details."}</p>
  </div>
  <div style="background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
    <h3 style="color: #22d3ee; margin-top: 0; font-size: 14px;">${lang === "fa" ? "بخش یا آیتم دوم" : "Column block 2"}</h3>
    <p style="font-size: 12px; margin: 0; line-height: 1.6; color: #cbd5e1;">${lang === "fa" ? "توضیحات مربوط به ستون دوم را در اینجا بنویسید." : "Replace with paragraph details."}</p>
  </div>
</div>
`;
    insertCustomHtml(markup);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col border border-white/20 rounded-xl bg-black/40 overflow-hidden ${isFullscreen ? "fixed inset-4 z-50 bg-[#07070c]" : "w-full"} transition-all duration-300`}>
      {/* Editor top tabs: Visual vs Text/HTML */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-white/10 bg-white/[0.02] p-2.5 gap-2">
        <div className="flex gap-1.5 self-start">
          <button
            type="button"
            onClick={() => toggleMode("visual")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer select-none ${
              editorMode === "visual"
                ? "bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 font-extrabold"
                : "border border-transparent text-gray-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {lang === "fa" ? "قالب دیداری (Visual)" : "Visual Mode"}
          </button>
          <button
            type="button"
            onClick={() => toggleMode("html")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer select-none ${
              editorMode === "html"
                ? "bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 font-extrabold"
                : "border border-transparent text-gray-400 hover:text-white"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            {lang === "fa" ? "کدنویسی منبع (HTML / Text)" : "Text Mode (HTML)"}
          </button>
        </div>

        {/* Global Toolbar metadata controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="text-[10px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-gray-300 font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            title="کپی کل سورس کد به حافظه موقت"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? (lang === "fa" ? "کپی شد!" : "Copied!") : (lang === "fa" ? "کپی کل کد HTML" : "Copy All Source")}
          </button>
          
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-[10px] bg-slate-900 border border-white/10 hover:bg-slate-800 text-cyan-300 font-bold px-3 py-1.5 rounded-md transition cursor-pointer select-none"
          >
            {isFullscreen ? (lang === "fa" ? "خروج از تمام‌صفحه" : "Exit Fullscreen") : (lang === "fa" ? "تمام‌صفحه" : "Fullscreen")}
          </button>
        </div>
      </div>

      {/* Advanced Rich WordPress Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-[#0c0c14]/80 border-b border-white/10 justify-start" dir="ltr">
        {/* Undo / Redo or format headers */}
        <div className="inline-flex gap-0.5 rounded border border-white/5 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "h2")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Heading 2 (<h2>)"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "h3")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Heading 3 (<h3>)"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "h4")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Heading 4 (<h4>)"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "p")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition font-mono text-xs cursor-pointer px-1"
            title="Paragraph"
          >
            P
          </button>
        </div>

        {/* Basic Styles */}
        <div className="inline-flex gap-0.5 rounded border border-white/5 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => execCommand("bold")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5 font-black" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("italic")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("underline")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("strikethrough")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition line-through text-xs font-bold cursor-pointer px-1"
            title="Strikethrough"
          >
            S
          </button>
        </div>

        {/* Alignments */}
        <div className="inline-flex gap-0.5 rounded border border-white/5 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => execCommand("justifyleft")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifycenter")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifyright")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifyfull")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Justify"
          >
            <AlignJustify className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lists & structural code */}
        <div className="inline-flex gap-0.5 rounded border border-white/5 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => execCommand("insertUnorderedList")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("insertOrderedList")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "blockquote")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Quote Box"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "pre")}
            className="p-1 hover:bg-cyan-500/20 text-gray-300 hover:text-white rounded transition cursor-pointer"
            title="Code Block"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rich WordPress inserts like link, image, grids and gorgeous structures */}
        <span className="text-[10px] text-gray-500 px-1 font-bold select-none border-l border-white/10 ml-1">INSERTS:</span>

        <button
          type="button"
          onClick={insertLinkDialog}
          className="p-1 bg-cyan-950/20 hover:bg-cyan-950/50 text-cyan-400 hover:text-cyan-300 rounded border border-cyan-500/25 transition cursor-pointer flex items-center gap-0.5 px-2 text-[10px] font-bold"
          title="Insert URL Link"
        >
          <Link2 className="w-3 h-3" />
          LINK
        </button>

        <button
          type="button"
          onClick={insertImageDialog}
          className="p-1 bg-cyan-950/20 hover:bg-cyan-950/50 text-cyan-400 hover:text-cyan-300 rounded border border-cyan-500/25 transition cursor-pointer flex items-center gap-0.5 px-2 text-[10px] font-bold"
          title="Insert In-content Image URL"
        >
          <Image className="w-3 h-3" />
          IMAGE
        </button>

        <button
          type="button"
          onClick={insertTableDialog}
          className="p-1 bg-emerald-950/20 hover:bg-emerald-950/50 text-emerald-400 hover:text-emerald-300 rounded border border-emerald-500/25 transition cursor-pointer flex items-center gap-0.5 px-1.5 text-[10px] font-bold"
          title="Build an HTML Table"
        >
          <Table className="w-3 h-3" />
          TABLE
        </button>

        {/* Premade callouts / custom boxes */}
        <div className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => insertStyledCallout("cyan")}
            className="bg-white/5 hover:bg-cyan-500/10 text-cyan-300 text-[10px] px-2 py-1 rounded border border-white/5 hover:border-cyan-500/30 font-bold transition cursor-pointer"
            title="Insert elegant Tip/Insight visual container block"
          >
            + Insight Card
          </button>
          <button
            type="button"
            onClick={() => insertStyledCallout("warning")}
            className="bg-white/5 hover:bg-amber-500/10 text-amber-300 text-[10px] px-2 py-1 rounded border border-white/5 hover:border-amber-500/30 font-bold transition cursor-pointer"
            title="Insert elegant Important Warning visual container block"
          >
            + Warning Card
          </button>
          <button
            type="button"
            onClick={insertGridContainer}
            className="bg-white/5 hover:bg-indigo-500/10 text-indigo-300 text-[10px] px-2 py-1 rounded border border-white/5 hover:border-indigo-500/30 font-bold transition cursor-pointer flex items-center gap-0.5"
            title="Insert a 2-Column Responsive Split Content Grid Layout"
          >
            <Grid className="w-2.5 h-2.5" />
            + 2-Col Grid
          </button>
        </div>
      </div>

      {/* Editor Main Surface container */}
      <div className="relative flex-1 bg-black/60 min-h-[460px] max-h-[1200px]" style={{ height: isFullscreen ? "calc(100vh - 120px)" : "480px" }}>
        
        {/* Tab 1: Visual Mode content editable */}
        {editorMode === "visual" && (
          <div
            ref={visualRef}
            contentEditable
            onInput={handleVisualInput}
            onBlur={handleVisualInput}
            dir={lang === "fa" ? "rtl" : "ltr"}
            className="absolute inset-0 w-full h-full overflow-y-auto px-6 py-5 focus:outline-hidden prose prose-invert prose-emerald max-w-none text-slate-100 placeholder:text-slate-500 select-text bg-[#030307]"
            style={{
              fontFamily: lang === "fa" ? "'Inter', system-ui, sans-serif" : "'Inter', system-ui, sans-serif",
              fontSize: "14px",
              lineHeight: "1.85",
            }}
            placeholder={placeholder}
          />
        )}

        {/* Tab 2: Code / Text Editor Mode text-area */}
        {editorMode === "html" && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleHtmlChange}
            dir="ltr"
            placeholder={placeholder || (lang === "fa" ? "کدهای HTML خود را در اینجا بنویسید..." : "Write HTML markup tags here...")}
            className="absolute inset-0 w-full h-full overflow-y-auto px-5 py-4 focus:outline-hidden font-mono text-xs text-cyan-100 bg-black/90 leading-relaxed tracking-wide border-0 resize-none"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          />
        )}
      </div>

      {/* Under editor word counts & styling guidance bar */}
      <div className="p-2 border-t border-white/10 bg-white/[0.01] flex justify-between items-center text-[10px] text-gray-400 px-3 select-none">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>
            {lang === "fa" 
              ? "ویرایشگر پیشرفته وردپرسی ما به همراه دیداری و کدهای اختصاصی" 
              : "Advanced dual-mode block formatting editor actively loaded"}
          </span>
        </div>
        <div className="font-mono">
          {lang === "fa" ? "تعداد کاراکترها" : "Chars"}: <span className="text-cyan-400 font-bold">{value?.length || 0}</span>
        </div>
      </div>
    </div>
  );
}
