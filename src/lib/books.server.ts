import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  mergeGlossary,
  type Book,
  type Chapter,
  type GlossaryEntry,
  type ToneId,
  type TranscriptChunk,
} from "./book-types";
import { rewriteChunk } from "./ai.server";

type Db = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["books"]["Row"];

export type BookRecord = {
  id: string;
  status: "preview" | "paid";
  tone: ToneId;
  targetLang: string | null;
  chaptersTotal: number;
  chaptersDone: number;
  coverUrl: string | null;
  createdAt: string;
  book: Book;
};

function toRecord(row: Row): BookRecord {
  const chapters = (row.chapters as unknown as Chapter[]) ?? [];
  return {
    id: row.id,
    status: row.status === "paid" ? "paid" : "preview",
    tone: row.tone as ToneId,
    targetLang: row.target_lang,
    chaptersTotal: row.chapters_total,
    chaptersDone: chapters.length,
    coverUrl: row.cover_url,
    createdAt: row.created_at,
    book: {
      title: row.title,
      subtitle: row.subtitle,
      author: row.author,
      intro: row.intro,
      sourceUrl: row.source_url,
      sourceTitle: row.source_title,
      language: row.language,
      chapters,
      glossary: (row.glossary as unknown as GlossaryEntry[]) ?? [],
    },
  };
}

export type SaveBookInput = {
  title: string;
  subtitle: string;
  author: string;
  intro: string;
  sourceUrl: string;
  sourceTitle: string;
  language: string;
  coverUrl: string | null;
  tone: ToneId;
  targetLang: string | null;
  chaptersTotal: number;
  firstChapter: Chapter;
  chunks: TranscriptChunk[];
};

export async function saveBook(db: Db, userId: string, input: SaveBookInput) {
  const { data, error } = await db
    .from("books")
    .insert({
      user_id: userId,
      status: "preview",
      title: input.title,
      subtitle: input.subtitle,
      author: input.author,
      intro: input.intro,
      source_url: input.sourceUrl,
      source_title: input.sourceTitle,
      language: input.language,
      cover_url: input.coverUrl,
      tone: input.tone,
      target_lang: input.targetLang,
      chapters_total: input.chaptersTotal,
      chapters: [input.firstChapter] as never,
      glossary: mergeGlossary(input.firstChapter.glossary) as never,
      source_chunks: input.chunks as never,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Impossible d'enregistrer le livre.");

  const { error: orderError } = await db.from("orders").insert({
    user_id: userId,
    book_id: data.id,
    status: "pending",
  });
  if (orderError) throw new Error(orderError.message);

  return toRecord(data);
}

export async function getBook(db: Db, id: string): Promise<BookRecord> {
  const { data, error } = await db.from("books").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Livre introuvable.");
  return toRecord(data);
}

export async function listBooks(db: Db) {
  const { data, error } = await db
    .from("books")
    .select()
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRecord);
}

/**
 * Rédige le chapitre suivant d'un livre payé et le sauvegarde immédiatement,
 * pour qu'une interruption ne perde jamais le travail déjà effectué.
 */
export async function generateNextChapter(db: Db, id: string) {
  const { data, error } = await db.from("books").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Livre introuvable.");
  if (data.status !== "paid") throw new Error("Ce livre n'a pas encore été débloqué.");

  const chapters = (data.chapters as unknown as Chapter[]) ?? [];
  const chunks = (data.source_chunks as unknown as TranscriptChunk[]) ?? [];
  const nextIndex = chapters.length;

  if (nextIndex >= chunks.length) {
    return { done: true as const, index: nextIndex, total: chunks.length, title: "" };
  }

  const speakers = new Set<string>();
  for (const ch of chapters) {
    for (const b of ch.blocks) if (b.kind === "speech" && b.speaker) speakers.add(b.speaker);
  }
  const previous = chapters[chapters.length - 1];
  const lastBlock = previous?.blocks[previous.blocks.length - 1];
  const glossary = (data.glossary as unknown as GlossaryEntry[]) ?? [];

  const chapter = await rewriteChunk({
    chunk: chunks[nextIndex]!.text,
    index: nextIndex,
    total: chunks.length,
    bookTitle: data.source_title,
    sourceLang: data.language,
    targetLang: data.target_lang,
    tone: data.tone as ToneId,
    previousSpeakers: [...speakers].slice(0, 12),
    previousEnding: (lastBlock?.text ?? "").slice(-300),
    knownTerms: glossary.map((g) => g.term).slice(0, 40),
  });

  const nextChapters = [...chapters, chapter];
  const { error: updateError } = await db
    .from("books")
    .update({
      chapters: nextChapters as never,
      glossary: mergeGlossary([...glossary, ...chapter.glossary]) as never,
    })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  return {
    done: nextChapters.length >= chunks.length,
    index: nextChapters.length,
    total: chunks.length,
    title: chapter.title,
  };
}
