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

export interface TaxonomyCategory {
  id: string;
  slug: string;             // URL slug in English (e.g. "tech-ai-tools")
  nameFa: string;           // Name in Persian
  nameEn: string;           // Name in English
  nameAr: string;           // Name in Arabic
  name?: string;            // Fallback for Persian name
  enName?: string;          // Fallback for English name
  description?: string;     // Short description of category scope
  articleIds?: string[];    // Array of Article IDs assigned to this category
  subcategories?: TaxonomyCategory[]; // Multi-level nested child categories
  suggestedReason?: string; // Reason/context for AI proposed categories
  icon?: string;            // Icon name key if available
}

export interface TaxonomyResult {
  title: string;
  summary: string;
  totalArticlesAnalyzed: number;
  existingCategoriesTree: TaxonomyCategory[];
  proposedNewCategoriesTree: TaxonomyCategory[];
  updatedAt: string;
}
