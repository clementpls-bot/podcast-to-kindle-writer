import type { Block, Chapter, Footnote, GlossaryEntry, ToneId } from "./book-types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

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

/** Règles communes : fidélité absolue aux propos. */
const FIDELITY_RULES = `RÈGLES DE FIDÉLITÉ (non négociables) :
- Tu conserves EXACTEMENT les propos des intervenants : aucune invention, aucun ajout d'idée, aucun résumé, aucune suppression de contenu.
- Tu corriges la forme : ponctuation, majuscules, découpage en phrases et en paragraphes, suppression des hésitations et tics ("euh", "ben", "voilà quoi", répétitions accidentelles, faux départs), corrections évidentes de transcription automatique.
- Tu supprimes les marqueurs de temps [00:00] et les annotations type [Musique].
- Toute information qui ne vient pas des intervenants doit apparaître comme un ajout éditorial clairement séparé (note, note de bas de chapitre ou glossaire) — jamais dans leur bouche.`;

/** Règles de confort de lecture : le cœur de la V2. */
const COMFORT_RULES = `CONFORT DE LECTURE — ta seconde mission :
Le lecteur n'a pas écouté l'épisode. Relis chaque passage en te demandant : « quelqu'un qui découvre ce texte comprend-il ? »
Repère les décrochages : jargon ou acronyme non expliqué, référence à un moment antérieur de la conversation absent du chapitre, personne / entreprise / œuvre citée sans contexte, sous-entendu visuel ("comme vous le voyez ici"), chiffre isolé sans unité ni période, transition abrupte entre deux sujets.
Choisis à chaque fois le niveau d'intervention LE PLUS LÉGER qui suffit :
1. MOTS DE LIAISON — 2 ou 3 mots glissés dans la phrase pour la rendre lisible, sans changer le sens ni ajouter d'information extérieure. À privilégier.
2. NOTE ENCADRÉE — un bloc {"kind":"note"} placé juste avant ou après le passage concerné, de 1 à 3 phrases, quand un contexte est indispensable pour suivre. Maximum 2 par chapitre.
3. NOTE DE BAS DE CHAPITRE — pour une précision utile mais qui casserait le rythme. Insère un appel "[^1]" directement dans le texte du bloc concerné, et décris la note dans "footnotes". Numérote à partir de 1 dans CHAQUE chapitre. Maximum 4 par chapitre.
4. GLOSSAIRE — chaque terme technique, acronyme ou anglicisme métier employé dans le chapitre est ajouté à "glossary" avec une définition d'une phrase. Maximum 6 par chapitre, uniquement les termes réellement obscurs.
Ne surcharge jamais : un chapitre limpide peut n'avoir ni note ni appel de note. N'explique jamais l'évidence.`;

const TONE_RULES: Record<ToneId, string> = {
  entretien: `TON : ENTRETIEN.
Tu conserves la forme dialoguée. Chaque bloc de parole est attribué à son locuteur (nom réel s'il est mentionné, sinon "Hôte", "Invité", "Invitée", "Intervenant 2"...), avec le champ "speaker". Reste cohérent d'un chapitre à l'autre. Paragraphes de 3 à 6 phrases.`,
  magazine: `TON : MAGAZINE.
Tu transformes l'échange en long format de presse écrite, à la troisième personne, en récit continu. Les propos marquants restent au discours direct, entre guillemets, attribués dans la phrase ("explique Marie Dupont"). Le champ "speaker" reste vide pour les passages narratifs. Ouvre le chapitre par un court chapeau qui plante la scène à partir de ce qui est réellement dit. Paragraphes de 3 à 5 phrases.`,
  pedagogique: `TON : PÉDAGOGIQUE.
Tu réorganises le propos du chapitre par idées, dans un ordre clair, sans rien retirer. Les explications des intervenants sont mises en avant, leurs mots conservés. Tu peux attribuer les blocs à leur locuteur. Termine le chapitre par un bloc {"kind":"note","title":"À retenir"} listant 2 à 4 points clés en une phrase chacun, tirés uniquement du contenu du chapitre.`,
  essai: `TON : ESSAI.
Tu adoptes une écriture littéraire : phrases plus amples, transitions soignées, rythme de lecture posé. Les idées et les formulations des intervenants sont préservées ; tu travailles uniquement l'enchaînement et la respiration. Les citations fortes restent au discours direct. Paragraphes de 4 à 7 phrases.`,
};

const OUTPUT_SHAPE = `Réponds UNIQUEMENT avec un objet JSON de cette forme exacte :
{
  "title": "Titre court et évocateur du chapitre (max 60 caractères)",
  "blocks": [
    {"kind": "speech", "speaker": "Nom du locuteur ou chaîne vide", "text": "Paragraphe mis en forme."},
    {"kind": "note", "title": "Titre court de l'encadré", "text": "Explication éditoriale."}
  ],
  "footnotes": [{"n": 1, "text": "Texte de la note de bas de chapitre."}],
  "glossary": [{"term": "Terme", "definition": "Définition en une phrase."}]
}
"footnotes" et "glossary" peuvent être des tableaux vides.`;

function normalizeChapter(
  parsed: { title?: string; blocks?: any[]; footnotes?: any[]; glossary?: any[] },
  index: number,
): Chapter {
  const blocks: Block[] = (parsed.blocks ?? [])
    .map((b): Block | null => {
      const text = String(b?.text ?? "").trim();
      if (!text) return null;
      if (b?.kind === "note") {
        const title = String(b?.title ?? "").trim();
        return { kind: "note", title: title || undefined, text };
      }
      const speaker = String(b?.speaker ?? "").trim();
      return { kind: "speech", speaker: speaker || undefined, text };
    })
    .filter((b): b is Block => b !== null);

  if (!blocks.length) throw new Error("L'IA n'a rien renvoyé pour ce chapitre.");

  const used = new Set<number>();
  for (const b of blocks) {
    for (const m of b.text.matchAll(/\[\^(\d+)\]/g)) used.add(Number(m[1]));
  }

  const footnotes: Footnote[] = (parsed.footnotes ?? [])
    .map((f) => ({ n: Number(f?.n ?? 0), text: String(f?.text ?? "").trim() }))
    .filter((f) => f.n > 0 && f.text && used.has(f.n))
    .sort((a, b) => a.n - b.n);

  const glossary: GlossaryEntry[] = (parsed.glossary ?? [])
    .map((g) => ({
      term: String(g?.term ?? "").trim(),
      definition: String(g?.definition ?? "").trim(),
    }))
    .filter((g) => g.term && g.definition);

  return {
    title: parsed.title?.trim() || `Chapitre ${index + 1}`,
    blocks,
    footnotes,
    glossary,
  };
}

export async function rewriteChunk(params: {
  chunk: string;
  index: number;
  total: number;
  bookTitle: string;
  sourceLang: string;
  targetLang: string | null;
  tone: ToneId;
  previousSpeakers: string[];
  previousEnding: string;
  knownTerms: string[];
}): Promise<Chapter> {
  const { chunk, index, total, bookTitle, targetLang, tone, previousSpeakers, previousEnding } =
    params;

  const translation = targetLang
    ? `\n\nTRADUCTION : rédige l'intégralité du résultat (titre, texte, notes, glossaire) en ${langLabel(targetLang)}, en traduisant fidèlement les propos. Les noms des locuteurs restent inchangés.`
    : "";

  const context = [
    previousSpeakers.length
      ? `Locuteurs déjà identifiés : ${previousSpeakers.join(", ")}. Réutilise ces mêmes noms.`
      : "",
    previousEnding ? `Fin du chapitre précédent (continuité) : "…${previousEnding}"` : "",
    params.knownTerms.length
      ? `Termes déjà définis au glossaire (ne les redéfinis pas) : ${params.knownTerms.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Tu es un éditeur de livres spécialisé dans la mise en forme de transcriptions de podcasts.",
    FIDELITY_RULES,
    TONE_RULES[tone] ?? TONE_RULES.entretien,
    COMFORT_RULES,
  ].join("\n\n");

  const user = `Titre de l'épisode : "${bookTitle}"
Chapitre ${index + 1} sur ${total}.
${context}

Transcription brute à mettre en forme :
"""
${chunk}
"""

${OUTPUT_SHAPE}${translation}`;

  const raw = await chat([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  return normalizeChapter(
    extractJson<{ title?: string; blocks?: any[]; footnotes?: any[]; glossary?: any[] }>(raw),
    index,
  );
}

export async function buildFrontMatter(params: {
  sourceTitle: string;
  author: string;
  chapterTitles: string[];
  excerpt: string;
  targetLang: string | null;
  tone: ToneId;
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
Ton éditorial du livre : ${params.tone}.
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
