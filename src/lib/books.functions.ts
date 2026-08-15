import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BookRecord } from "./books.server";

const blockSchema = z.union([
  z.object({
    kind: z.literal("speech"),
    speaker: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("note"),
    title: z.string().optional(),
    text: z.string(),
  }),
]);

const chapterSchema = z.object({
  title: z.string(),
  blocks: z.array(blockSchema),
  footnotes: z.array(z.object({ n: z.number(), text: z.string() })),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })),
});

export const saveBookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string(),
        subtitle: z.string(),
        author: z.string(),
        intro: z.string(),
        sourceUrl: z.string(),
        sourceTitle: z.string(),
        language: z.string(),
        coverUrl: z.string().nullable(),
        tone: z.enum(["entretien", "magazine", "pedagogique", "essai"]),
        targetLang: z.string().nullable(),
        chaptersTotal: z.number().int().min(1),
        firstChapter: chapterSchema,
        chunks: z.array(
          z.object({ index: z.number(), startSec: z.number(), text: z.string() }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<BookRecord> => {
    const { saveBook } = await import("./books.server");
    return saveBook(context.supabase, context.userId, data);
  });

export const getBookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<BookRecord> => {
    const { getBook } = await import("./books.server");
    return getBook(context.supabase, data.id);
  });

export const listBooksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BookRecord[]> => {
    const { listBooks } = await import("./books.server");
    return listBooks(context.supabase);
  });

export const generateNextChapterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { generateNextChapter } = await import("./books.server");
    return generateNextChapter(context.supabase, data.id);
  });
