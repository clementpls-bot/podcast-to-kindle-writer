import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Languages,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";

import {
  TARGET_LANGUAGES,
  TONES,
  chapterWordCount,
  formatPrice,
  mergeGlossary,
  type Book,
  type Chapter,
  type ToneId,
  type TranscriptChunk,
} from "@/lib/book-types";
import { getTranscript, writeChapter, writeFrontMatter } from "@/lib/podcast.functions";
import { saveBookFn } from "@/lib/books.functions";
import { BookReader } from "@/components/BookReader";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Podcastly — Transformez un podcast YouTube en eBook" },
      {
        name: "description",
        content:
          "Collez un lien YouTube : aperçu gratuit du premier chapitre, puis 2,89 € pour le livre complet en EPUB et PDF, édité par IA et traduit si besoin.",
      },
      { property: "og:title", content: "Podcastly — Votre podcast devient un livre" },
      {
        property: "og:description",
        content:
          "Un lien YouTube, un aperçu gratuit, 2,89 € pour l'eBook complet : chapitres, notes de lecture, glossaire, EPUB et PDF.",
      },
    ],
  }),
  component: Home,
});

type Phase = "idle" | "working" | "preview" | "error";
type StepState = "pending" | "active" | "done";
type Step = { id: string; label: string; state: StepState; detail?: string };

const BASE_STEPS: Step[] = [
  { id: "fetch", label: "Récupération de la transcription", state: "pending" },
  { id: "write", label: "Rédaction du premier chapitre", state: "pending" },
  { id: "front", label: "Titre, sous-titre et introduction", state: "pending" },
];

const PENDING_KEY = "podcastly:pending-book";

type PendingBook = {
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

function Home() {
  const runTranscript = useServerFn(getTranscript);
  const runChapter = useServerFn(writeChapter);
  const runFront = useServerFn(writeFrontMatter);
  const runSave = useServerFn(saveBookFn);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [tone, setTone] = useState<ToneId>("entretien");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>(BASE_STEPS);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingBook | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  const patch = (id: string, state: StepState, detail?: string) =>
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, state, ...(detail ? { detail } : {}) } : s)),
    );

  // Un aperçu généré avant connexion est repris automatiquement au retour.
  useEffect(() => {
    if (restored.current) return;
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    restored.current = true;
    try {
      const parsed = JSON.parse(raw) as PendingBook;
      setPending(parsed);
      setTone(parsed.tone);
      setTargetLang(parsed.targetLang ?? "");
      setPhase("preview");
      setProgress(100);
      setSteps(BASE_STEPS.map((s) => ({ ...s, state: "done" })));
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
    }
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "working") return;

    setPhase("working");
    setError(null);
    setPending(null);
    setProgress(4);
    setSteps(BASE_STEPS.map((s) => ({ ...s, state: "pending" })));
    sessionStorage.removeItem(PENDING_KEY);

    try {
      patch("fetch", "active");
      const meta = await runTranscript({ data: { url } });
      patch(
        "fetch",
        "done",
        `${meta.title} · ${Math.round(meta.totalChars / 1000)} k caractères · ${meta.chunks.length} chapitre(s)`,
      );
      setProgress(35);

      patch("write", "active");
      const first = await runChapter({
        data: {
          chunk: meta.chunks[0]!.text,
          index: 0,
          total: meta.chunks.length,
          bookTitle: meta.title,
          sourceLang: meta.lang,
          targetLang: targetLang || null,
          tone,
          previousSpeakers: [],
          previousEnding: "",
          knownTerms: [],
        },
      });
      patch("write", "done", `« ${first.title} »`);
      setProgress(75);

      patch("front", "active");
      const front = await runFront({
        data: {
          sourceTitle: meta.title,
          author: meta.author,
          chapterTitles: [first.title],
          excerpt: first.blocks.map((b) => b.text).join(" "),
          targetLang: targetLang || null,
          tone,
        },
      });
      patch("front", "done", front.title);

      const draft: PendingBook = {
        title: front.title,
        subtitle: front.subtitle,
        author: meta.author,
        intro: front.intro,
        sourceUrl: `https://www.youtube.com/watch?v=${meta.videoId}`,
        sourceTitle: meta.title,
        language: targetLang || meta.lang,
        coverUrl: meta.thumbnail,
        tone,
        targetLang: targetLang || null,
        chaptersTotal: meta.chunks.length,
        firstChapter: first,
        chunks: meta.chunks,
      };
      setPending(draft);
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(draft));
      setProgress(100);
      setPhase("preview");
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur inattendue est survenue.");
      setPhase("error");
      setSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "pending" } : s)));
    }
  }

  async function unlock() {
    if (!pending) return;
    if (!user) {
      router.navigate({ href: "/auth?next=%2F" });
      return;
    }
    setUnlocking(true);
    setError(null);
    try {
      const saved = await runSave({ data: pending });
      sessionStorage.removeItem(PENDING_KEY);
      router.navigate({ href: `/livre/${saved.id}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer ce livre.");
      setUnlocking(false);
    }
  }

  const busy = phase === "working";

  const previewBook: Book | null = pending
    ? {
        title: pending.title,
        subtitle: pending.subtitle,
        author: pending.author,
        intro: pending.intro,
        sourceUrl: pending.sourceUrl,
        sourceTitle: pending.sourceTitle,
        language: pending.language,
        chapters: [pending.firstChapter],
        glossary: mergeGlossary(pending.firstChapter.glossary),
      }
    : null;

  return (
    <main className="min-h-screen">
      <section className="surface-night relative overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 sm:pt-10">
          <SiteHeader dark />

          <div className="mx-auto mt-12 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="h-3.5 w-3.5" /> Podcast → eBook
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Votre épisode devient un livre.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-80 sm:text-lg">
              Collez un lien YouTube. Vous lisez le premier chapitre gratuitement, et vous ne payez{" "}
              {formatPrice()} que si le résultat vous plaît.
            </p>
          </div>

          <form
            onSubmit={generate}
            className="mx-auto mt-10 w-full max-w-2xl rounded-3xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={busy}
              aria-label="Lien de la vidéo YouTube"
              className="w-full rounded-2xl border-0 bg-white/95 px-5 py-4 text-base text-foreground outline-none ring-accent placeholder:text-muted-foreground focus:ring-2 disabled:opacity-70"
            />

            <fieldset className="mt-3 rounded-2xl bg-white/95 p-4 text-left">
              <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Comment doit sonner votre livre ?
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTone(t.id)}
                    disabled={busy}
                    aria-pressed={tone === t.id}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      tone === t.id
                        ? "border-accent bg-accent/10"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{t.label}</p>
                    <p className="text-xs font-medium text-accent">{t.tagline}</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {t.description}
                    </p>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 items-center gap-2 rounded-2xl bg-white/95 px-4 py-3">
                <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  disabled={busy}
                  aria-label="Langue de traduction"
                  className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="cta hover:cta-hover inline-flex items-center justify-center gap-2 px-7 py-4 text-base disabled:opacity-70"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Lecture de l'épisode…
                  </>
                ) : (
                  <>
                    Voir mon aperçu gratuit <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
            <p className="px-2 pb-1 pt-3 text-xs opacity-70">
              Fonctionne avec toute vidéo disposant de sous-titres, même automatiques. Aperçu
              gratuit, puis {formatPrice()} par livre — paiement unique, sans abonnement.
            </p>
          </form>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        {phase === "idle" && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FileText,
                title: "Transcription fidèle",
                text: "Les sous-titres de la vidéo sont récupérés puis nettoyés, sans perdre un propos.",
              },
              {
                icon: Wand2,
                title: "Confort de lecture",
                text: "Quand un passage devient obscur, l'IA ajoute une transition, une note ou une définition — jamais une opinion.",
              },
              {
                icon: Download,
                title: "EPUB & PDF",
                text: "Sommaire, chapitres, notes et glossaire. L'EPUB s'envoie directement à votre Kindle.",
              },
            ].map((f) => (
              <div key={f.title} className="card-soft p-6">
                <f.icon className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        )}

        {(busy || phase === "error") && (
          <div className="card-soft overflow-hidden p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {phase === "error" ? "Traitement interrompu" : "Préparation de votre aperçu"}
              </h2>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {progress}%
              </span>
            </div>

            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="progress-fill h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <ul className="mt-6 space-y-3">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3">
                  {s.state === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : s.state === "active" ? (
                    <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent" />
                  ) : (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-border" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={
                        s.state === "pending"
                          ? "text-sm text-muted-foreground"
                          : "text-sm font-semibold"
                      }
                    >
                      {s.label}
                    </p>
                    {s.detail && <p className="truncate text-xs text-muted-foreground">{s.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>

            {error && phase === "error" && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-destructive">{error}</p>
                  <button
                    onClick={() => {
                      setPhase("idle");
                      setError(null);
                      setProgress(0);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
                  >
                    <RotateCcw className="h-4 w-4" /> Recommencer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {previewBook && pending && (
          <div ref={resultRef} className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
            <aside className="card-soft h-fit overflow-hidden">
              <div className="surface-night flex aspect-[3/4] flex-col justify-between p-6">
                {pending.coverUrl && (
                  <img
                    src={pending.coverUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-24 w-full rounded-lg object-cover opacity-40"
                  />
                )}
                <div>
                  <h3 className="font-display text-2xl font-bold leading-tight">{pending.title}</h3>
                  <p className="mt-2 text-sm italic opacity-80">{pending.subtitle}</p>
                  <p className="mt-6 text-xs uppercase tracking-widest opacity-70">
                    {pending.author}
                  </p>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <p className="text-xs text-muted-foreground">
                  Aperçu : chapitre 1 sur {pending.chaptersTotal} · ~
                  {chapterWordCount(pending.firstChapter).toLocaleString("fr-FR")} mots lus
                </p>
                <button
                  onClick={unlock}
                  disabled={unlocking || authLoading}
                  className="cta hover:cta-hover flex w-full items-center justify-center gap-2 px-5 py-3.5 disabled:opacity-70"
                >
                  {unlocking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Débloquer le livre — {formatPrice()}
                </button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Paiement unique, pas d'abonnement. Le livre complet reste dans votre bibliothèque
                  et se retélécharge en EPUB ou PDF quand vous voulez.
                </p>
                {!user && !authLoading && (
                  <p className="text-xs font-semibold text-accent">
                    Un compte est créé en une minute pour conserver votre livre.
                  </p>
                )}
                {error && phase === "preview" && (
                  <p className="text-xs font-semibold text-destructive">{error}</p>
                )}
              </div>
            </aside>

            <div>
              <BookReader book={previewBook} />
              <div className="card-soft mt-4 flex flex-col items-start gap-3 border-accent/30 bg-accent/5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <BookOpen className="h-4 w-4 text-accent" />
                    {pending.chaptersTotal - 1} chapitre(s) restant(s)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    On rédige la suite dès le paiement, puis vous téléchargez le livre entier.
                  </p>
                </div>
                <button
                  onClick={unlock}
                  disabled={unlocking || authLoading}
                  className="cta hover:cta-hover shrink-0 px-5 py-3 disabled:opacity-70"
                >
                  Continuer pour {formatPrice()}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
