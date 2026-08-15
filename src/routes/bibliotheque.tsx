import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { listBooksFn } from "@/lib/books.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/bibliotheque")({
  head: () => ({
    meta: [
      { title: "Ma bibliothèque — Podcastly" },
      {
        name: "description",
        content: "Retrouvez tous les eBooks générés depuis vos podcasts et retéléchargez-les en EPUB ou PDF.",
      },
      { property: "og:title", content: "Ma bibliothèque — Podcastly" },
      {
        property: "og:description",
        content: "Vos livres générés depuis YouTube, disponibles à tout moment en EPUB et PDF.",
      },
    ],
  }),
  component: Library,
});

function Library() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const run = useServerFn(listBooksFn);

  useEffect(() => {
    if (!loading && !user) router.navigate({ href: "/auth?next=%2Fbibliotheque" });
  }, [loading, user, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["books", user?.id],
    queryFn: () => run({ data: undefined }),
    enabled: !!user,
  });

  return (
    <main className="min-h-screen">
      <div className="surface-night px-5 py-8">
        <div className="mx-auto w-full max-w-5xl">
          <SiteHeader dark />
          <h1 className="mt-10 font-display text-3xl font-bold sm:text-4xl">Ma bibliothèque</h1>
          <p className="mt-2 text-sm opacity-80">Tous vos livres, prêts à relire et à retélécharger.</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        {(loading || isLoading) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        )}
        {error && (
          <p className="text-sm font-semibold text-destructive">
            Impossible de charger votre bibliothèque.
          </p>
        )}
        {data && data.length === 0 && (
          <div className="card-soft p-8 text-center">
            <p className="font-semibold">Aucun livre pour l'instant.</p>
            <Link to="/" className="mt-3 inline-block text-sm font-semibold text-accent underline underline-offset-4">
              Créer mon premier eBook
            </Link>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((b) => (
            <Link
              key={b.id}
              to="/livre/$id"
              params={{ id: b.id }}
              className="card-soft overflow-hidden transition-transform hover:-translate-y-0.5"
            >
              <div className="surface-night flex aspect-[3/2] flex-col justify-end p-5">
                <p className="font-display text-lg font-bold leading-tight">{b.book.title}</p>
                <p className="mt-1 text-xs italic opacity-80">{b.book.subtitle}</p>
              </div>
              <div className="p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{b.book.author}</p>
                <p className="mt-1">
                  {b.status === "paid"
                    ? `${b.chaptersDone} / ${b.chaptersTotal} chapitres`
                    : "Aperçu — non débloqué"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
