import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { BookOpen, Loader2, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ next: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Connexion — Podcastly" },
      {
        name: "description",
        content:
          "Connectez-vous à Podcastly pour débloquer vos eBooks et retrouver votre bibliothèque personnelle.",
      },
      { property: "og:title", content: "Connexion — Podcastly" },
      {
        property: "og:description",
        content: "Accédez à votre bibliothèque d'eBooks générés depuis vos podcasts préférés.",
      },
    ],
  }),
  component: AuthPage,
});

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function AuthPage() {
  const { next } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const target = safeNext(next);

  useEffect(() => {
    if (!loading && user) {
      router.navigate({ href: target });
    }
  }, [loading, user, target, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${target}` },
        });
        if (err) throw err;
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setNotice("Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connexion impossible.";
      setError(
        /invalid login/i.test(message)
          ? "E-mail ou mot de passe incorrect."
          : /already registered|already exists/i.test(message)
            ? "Un compte existe déjà avec cet e-mail. Connectez-vous."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("La connexion avec Google a échoué.");
      return;
    }
    if (result.redirected) return;
    navigate({ href: target } as never);
  }

  return (
    <main className="surface-night flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold">
          <BookOpen className="h-5 w-5" strokeWidth={2.2} /> Podcastly
        </div>

        <div className="card-soft mt-8 p-7 text-foreground sm:p-9">
          <h1 className="font-display text-2xl font-bold">
            {mode === "signin" ? "Content de vous revoir" : "Créer votre compte"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre compte garde vos livres au chaud : vous pouvez les retélécharger quand vous
            voulez, en EPUB comme en PDF.
          </p>

          <button
            onClick={google}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l-.1.2 3.7 2.8.2.1c2.3-2.2 3.6-5.3 3.6-8.9z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-.2.1-3.8 2.9v.2C3.2 21.3 7.3 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V9.5L1.3 6.6C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z"
              />
              <path
                fill="#EA4335"
                d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.9 3c.9-2.9 3.6-4.9 6.8-4.9z"
              />
            </svg>
            Continuer avec Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              autoComplete="email"
              aria-label="Adresse e-mail"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none ring-accent focus:ring-2"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe (6 caractères minimum)"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              aria-label="Mot de passe"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none ring-accent focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="cta hover:cta-hover flex w-full items-center justify-center gap-2 px-5 py-3.5 disabled:opacity-70"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          {error && (
            <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {notice && <p className="mt-4 text-sm font-semibold text-success">{notice}</p>}

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="mt-6 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            {mode === "signin"
              ? "Pas encore de compte ? Créer un compte"
              : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
    </main>
  );
}
