# Podcastly V2 — Comptes, paiement à l'unité et édition IA enrichie

Trois chantiers : (1) un compte utilisateur avec bibliothèque, (2) le paiement unique de 2,89 € par eBook après un aperçu gratuit, (3) une IA d'édition plus attentive au confort de lecture, avec sélecteur de ton.

## 1. Comptes et bibliothèque

Activation de Lovable Cloud (base de données + authentification intégrées).

- Inscription / connexion par e-mail et mot de passe, sur une page `/auth` dédiée au design actuel (bleu nuit + accent orange).
- Le lecteur peut coller un lien et lancer l'aperçu **sans être connecté** ; la connexion est demandée au moment de payer.
- Page `/bibliotheque` : liste des livres achetés, avec re-téléchargement EPUB et PDF illimité.
- Chaque livre généré est enregistré côté serveur (contenu complet en JSON), donc plus rien n'est perdu à la fermeture de l'onglet.

## 2. Paiement — 2,89 € par eBook

Parcours retenu : **aperçu gratuit, puis paiement**.

1. Le lecteur colle son lien, choisit langue et ton, lance la génération.
2. Le premier chapitre seulement est édité par l'IA → affiché en entier, avec le sommaire estimé, la durée, le nombre de chapitres et la couverture.
3. Le reste est flouté avec un appel à l'action « Débloquer le livre complet — 2,89 € ».
4. Paiement → génération complète des chapitres restants → téléchargements EPUB et PDF débloqués et sauvegardés dans la bibliothèque.

Ce découpage évite de brûler des crédits IA sur un livre entier jamais acheté : seul le premier chapitre est offert.

Garde-fous nécessaires : limite du nombre d'aperçus gratuits par compte et par adresse IP (par ex. 3 par jour), et refus des vidéos sans sous-titres avant tout appel IA.

**Prérequis** : les paiements intégrés Lovable demandent un espace de travail en plan Pro. Tant que ce n'est pas le cas, deux options : passer au plan Pro pour utiliser le paiement intégré (aucun compte Stripe à créer), ou brancher ton propre compte Stripe avec tes clés API. Il faudra trancher avant d'implémenter cette partie.

## 3. Édition IA : ton et confort de lecture

### Sélecteur de ton

Bloc soigné dans le formulaire, introduit par « Quel ton voulez-vous donner à votre lecture ? », avec des cartes cliquables plutôt qu'un menu déroulant :

- **Entretien** — fidèle au dialogue, locuteurs identifiés (comportement actuel, par défaut)
- **Magazine** — récit fluide à la troisième personne, chapeaux introductifs
- **Pédagogique** — structuré, explicatif, points clés en fin de chapitre
- **Essai** — plus littéraire, phrases longues, transitions travaillées

Chaque ton modifie les consignes envoyées au modèle. La règle absolue reste inchangée dans tous les cas : aucun propos inventé, les mots des intervenants sont préservés.

### Quatre niveaux d'aide au lecteur

L'IA reçoit une nouvelle mission : repérer les passages où un lecteur qui n'a pas écouté l'épisode décroche (jargon, référence à quelque chose dit hors-champ, personne ou entreprise citée sans contexte, sous-entendu visuel). Selon la gravité, elle choisit :

1. **Mots de liaison intégrés** — 2 ou 3 mots glissés dans la phrase pour la rendre lisible, sans changer le sens. Réservé aux cas légers.
2. **Encadré « Note »** — un bloc visuellement distinct, hors du discours, quand un contexte de 1 à 3 phrases est nécessaire.
3. **Note de fin de chapitre** — appel numéroté dans le texte, explication regroupée en fin de chapitre, pour les précisions qui casseraient le rythme.
4. **Glossaire** — les termes techniques et acronymes sont collectés au fil des chapitres et définis dans une annexe en fin de livre.

Tout ce qui est ajouté par l'IA est visuellement marqué comme éditorial : le lecteur ne confond jamais une note avec les propos d'un intervenant.

## Détails techniques

- **Base de données** : tables `profiles`, `books` (contenu JSON, statut `preview` / `paid`, url source, ton, langue), `orders` (montant, statut, référence paiement). RLS stricte : chaque utilisateur ne lit que ses propres lignes ; le contenu complet d'un livre n'est servi que si la commande liée est payée. Grants explicites pour `authenticated` et `service_role`.
- **Génération** : `ai.server.ts` passe d'un format `{title, paragraphs}` à `{title, blocks[], footnotes[], glossary[]}`, où un bloc est soit `speech` (locuteur + texte), soit `note` (encadré). `EDITORIAL_RULES` devient une fonction paramétrée par le ton, avec un bloc de règles commun sur le confort de lecture.
- **Prompt** : ajout d'une passe de détection explicite avant rédaction (« pour chaque passage, un lecteur non auditeur comprend-il ? »), et d'un budget maximum de notes par chapitre pour éviter la surcharge.
- **Exports** : `ebook-export.ts` étendu — style dédié aux encadrés dans le CSS EPUB (fond clair, bordure gauche orange, italique), section de notes en fin de chapitre avec ancres, page glossaire ajoutée au manifeste, à la spine et au sommaire. Même traitement en PDF (cadre gris, notes en petit corps, page glossaire).
- **Paiement** : la génération complète et l'accès au contenu payant passent par des server functions authentifiées ; le déblocage n'est jamais décidé côté navigateur. Le webhook du prestataire de paiement bascule la commande en `paid`.
- **Découpage** : la génération complète reprend chapitre par chapitre et sauvegarde au fur et à mesure, pour qu'un échec au milieu d'un long épisode ne perde pas le travail déjà payé.

## Hors de ce plan

CGV, mentions légales et politique de remboursement (obligatoires avant la mise en vente réelle), et l'export AZW3 qui reste impossible sur ce runtime — Kindle passe par « Envoyer vers Kindle » avec l'EPUB.
