import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Languages,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";

import { TARGET_LANGUAGES, type Book, type Chapter } from "@/lib/book-types";
import { buildEpub, buildPdf, downloadBlob, slugify } from "@/lib/ebook-export";
import { getTranscript, writeChapter, writeFrontMatter } from "@/lib/podcast.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Podcastly — Transformez un podcast YouTube en eBook" },
      {
        name: "description",
        content:
          "Collez un lien YouTube : transcription, mise en forme éditoriale par IA, traduction optionnelle et export EPUB ou PDF prêt pour Kindle.",
      },
      { property: "og:title", content: "Podcastly — Votre podcast devient un livre" },
      {
        property: "og:description",
        content:
          "Un lien YouTube, un clic : votre épisode devient un eBook structuré en chapitres, traduit si besoin, téléchargeable en EPUB ou PDF.",
      },
    ],
  }),
  component: Home,
});

type Phase = "idle" | "working" | "done" | "error";

type StepState = "pending" | "active" | "done";
type Step = { id: string; label: string; state: StepState; detail?: string };

const BASE_STEPS: Step[] = [
  { id: "fetch", label: "Récupération de la transcription", state: "pending" },
  { id: "write", label: "Réécriture éditoriale par chapitre", state: "pending" },
  { id: "front", label: "Titre, sommaire et introduction", state: "pending" },
  { id: "build", label: "Mise en page du livre", state: "pending" },
];

function Home() {
  const runTranscript = useServerFn(getTranscript);
  const runChapter = useServerFn(writeChapter);
  const runFront = useServerFn(writeFrontMatter);

  const [url, setUrl] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>(BASE_STEPS);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const patch = (id: string, state: StepState, detail?: string) =>
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, state, ...(detail ? { detail } : {}) } : s)),
    );

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "working") return;

    setPhase("working");
    setError(null);
    setBook(null);
    setCover(null);
    setProgress(2);
    setSteps(BASE_STEPS.map((s) => ({ ...s, state: "pending" })));

    try {
      patch("fetch", "active");
      const meta = await runTranscript({ data: { url } });
      setCover(meta.thumbnail);
      patch(
        "fetch",
        "done",
        `${meta.title} · ${Math.round(meta.totalChars / 1000)} k caractères · ${meta.chunks.length} chapitre(s)`,
      );
      setProgress(10);

      patch("write", "active", `0 / ${meta.chunks.length}`);
      const chapters: Chapter[] = [];
      const speakers = new Set<string>();

      for (const chunk of meta.chunks) {
        const previous = chapters[chapters.length - 1];
        const lastPara = previous?.paragraphs[previous.paragraphs.length - 1];
        const chapter = await runChapter({
          data: {
            chunk: chunk.text,
            index: chunk.index,
            total: meta.chunks.length,
            bookTitle: meta.title,
            sourceLang: meta.lang,
            targetLang: targetLang || null,
            previousSpeakers: [...speakers].slice(0, 12),
            previousEnding: (lastPara?.text ?? "").slice(-300),
          },
        });
        chapter.paragraphs.forEach((p) => p.speaker && speakers.add(p.speaker));
        chapters.push(chapter);
        patch("write", "active", `${chapters.length} / ${meta.chunks.length} — « ${chapter.title} »`);
        setProgress(10 + Math.round((chapters.length / meta.chunks.length) * 75));
      }
      patch("write", "done", `${chapters.length} chapitre(s) rédigé(s)`);

      patch("front", "active");
      const front = await runFront({
        data: {
          sourceTitle: meta.title,
          author: meta.author,
          chapterTitles: chapters.map((c) => c.title),
          excerpt: chapters[0]?.paragraphs.map((p) => p.text).join(" ") ?? "",
          targetLang: targetLang || null,
        },
      });
      patch("front", "done", front.title);
      setProgress(94);

      patch("build", "active");
      setBook({
        title: front.title,
        subtitle: front.subtitle,
        author: meta.author,
        intro: front.intro,
        sourceUrl: `https://www.youtube.com/watch?v=${meta.videoId}`,
        sourceTitle: meta.title,
        language: targetLang || meta.lang,
        chapters,
      });
      patch("build", "done");
      setProgress(100);
      setPhase("done");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur inattendue est survenue.");
      setPhase("error");
      setSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "pending" } : s)));
    }
  }

  async function exportFile(kind: "epub" | "pdf") {
    if (!book) return;
    setExporting(kind);
    try {
      const name = slugify(book.title);
      if (kind === "epub") {
        downloadBlob(buildEpub(book), `${name}.epub`);
      } else {
        downloadBlob(await buildPdf(book), `${name}.pdf`);
      }
    } catch {
      setError("La génération du fichier a échoué. Réessaie.");
    } finally {
      setExporting(null);
    }
  }

  const wordCount = useMemo(
    () =>
      book
        ? book.chapters.reduce(
            (a, c) => a + c.paragraphs.reduce((b, p) => b + p.text.split(/\s+/).length, 0),
            0,
          )
        : 0,
    [book],
  );

  const busy = phase === "working";

  return (
    <main className="min-h-screen">
      <section className="surface-night relative overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:pt-14">
          <header className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <BookOpen className="h-5 w-5" strokeWidth={2.2} />
            Podcastly
          </header>

          <div className="mx-auto mt-12 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="h-3.5 w-3.5" /> Podcast → eBook
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Votre épisode devient un livre.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-80 sm:text-lg">
              Collez un lien YouTube. On récupère la transcription, on l'édite avec les mots exacts de
              chaque intervenant, on traduit si vous le souhaitez, et vous repartez avec un eBook.
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
                    <Loader2 className="h-5 w-5 animate-spin" /> Génération…
                  </>
                ) : (
                  <>
                    Générer mon eBook <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
            <p className="px-2 pb-1 pt-3 text-xs opacity-70">
              Fonctionne avec toute vidéo disposant de sous-titres, même automatiques. Gratuit, sans
              inscription.
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
                title: "Édition, pas réécriture",
                text: "Ponctuation, paragraphes et locuteurs identifiés. Les mots restent ceux des intervenants.",
              },
              {
                icon: Download,
                title: "EPUB & PDF",
                text: "Sommaire, chapitres et couverture. L'EPUB s'envoie directement à votre Kindle.",
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

        {(busy || phase === "error" || phase === "done") && (
          <div className="card-soft overflow-hidden p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {phase === "done" ? "Livre prêt" : phase === "error" ? "Traitement interrompu" : "Fabrication en cours"}
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
                    {s.detail && (
                      <p className="truncate text-xs text-muted-foreground">{s.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {error && (
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

        {book && (
          <div ref={resultRef} className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
            <aside className="card-soft h-fit overflow-hidden">
              <div className="surface-night flex aspect-[3/4] flex-col justify-between p-6">
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    aria-hidden="true"
                    className="h-24 w-full rounded-lg object-cover opacity-40"
                  />
                )}
                <div>
                  <h3 className="font-display text-2xl font-bold leading-tight">{book.title}</h3>
                  <p className="mt-2 text-sm italic opacity-80">{book.subtitle}</p>
                  <p className="mt-6 text-xs uppercase tracking-widest opacity-70">{book.author}</p>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <p className="text-xs text-muted-foreground">
                  {book.chapters.length} chapitres · ~{wordCount.toLocaleString("fr-FR")} mots
                </p>
                <button
                  onClick={() => exportFile("epub")}
                  disabled={exporting !== null}
                  className="cta hover:cta-hover flex w-full items-center justify-center gap-2 px-5 py-3.5 disabled:opacity-70"
                >
                  {exporting === "epub" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Télécharger en EPUB
                </button>
                <button
                  onClick={() => exportFile("pdf")}
                  disabled={exporting !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-70"
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  Télécharger en PDF
                </button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Kindle : envoyez le fichier EPUB à votre adresse « Send to Kindle », Amazon le
                  convertit automatiquement au format Kindle.
                </p>
              </div>
            </aside>

            <article className="card-soft max-h-[720px] overflow-y-auto p-6 font-book sm:p-9">
              <h2 className="font-display text-3xl font-bold">{book.title}</h2>
              <p className="mt-2 italic text-muted-foreground">{book.subtitle}</p>
              {book.intro
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i} className="mt-4 leading-[1.75] text-muted-foreground">
                    {p}
                  </p>
                ))}
              {book.chapters.map((ch, i) => (
                <section key={i} className="mt-10 border-t border-border pt-8">
                  <h3 className="font-display text-xl font-semibold">
                    {i + 1}. {ch.title}
                  </h3>
                  {ch.paragraphs.map((p, j) => {
                    const prev = ch.paragraphs[j - 1];
                    const show = p.speaker && p.speaker !== prev?.speaker;
                    return (
                      <p key={j} className="mt-4 leading-[1.8]">
                        {show && (
                          <span className="mr-1 text-sm font-bold uppercase tracking-wide text-accent">
                            {p.speaker} :
                          </span>
                        )}
                        {p.text}
                      </p>
                    );
                  })}
                </section>
              ))}
            </article>
          </div>
        )}
      </div>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Podcastly · Transcriptions issues des sous-titres publics YouTube. Respectez les droits des
        auteurs.
      </footer>
    </main>
  );
}
