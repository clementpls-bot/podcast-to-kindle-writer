export type SpeechBlock = { kind: "speech"; speaker?: string | undefined; text: string };
export type NoteBlock = { kind: "note"; title?: string | undefined; text: string };
export type Block = SpeechBlock | NoteBlock;

export type Footnote = { n: number; text: string };
export type GlossaryEntry = { term: string; definition: string };

export type Chapter = {
  title: string;
  blocks: Block[];
  footnotes: Footnote[];
  glossary: GlossaryEntry[];
};

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
  glossary: GlossaryEntry[];
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

export type ToneId = "entretien" | "magazine" | "pedagogique" | "essai";

export const TONES: { id: ToneId; label: string; tagline: string; description: string }[] = [
  {
    id: "entretien",
    label: "Entretien",
    tagline: "Fidèle au dialogue",
    description: "Chaque intervenant est nommé, la conversation se lit comme un livre d'entretien.",
  },
  {
    id: "magazine",
    label: "Magazine",
    tagline: "Récit fluide",
    description: "Un long format de presse : chapeau d'introduction, narration continue, respirations.",
  },
  {
    id: "pedagogique",
    label: "Pédagogique",
    tagline: "Clair et structuré",
    description: "Idées ordonnées, explications appuyées et points clés en fin de chapitre.",
  },
  {
    id: "essai",
    label: "Essai",
    tagline: "Plus littéraire",
    description: "Phrases amples, transitions travaillées, un ton d'auteur assumé.",
  },
];

export const PRICE_CENTS = 289;

export function formatPrice(cents = PRICE_CENTS) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function chapterWordCount(ch: Chapter) {
  return ch.blocks.reduce((a, b) => a + b.text.split(/\s+/).filter(Boolean).length, 0);
}

export function mergeGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  const map = new Map<string, GlossaryEntry>();
  for (const e of entries) {
    const key = e.term.trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, { term: e.term.trim(), definition: e.definition.trim() });
  }
  return [...map.values()].sort((a, b) => a.term.localeCompare(b.term, "fr"));
}
