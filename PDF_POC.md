# PoC PDF local

Démarrer depuis la racine avec `npm.cmd run poc`. Prérequis : Node.js 22.12+
et les outils de développement Tauri v2 (Rust, outils C++ Windows et WebView2).
Le point d’entrée `pdf-poc.html` est isolé ; aucun transport backend n’est installé.

1. Créer `Documents/Viewer-PDF-PoC` dans le dossier Documents résolu par Windows.
2. Y copier un PDF multipage avec l’extension `.pdf`, sans sous-dossier.
3. Saisir son chemin absolu dans le formulaire, puis choisir **Ouvrir**.
4. Vérifier les pages, leur ratio et le défilement vertical dans la View.
5. Choisir **Envoyer CLOSE** pour injecter une commande backend de test et nettoyer
   le renderer. Le bouton X produit seulement une demande CLOSE : sans backend,
   il ne supprime pas la fenêtre.
6. Répéter avec un chemin inexistant, un fichier `.pdf` contenant des données
   invalides et une fermeture immédiate pendant le chargement. Les erreurs de
   rendu apparaissent dans la console WebView ; elles ne changent pas OPENED.

`CLS_RenderPDF` hérite de `CLS_RenderGeneric`, convertit le chemin avec Tauri,
charge PDF.js et son worker depuis le build local, puis rend les pages dans des
canvas successifs. Chaque viewport est calculé à la largeur disponible ; le CSS
conserve le ratio. Le PoC n’effectue pas de nouveau rendu lors d’un redimensionnement.
La fermeture invalide les continuations asynchrones, annule le rendu actif,
détruit la tâche de chargement/document et vide uniquement le contenu.
La destruction PDF.js se termine de façon asynchrone après l’invalidation immédiate.

OPENED confirme la création de la fenêtre HTML avant la fin du chargement PDF.
Les autres types de fichiers conservent leur traitement différé.

Fichiers concernés :

- `frontend/domain/renderer/CLS_RenderPDF.js` remplace le stub `CLS_PDFRenderer.js`.
- `frontend/domain/CLS_View.js`, `frontend/domain/DUT/ENUM/E_FileType.js`,
  `frontend/styles.css` et `frontend/index.html` connectent le renderer.
- `frontend/pdf-poc.html`, `frontend/pdf-poc.js` fournissent le formulaire de test.
- `vite.config.mjs`, `package.json`, `package-lock.json` empaquettent les modules
  et le worker sans CDN : `pdfjs-dist` 5.4.624, `@tauri-apps/api` 2.10.1,
  Vite 8.3.4 (outil de build).
- `src-tauri/tauri.conf.json`, `src-tauri/tauri.poc.conf.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` configurent le PoC et
  `protocol-asset`. Le scope est limité à `$DOCUMENT/Viewer-PDF-PoC/*.pdf`.
  La CSP existante (`null`) est conservée ; aucune permission de tout le disque
  ni plugin filesystem n’est ajouté.
- `tests/render-pdf.test.mjs`, `tests/frontend-controller.test.mjs` vérifient le
  rendu simulé et le cycle de vie.

Validation exécutée :

```powershell
node --test tests/frontend-controller.test.mjs tests/render-generic.test.mjs tests/render-pdf.test.mjs
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml
```

31 tests unitaires réussis ; build frontend et compilation de vérification Tauri
réussis. Les tests utilisent des doubles DOM/PDF.js, pas une WebView Tauri.
Ils couvrent les trois pages, la largeur, les erreurs de chargement, l’annulation,
la conservation du conteneur, l’identité sectionId et OPENED sans attendre le rendu.
La suite complète inclut deux tests Python qui ont échoué parce que la commande
`python` ne trouve pas d’interpréteur dans cet environnement.
Les vérifications visuelles et le chargement local dans Tauri restent à effectuer :
aucun navigateur ni application contrôlable n’est exposé par les outils UI.

Références : [exemples PDF.js](https://mozilla.github.io/pdf.js/examples/),
[convertFileSrc Tauri](https://v2.tauri.app/reference/javascript/api/namespacecore/#convertfilesrc).
