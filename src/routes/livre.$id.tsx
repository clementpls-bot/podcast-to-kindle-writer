import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Lock, XCircle } from "lucide-react";

import { getBookFn, generateNextChapterFn } from "@/lib/books.functions";
import { startCheckoutFn } from "@/lib/checkout.functions";
import { buildEpub, buildPdf, downloadBlob, slugify } from "@/lib/ebook-export";
import { formatPrice } from "@/lib/book-types";
import { BookReader } from "@/components/BookReader";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/livre/$id")({
  head: () => ({
    meta: [
      { title: "Votre livre — Podcastly" },
      {
        name: "description",
        content: "Lisez votre eBook généré depuis un podcast et téléchargez-le en EPUB ou PDF.",
      },
      { property: "og:title", content: "Votre livre — Podcastly" },
      {
        property: "og:description",
        content: "Un podcast transformé en livre : chapitres, notes de lecture et glossaire.",
      },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const router = useRouter();
  const load = useServerFn(getBookFn);
  const next = useServerFn(generateNextChapterFn);
  const checkout = useServerFn(startCheckoutFn);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ href: `/auth?next=${encodeURIComponent(`/livre/${id}`)}` });
    }
  }, [loading, user, router, id]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["book", id],
    queryFn: () => load({ data: { id } }),
    enabled: !!user,
  });

  async function pay() {
    setError(null);
    setBusy("pay");
    try {
      const { url } = await checkout({ data: { bookId: id } });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le paiement a échoué.");
      setBusy(null);
    }
  }

  async function writeRest() {
    setError(null);
    setBusy("write");
    try {
      for (;;) {
        const res = await next({ data: { id } });
        setNote(`${res.index} / ${res.total} chapitres rédigés`);
        if (res.done) break;
      }
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La rédaction a échoué.");
    } finally {
      setBusy(null);
    }
  }

  async function exportFile(kind: "epub" | "pdf") {
    if (!data) return;
    setBusy(kind);
    try {
      const name = slugify(data.book.title);
      if (kind === "epub") downloadBlob(buildEpub(data.book), `${name}.epub`);
      else downloadBlob(await buildPdf(data.book), `${name}.pdf`);
    } catch {
      setError("La génération du fichier a échoué.");
    } finally {
      setBusy(null);
    }
  }

  const paid = data?.status === "paid";
  const complete = data ? data.chaptersDone >= data.chaptersTotal : false;

  return (
    <main className="min-h-screen">
      <div className="surface-night px-5 py-8">
        <div className="mx-auto w-full max-w-5xl">
          <SiteHeader dark />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        {(loading || isLoading) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement du livre…
          </p>
        )}

        {data && (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <aside className="card-soft h-fit overflow-hidden">
              <div className="surface-night flex aspect-[3/4] flex-col justify-between p-6">
                {data.coverUrl && (
                  <img
                    src={data.coverUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-24 w-full rounded-lg object-cover opacity-40"
                  />
                )}
                <div>
                  <h1 className="font-display text-2xl font-bold leading-tight">
                    {data.book.title}
                  </h1>
                  <p className="mt-2 text-sm italic opacity-80">{data.book.subtitle}</p>
                  <p className="mt-6 text-xs uppercase tracking-widest opacity-70">
                    {data.book.author}
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-5">
                <p className="text-xs text-muted-foreground">
                  {data.chaptersDone} / {data.chaptersTotal} chapitres
                </p>

                {!paid && (
                  <>
                    <button
                      onClick={pay}
                      disabled={busy !== null}
                      className="cta hover:cta-hover flex w-full items-center justify-center gap-2 px-5 py-3.5 disabled:opacity-70"
                    >
                      {busy === "pay" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      Débloquer — {formatPrice()}
                    </button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Paiement unique. Les chapitres restants sont rédigés juste après.
                    </p>
                  </>
                )}

                {paid && !complete && (
                  <button
                    onClick={writeRest}
                    disabled={busy !== null}
                    className="cta hover:cta-hover flex w-full items-center justify-center gap-2 px-5 py-3.5 disabled:opacity-70"
                  >
                    {busy === "write" && <Loader2 className="h-4 w-4 animate-spin" />}
                    Rédiger la suite du livre
                  </button>
                )}

                {paid && (
                  <>
                    <button
                      onClick={() => exportFile("epub")}
                      disabled={busy !== null}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-70"
                    >
                      {busy === "epub" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Télécharger en EPUB
                    </button>
                    <button
                      onClick={() => exportFile("pdf")}
                      disabled={busy !== null}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-70"
                    >
                      {busy === "pdf" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Télécharger en PDF
                    </button>
                  </>
                )}

                {note && <p className="text-xs font-semibold text-accent">{note}</p>}
                {error && (
                  <p className="flex items-start gap-2 text-xs font-semibold text-destructive">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}
              </div>
            </aside>

            <BookReader book={data.book} />
          </div>
        )}
      </div>
    </main>
  );
}
