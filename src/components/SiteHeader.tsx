import { Link } from "@tanstack/react-router";
import { BookOpen, Library, LogOut } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  const { user, signOut } = useAuth();
  const subtle = dark ? "opacity-80 hover:opacity-100" : "text-muted-foreground hover:text-foreground";

  return (
    <header className="flex items-center justify-between gap-4 text-sm font-semibold tracking-tight">
      <Link to="/" className="flex items-center gap-2">
        <BookOpen className="h-5 w-5" strokeWidth={2.2} />
        Podcastly
      </Link>
      <nav className="flex items-center gap-4">
        {user ? (
          <>
            <Link to="/bibliotheque" className={`inline-flex items-center gap-1.5 ${subtle}`}>
              <Library className="h-4 w-4" /> Ma bibliothèque
            </Link>
            <button
              onClick={() => signOut()}
              className={`inline-flex items-center gap-1.5 ${subtle}`}
              aria-label="Se déconnecter"
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          </>
        ) : (
          <Link to="/auth" className={subtle}>
            Se connecter
          </Link>
        )}
      </nav>
    </header>
  );
}
