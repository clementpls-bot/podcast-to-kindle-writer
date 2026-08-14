const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

export type Paragraph = { speaker?: string | undefined; text: string };
export type Chapter = { title: string; paragraphs: Paragraph[] };

async function chat(messages: { role: string; content: string }[], jsonMode = true) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Le service d'IA n'est pas configuré sur ce projet.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429) throw new Error("Trop de requêtes IA d'un coup. Réessaie dans un instant.");
  if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoute des crédits pour continuer.");
  if (!res.ok) throw new Error(`Le service d'IA a échoué (${res.status}).`);

  const data = (await res.json()) as any;
  return (data?.choices?.[0]?.message?.content ?? "") as string;
}

function extractJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("Réponse IA illisible, réessaie.");
  }
}

const LANG_LABELS: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "néerlandais",
  ar: "arabe",
  ja: "japonais",
  zh: "chinois simplifié",
};

export function langLabel(code: string) {
  return LANG_LABELS[code] ?? code;
}

const EDITORIAL_RULES = `Tu es un éditeur de livres spécialisé dans la mise en forme de transcriptions de podcasts.

RÈGLES ABSOLUES :
- Tu conserves EXACTEMENT les propos des intervenants : aucune invention, aucun ajout d'idée, aucun résumé, aucune suppression de contenu.
- Tu identifies qui parle et tu attribues chaque paragraphe à son locuteur (nom réel si mentionné dans la conversation, sinon "Hôte", "Invité", "Invitée", "Intervenant 2"...). Reste cohérent d'un chapitre à l'autre.
- Tu corriges uniquement la forme : ponctuation, majuscules, découpage en phrases et en paragraphes, suppression des hésitations et tics ("euh", "ben", "voilà quoi", répétitions accidentelles, faux départs), corrections évidentes de transcription automatique.
- Tu peux ajuster de rares mots de liaison pour la fluidité, jamais le sens.
- Tu supprimes les marqueurs de temps [00:00] et les annotations type [Musique].
- Le résultat doit se lire comme un livre d'entretien : paragraphes de 3 à 6 phrases, agréables à lire.`;

export async function rewriteChunk(params: {
  chunk: string;
  index: number;
  total: number;
  bookTitle: string;
  sourceLang: string;
  targetLang: string | null;
  previousSpeakers: string[];
  previousEnding: string;
}): Promise<Chapter> {
  const { chunk, index, total, bookTitle, targetLang, previousSpeakers, previousEnding } = params;

  const translation = targetLang
    ? `\n\nTRADUCTION : rédige l'intégralité du résultat (titre du chapitre ET texte) en ${langLabel(targetLang)}, en traduisant fidèlement les propos. Les noms des locuteurs restent inchangés.`
    : "";

  const context = [
    previousSpeakers.length
      ? `Locuteurs déjà identifiés dans les chapitres précédents : ${previousSpeakers.join(", ")}. Réutilise ces mêmes noms.`
      : "",
    previousEnding ? `Fin du chapitre précédent (pour la continuité) : "…${previousEnding}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Titre de l'épisode : "${bookTitle}"
Chapitre ${index + 1} sur ${total}.
${context}

Transcription brute à mettre en forme :
"""
${chunk}
"""

Réponds UNIQUEMENT avec un objet JSON de la forme :
{"title": "Titre court et évocateur du chapitre (max 60 caractères)", "paragraphs": [{"speaker": "Nom du locuteur", "text": "Paragraphe mis en forme."}]}
Si un paragraphe poursuit le locuteur précédent, répète tout de même son nom.${translation}`;

  const raw = await chat([
    { role: "system", content: EDITORIAL_RULES },
    { role: "user", content: user },
  ]);

  const parsed = extractJson<{ title?: string; paragraphs?: Paragraph[] }>(raw);
  const paragraphs = (parsed.paragraphs ?? [])
    .map((p) => ({ speaker: p.speaker?.trim() || undefined, text: String(p.text ?? "").trim() }))
    .filter((p) => p.text.length > 0);

  if (!paragraphs.length) throw new Error("L'IA n'a rien renvoyé pour ce chapitre.");

  return { title: parsed.title?.trim() || `Chapitre ${index + 1}`, paragraphs };
}

export async function buildFrontMatter(params: {
  sourceTitle: string;
  author: string;
  chapterTitles: string[];
  excerpt: string;
  targetLang: string | null;
}): Promise<{ title: string; subtitle: string; intro: string }> {
  const lang = params.targetLang ? langLabel(params.targetLang) : "la langue de la transcription";
  const raw = await chat([
    {
      role: "system",
      content:
        "Tu es un éditeur. Tu proposes un titre de livre, un sous-titre et une courte introduction, sans jamais inventer de faits absents du contenu.",
    },
    {
      role: "user",
      content: `Épisode de podcast : "${params.sourceTitle}" par ${params.author}.
Chapitres : ${params.chapterTitles.map((t, i) => `${i + 1}. ${t}`).join(" | ")}
Extrait : """${params.excerpt.slice(0, 1500)}"""

Rédige en ${lang}. Réponds UNIQUEMENT en JSON :
{"title": "Titre du livre (max 70 caractères)", "subtitle": "Sous-titre (max 90 caractères)", "intro": "Introduction de 2 courts paragraphes présentant l'entretien, séparés par \\n\\n"}`,
    },
  ]);

  const parsed = extractJson<{ title?: string; subtitle?: string; intro?: string }>(raw);
  return {
    title: parsed.title?.trim() || params.sourceTitle,
    subtitle: parsed.subtitle?.trim() || `Entretien avec ${params.author}`,
    intro: parsed.intro?.trim() || "",
  };
}
