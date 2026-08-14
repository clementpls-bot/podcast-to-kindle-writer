import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Chapter, TranscriptMeta } from "./book-types";

export const getTranscript = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ url: z.string().min(5), lang: z.string().optional() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<TranscriptMeta> => {
    const { fetchTranscript } = await import("./youtube.server");
    return fetchTranscript(data.url, data.lang);
  });

export const writeChapter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        chunk: z.string().min(1),
        index: z.number().int().min(0),
        total: z.number().int().min(1),
        bookTitle: z.string(),
        sourceLang: z.string(),
        targetLang: z.string().nullable(),
        previousSpeakers: z.array(z.string()).max(12),
        previousEnding: z.string().max(400),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<Chapter> => {
    const { rewriteChunk } = await import("./ai.server");
    return rewriteChunk(data);
  });

export const writeFrontMatter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        sourceTitle: z.string(),
        author: z.string(),
        chapterTitles: z.array(z.string()),
        excerpt: z.string(),
        targetLang: z.string().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { buildFrontMatter } = await import("./ai.server");
    return buildFrontMatter(data);
  });
