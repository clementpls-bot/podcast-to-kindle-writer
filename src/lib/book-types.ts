export type Paragraph = { speaker?: string | undefined; text: string };
export type Chapter = { title: string; paragraphs: Paragraph[] };

export type TranscriptChunk = { index: number; startSec: number; text: string };

export type TranscriptMeta = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  durationSec: number;
  lang: string;
  availableLangs: { code: string; label: string; auto: boolean }[];
  chunks: TranscriptChunk[];
  totalChars: number;
};

export type Book = {
  title: string;
  subtitle: string;
  author: string;
  intro: string;
  sourceUrl: string;
  sourceTitle: string;
  language: string;
  chapters: Chapter[];
};

export const TARGET_LANGUAGES = [
  { code: "", label: "Ne pas traduire" },
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "es", label: "Espagnol" },
  { code: "de", label: "Allemand" },
  { code: "it", label: "Italien" },
  { code: "pt", label: "Portugais" },
  { code: "nl", label: "Néerlandais" },
  { code: "ar", label: "Arabe" },
  { code: "ja", label: "Japonais" },
  { code: "zh", label: "Chinois" },
] as const;
