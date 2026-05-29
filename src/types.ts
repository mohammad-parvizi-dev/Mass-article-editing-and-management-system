/**
 * Defines shared TypeScript interfaces for the Article CSV Manager.
 */

import { StructuredChapter } from "./utils/chapterizer";

export interface Article {
  id: string;
  category_id: string;
  is_published: string; // "1" for published, "0" for draft
  base_image: string;   // URL or path
  title: string;
  slug: string;
  description: string;
  body: string;
  view_count: string;
  reading_time: string;
  en_title: string;
  en_description: string;
  en_body: string;
  ar_title: string;
  ar_description: string;
  ar_body: string;
  deleted_at: string;
  created_at: string;
  updated_at: string;
  tags?: string;

  // Custom metadata fields for local app operation
  isEdited?: boolean;
  chapters?: StructuredChapter[];
}

export interface CSVImportOptions {
  headers: string[];
  delimiter: string;
}

export type LangTab = "fa" | "en" | "ar";
