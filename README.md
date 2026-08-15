# Book From Bytes

# PROMPT POUR LOVABLE - GÉNÉRATEUR PODCAST → EBOOK AZW3

## 1. OBJECTIF GLOBAL (OUTCOME)

Je veux construire une application web full-stack avec Lovable. Le produit final est un site SaaS qui permet à un utilisateur de coller un lien YouTube, et qui génère automatiquement un eBook au format AZW3 (prêt pour Kindle) à télécharger.

Le site doit avoir une interface "one-click" : l'utilisateur colle un lien, le site s'occupe de tout en arrière-plan (transcription, traduction, réécriture, mise en page), et lui propose un téléchargement direct.

## 2. CONTEXTE ET INSPIRATION (CONTEXT)

**Pourquoi cette idée ?** Il existe des projets open source comme `Podlr` ou `ai-shu` qui prouvent que le concept est techniquement viable : ils transforment des vidéos YouTube en eBooks via l'IA [citation:11][citation:5]. Mais ce sont des outils à installer en local, pas des services en ligne prêts à l'emploi.

**Ce qui fait la différence :**

- Aucune solution open source n'offre de **traduction intégrée** et un export direct en **AZW3** (format Kindle) de manière fluide.

- Le marché existe : les créateurs de contenu veulent "repurposer" leurs podcasts en livres pour toucher une audience de lecteurs sur Amazon.

**User persona visé :** Créateurs de contenu (podcasteurs, YouTubers) qui veulent transformer leur contenu audio/vidéo en livre numérique pour le vendre ou l'offrir à leur communauté.

## 3. FONCTIONNALITÉS DÉTAILLÉES (REQUIREMENTS)

### Étape 1 : Interface utilisateur (Frontend)

- Une page d'accueil épurée avec un grand champ de texte où l'utilisateur colle l'URL de sa vidéo YouTube ou de son podcast.

- Un gros bouton "Générer mon eBook" pour lancer le processus.

- Une barre de progression qui affiche l'avancement en temps réel (ex: "Transcription en cours...", "Traduction...", "Mise en page...").

- Une page de résultat avec un aperçu du livre et un bouton "Télécharger en AZW3".

### Étape 2 : Traitement backend (Cœur du produit)

- **Transcription** : Utiliser l'API OpenAI Whisper pour transcrire l'audio de la vidéo en texte [citation:4][citation:8].

- **Traduction (optionnelle)** : Permettre à l'utilisateur de choisir une langue cible. Utiliser GPT-4 pour traduire la transcription [citation:12].

- **Réécriture** : Utiliser GPT-4 pour retravailler le texte : supprimer les hésitations, améliorer la ponctuation, reformuler les phrases pour un rendu agréable à lire à l'écrit (style article de magazine) [citation:3][citation:7].

- **Mise en page** : Structurer le texte en chapitres (basés sur les sections naturelles de la vidéo ou la durée), ajouter un sommaire, une couverture (générée via une API comme Replicate ou simplement un titre stylisé) [citation:8][citation:11].

### Étape 3 : Génération et export de l'eBook

- Générer un fichier EPUB (format standard) à partir du texte structuré.

- **Convertir l'EPUB en AZW3** (ou proposer les deux formats). AZW3 est le format d'Amazon pour Kindle.

- Proposer le téléchargement du fichier à l'utilisateur.

### Étape 4 : Monétisation (pour atteindre les 500€/mois)

- Modèle "Freemium" : version gratuite avec export en PDF (limité), version payante (5-10€) pour l'export en AZW3 et les options de traduction [citation:6].

- Intégrer Stripe pour les paiements.

## 4. CONTRAINTES TECHNIQUES ET DESIGN (CONSTRAINTS)

### Stack technique

- Utiliser **Lovable Cloud** pour le backend (base de données, authentification, stockage), qui est basé sur Supabase et gère tout automatiquement [citation:6].

- Pour les appels API externes (OpenAI, Replicate), utiliser les **Edge Functions** de Lovable pour garder les clés API sécurisées côté serveur [citation:4][citation:8].

### Design UI/UX

- Style épuré, moderne et professionnel. Choisis une palette de couleurs qui inspire la confiance et la clarté (ex: bleu nuit, blanc, gris clair, avec une touche de couleur vive pour les CTA).

- L'interface doit être responsive (adaptée aux mobiles et aux ordinateurs).

- L'utilisateur doit avoir un feedback constant (ne jamais le laisser sans savoir ce qui se passe).

### Règles de développement

- **Construire par étapes** : Commencer par l'interface et la transcription, puis ajouter les fonctionnalités une par une (traduction, réécriture, conversion AZW3) [citation:2].

- **Tester au fur et à mesure** : À chaque ajout, vérifier que l'application fonctionne dans la prévisualisation en direct.

- **Utiliser le Plan Mode** : Avant de coder une fonctionnalité complexe, activer le **Plan Mode** pour que Lovable détaille son approche. Approuver le plan avant de le laisser coder [citation:6][citation:13].

## 5. CRITÈRES D'ACCEPTATION (ACCEPTANCE CRITERIA)

- [ ] L'utilisateur peut coller un lien YouTube et lancer le traitement.

- [ ] La transcription est générée avec succès (même pour une vidéo de 30 min).

- [ ] Le texte final est fluide, bien ponctué et agréable à lire.

- [ ] Le fichier AZW3 est généré et peut être téléchargé.

- [ ] L'application est déployée en ligne (publik.lovable.app) et accessible.

---

**Question de clarification** : Pour la réécriture du texte (étape 2), souhaites-tu que le ton soit plutôt "académique", "journalistique" (comme un article de magazine) ou "pédagogique" (comme un guide pratique) ? Je te suggère de commencer par un style "article de magazine" (informatif et fluide) [citation:3][citation:7], car c'est le plus polyvalent pour toucher un large public.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5f24e97a-4158-4b2c-afbc-60d0baa0849b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
