# Vprono

Paris sportifs entre potes, avec les vrais matchs et zéro euro en jeu. Appli web installable (PWA) : sur téléphone, « Ajouter à l'écran d'accueil » ; sur ordinateur, « Installer » dans Chrome ou Edge.

## Ce qu'il y a dedans

| Dossier / fichier | Rôle |
|---|---|
| `index.html` | L'appli (interface Liquid Glass, matchs, ticket, groupes, chat, classement, mini-jeux) |
| `js/app.js` | Logique de l'appli : paris, règlement automatique, groupes, mini-jeux |
| `js/store.js` | Accès aux données (Supabase : base, comptes, temps réel) |
| `js/auth.js` | Inscription, connexion, mot de passe oublié |
| `js/install.js` | Tutoriel d'installation selon l'appareil (iPhone, Android, ordi) |
| `config.js` | Adresse et clé publique du projet Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Ce qui rend l'appli installable et utilisable hors connexion |
| `supabase/schema.sql` | Tables et règles de sécurité de la base |
| `sync/sync.py` | Mise à jour des matchs : calendrier, cotes, compos, résultats |

## Mise en route

1. **Supabase** (gratuit) : crée un projet sur supabase.com.
   - *SQL Editor → New query* : colle `supabase/schema.sql`, puis *Run*.
   - *Authentication → Sign In / Providers → Email* : laisse « Email » activé. Pour simplifier l'inscription de tes amis, tu peux désactiver « Confirm email ».
   - *Authentication → URL Configuration* : mets l'adresse du site (étape 2) dans « Site URL ».
   - *Project Settings → API Keys* : copie l'URL du projet et la clé **publishable** dans `config.js`.
2. **Hébergement** (gratuit) : GitHub Pages (*Settings → Pages → Deploy from a branch → main / root*) ou Vercel / Netlify (import du dépôt, aucun build).
3. **Mise à jour des matchs** : `sync/sync.py` (voir plus bas), lancé par une tâche planifiée Claude 3 fois par jour.

## Mise à jour des matchs

```
python3 sync/sync.py fetch --supabase https://<projet>.supabase.co --base-dir work/db --out work/out
python3 sync/sync.py plan  --base-dir work/db --out work/out          # ce qu'il faut chercher (résultats, compos)
python3 sync/sync.py build --base-dir work/db --research work/research.json --out work/out
python3 sync/sync.py push  --supabase https://<projet>.supabase.co --out work/out
```

La clé **secrète** Supabase (`sb_secret_…`) n'est jamais dans le code : dans la session Claude elle est ajoutée par le proxy réseau (en-tête `apikey`) ; ailleurs, mets-la dans la variable `VPRONO_SUPABASE_KEY`.

## Limites connues

- Les soldes sont calculés dans l'appli de chaque joueur : quelqu'un de très motivé pourrait tricher en modifiant son propre solde. Pour un usage entre amis ça suffit ; pour un classement public, il faudra déplacer le règlement des paris côté serveur.
- Les cotes sont estimées par un modèle (pas de flux bookmaker gratuit pour la saison en cours). Les compos et résultats viennent de recherches web : elles peuvent avoir du retard.
