/**
 * parseHtmlToChapters
 * Parses an HTML string into discrete chapters based on header tags (H1-H6),
 * as well as list items/styled subheadings, avoiding empty chapters.
 */
export interface StructuredChapter {
  order: number;
  title: string;
  content: string;
}

function cleanTitle(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  text = text.replace(/\s+/g, " ");
  return text;
}

function hasVisibleContent(html: string): boolean {
  if (!html || !html.trim()) return false;
  if (/<(img|iframe|video|audio|object|embed|svg)[^>]*>/i.test(html)) return true;
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return stripped.length > 0;
}

function getHeadingTitle(node: Node): string | null {
  if (!node || node.nodeType !== 1) return null;
  const el = node as HTMLElement;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";

  // 1. Direct H1-H6 element
  if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    const title = cleanTitle(el.textContent || "");
    return title || null;
  }

  // 2. Element containing an H1-H6 tag inside it
  const innerHeader = el.querySelector?.("h1, h2, h3, h4, h5, h6");
  if (innerHeader) {
    const title = cleanTitle(innerHeader.textContent || "");
    if (title) return title;
  }

  // 3. Check for short strong/bold headers in LI, P, DIV, SPAN
  if (["li", "p", "div", "span"].includes(tag)) {
    const text = cleanTitle(el.textContent || "");
    if (text && text.length >= 2 && text.length <= 110) {
      const hasStrong = !!el.querySelector?.("strong, b") || ["strong", "b"].includes(tag);
      const style = el.getAttribute?.("style") || "";
      const isLargeFont = /font-size:\s*(1[8-9]|[2-9][0-9])px/i.test(style) || /font-weight:\s*bold/i.test(style);

      if (hasStrong || isLargeFont || tag === "li") {
        return text;
      }
    }
  }

  return null;
}

function collectBlocks(node: Node): Node[] {
  if (!node) return [];

  if (node.nodeType === 3) { // TEXT_NODE
    const text = node.textContent || "";
    if (text.trim()) {
      return [node];
    }
    return [];
  }

  if (node.nodeType === 1) { // ELEMENT_NODE
    const el = node as HTMLElement;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";

    // H1-H6 are atomic heading blocks
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      return [node];
    }

    // List wrappers <ol>, <ul> -> expand their child list items
    if (tag === "ol" || tag === "ul") {
      const blocks: Node[] = [];
      Array.from(el.childNodes).forEach((child) => {
        blocks.push(...collectBlocks(child));
      });
      return blocks;
    }

    // List item <li>
    if (tag === "li") {
      const hasHTag = el.querySelector("h1, h2, h3, h4, h5, h6");
      if (hasHTag) {
        const blocks: Node[] = [];
        Array.from(el.childNodes).forEach((child) => {
          blocks.push(...collectBlocks(child));
        });
        return blocks;
      }
      return [node];
    }

    // Structural containers: <div>, <section>, <article>, <blockquote>, <main>
    if (["div", "section", "article", "blockquote", "main"].includes(tag)) {
      const hasHeadingsOrLists = el.querySelector("h1, h2, h3, h4, h5, h6, ol, ul");
      if (hasHeadingsOrLists) {
        const blocks: Node[] = [];
        Array.from(el.childNodes).forEach((child) => {
          blocks.push(...collectBlocks(child));
        });
        return blocks;
      }
      return [node];
    }

    return [node];
  }

  return [];
}

export function parseHtmlToChapters(html: string, fallbackTitle: string = "مقدمه"): StructuredChapter[] {
  const contentHtml = String(html || "").trim();
  if (!contentHtml) {
    return [{ order: 1, title: fallbackTitle, content: "<p>محتوای این بخش خالی است.</p>" }];
  }

  try {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return [{ order: 1, title: fallbackTitle, content: contentHtml }];
    }

    const container = document.createElement("div");
    container.innerHTML = contentHtml;

    const topBlocks: Node[] = [];
    Array.from(container.childNodes).forEach((node) => {
      topBlocks.push(...collectBlocks(node));
    });

    if (topBlocks.length === 0) {
      return [{ order: 1, title: fallbackTitle, content: contentHtml }];
    }

    const chapters: StructuredChapter[] = [];
    let currentTitle = fallbackTitle;
    let currentBuffer: string[] = [];
    let orderCounter = 1;

    const flush = () => {
      const rawContent = currentBuffer.join("").trim();
      if (hasVisibleContent(rawContent)) {
        chapters.push({
          order: orderCounter++,
          title: (currentTitle || "").trim() || `بخش ${orderCounter}`,
          content: rawContent
        });
      }
      currentBuffer = [];
    };

    topBlocks.forEach((node) => {
      if (!node) return;

      const headingTitle = getHeadingTitle(node);

      if (headingTitle) {
        flush();
        currentTitle = headingTitle;
      } else {
        if (node.nodeType === 1) {
          const el = node as HTMLElement;
          currentBuffer.push(el.outerHTML || "");
        } else if (node.nodeType === 3) {
          const text = node.textContent || "";
          if (text.trim()) {
            currentBuffer.push(text);
          }
        }
      }
    });

    flush();

    if (chapters.length === 0) {
      return [{ order: 1, title: fallbackTitle, content: contentHtml }];
    }

    return chapters;
  } catch (err) {
    console.error("Error parsed Html to chapters:", err);
    return [{ order: 1, title: fallbackTitle, content: contentHtml }];
  }
}

/**
 * stripImages
 * Removes all <img> tags from an HTML string.
 */
export function stripImages(html: string): string {
  if (!html) return "";
  return html.replace(/<img[^>]*>/gi, "");
}

/**
 * transformToSiteJson
 * Returns the exact JSON representation expected by the website database.
 */
export function transformToSiteJson(art: any, chaptersList: StructuredChapter[], authorEmail?: string) {
  const currentChapters = chaptersList && chaptersList.length > 0
    ? chaptersList
    : parseHtmlToChapters(art.body, art.title || "مقدمه");

  // Parse view count to number, default to 10 if none
  const viewCountNum = art.view_count ? Number(art.view_count) : 10;
  
  // Parse base image to number, default to 1 as show in reference JSON
  const imageId = art.base_image && !isNaN(Number(art.base_image)) ? Number(art.base_image) : 1;

  const articleTags = art.tags
    ? art.tags.split(",").map(t => t.trim()).filter(Boolean)
    : ["tag1"]; // Default tag fallback if empty

  // Extract category_id from article; if empty fallback to ["test"]
  const rawCatId = art.category_id !== undefined && art.category_id !== null ? String(art.category_id).trim() : "";
  const articleCategories = rawCatId
    ? rawCatId.split(",").map(c => c.trim()).filter(Boolean)
    : ["test"];

  return {
    item_type: "POST",
    content_type: "ARTICLE",
    product_type: null,
    access_type: "FREE",
    author: authorEmail?.trim() || "mohammadpp955.pp955@gmail.com",
    categories: articleCategories,
    tags: articleTags,
    subscriptions: [],
    stock: 0,
    cached_view_count: isNaN(viewCountNum) ? 10 : viewCountNum,
    versions: [
      {
        version: 1,
        slug: art.slug || "test-post",
        status: "PUBLISHED",
        price: { amount: "9.99", currency: "USD" },
        discount: 0,
        image: imageId,
        should_translate: false,
        translations: {
          fa: {
            title: art.title || "",
            description: art.description || "",
            long_description: art.long_summary || ""
          },
          en: {
            title: art.en_title || "",
            description: art.en_description || "",
            long_description: ""
          }
        },
        sections: [
          {
            order: 1,
            content_type: "ARTICLE",
            translations: {
              fa: { title: "" },
              en: { title: "" }
            },
            chapters: currentChapters.map((ch) => ({
              order: ch.order,
              content_type: "ARTICLE",
              preview: false,
              translations: {
                fa: {
                  title: ch.title,
                  description: ch.content
                },
                en: {
                  title: "",
                  description: ""
                }
              },
              files: [
                {
                  file: imageId,
                  order: 1,
                  preview: false
                }
              ]
            }))
          }
        ]
      }
    ]
  };
}
