/**
 * parseHtmlToChapters
 * Parses an HTML string into discrete chapters based on header tags (H1-H6).
 * Words before the first header are flushed into a custom header or the article name.
 */
export interface StructuredChapter {
  order: number;
  title: string;
  content: string;
}

export function parseHtmlToChapters(html: string, fallbackTitle: string = "مقدمه"): StructuredChapter[] {
  const contentHtml = String(html || "");
  
  try {
    // Create an offline DOM wrapper if environment supports it
    if (typeof window === "undefined" || typeof document === "undefined") {
      return [{ order: 1, title: fallbackTitle, content: contentHtml }];
    }

    const container = document.createElement("div");
    container.innerHTML = contentHtml;

    const chapters: StructuredChapter[] = [];
    let currentTitle = fallbackTitle;
    let currentBuffer: string[] = [];
    let orderCounter = 1;

    const flush = () => {
      const rawContent = currentBuffer.join("").trim();
      if (rawContent || chapters.length === 0) {
        chapters.push({
          order: orderCounter++,
          title: (currentTitle || "").trim() || `بخش ${orderCounter - 1}`,
          content: rawContent || "<p>محتوای این بخش خالی است.</p>"
        });
      }
      currentBuffer = [];
    };

    // Convert childNodes or children
    const children = Array.from(container.childNodes);
    
    if (children.length === 0 && contentHtml.trim()) {
      return [{ order: 1, title: fallbackTitle, content: contentHtml }];
    }

    children.forEach((node) => {
      if (!node) return;
      if (node.nodeType === 1) { // ELEMENT_NODE
        const el = node as HTMLElement;
        const tag = el.tagName ? el.tagName.toLowerCase() : "";
        const isHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag);

        if (isHeading) {
          // Flush previous accumulator
          flush();
          // New heading text
          currentTitle = el.textContent || `بخش ${orderCounter}`;
        } else {
          currentBuffer.push(el.outerHTML || "");
        }
      } else if (node.nodeType === 3) { // TEXT_NODE
        const text = node.textContent || "";
        if (text.trim()) {
          currentBuffer.push(text);
        }
      }
    });

    // Final flush
    flush();

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
export function transformToSiteJson(art: any, chaptersList: StructuredChapter[]) {
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
    author: "mohammadpp955.pp955@gmail.com",
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
            long_description: art.description || ""
          },
          en: {
            title: "",
            description: "",
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
