import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ouverture du paiement unique (2,89 € par livre).
 * Le fournisseur de paiement n'est pas encore branché sur ce projet : la fonction
 * renvoie une erreur explicite plutôt que de débloquer un livre sans encaissement.
 */
export const startCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ bookId: z.string().uuid() }).parse(data))
  .handler(async (): Promise<{ url: string }> => {
    throw new Error(
      "Le paiement n'est pas encore activé sur ce projet. Activez les paiements intégrés (plan payant) pour encaisser les 2,89 €.",
    );
  });
