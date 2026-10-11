# PoC de trois PDF et traces CMD

Ce harness simule localement les layouts validés dans
[Viewer — Backend](https://app.notion.com/p/3e9910a18a728146a5f3ff336a7a32f8).
Il ne connecte ni le backend Python ni son LayoutManager. Les événements sortants
restent des JSON préparés localement, sans transport métier.

## Démarrage et procédure manuelle

Depuis la racine, dans CMD :

```cmd
npm run poc
```

Sous PowerShell avec la politique de scripts actuelle : `npm.cmd run poc`.
Prérequis : Node.js compatible avec Vite, Rust, outils C++ Windows et WebView2.
Aucune dépendance supplémentaire n’a été ajoutée pour cette extension du PoC.

1. Copier trois PDF multipages dans le dossier Windows Documents/Viewer-PDF-PoC,
   extension `.pdf`, sans sous-dossier. L’assetProtocol reste limité à
   `$DOCUMENT/Viewer-PDF-PoC/*.pdf` ; aucune permission disque n’est élargie.
2. Saisir les trois chemins absolus dans les champs `pdf-poc-1`, `pdf-poc-2`,
   `pdf-poc-3`. Ouvrir 1, puis 2, puis 3, ou utiliser **Ouvrir les trois PDF**.
   Ce dernier bouton ouvre uniquement les identifiants encore libres.
3. Vérifier les dispositions : une fenêtre centrée de largeur/hauteur moitié ;
   deux fenêtres côte à côte de hauteur entière ; trois fenêtres de mêmes
   dimensions, deux en haut et la troisième centrée en bas.
4. Faire défiler chaque document indépendamment. Les layouts utilisent la surface
   HTML restante sous les contrôles, mesurée réellement ; le redimensionnement
   de cette surface recalcule aussi les géométries de test.
5. Cliquer **CLOSE 2** : seules les ressources de PDF 2 sont libérées, les deux
   autres fenêtres se redisposent. Fermer les autres PDF, puis rouvrir PDF 2.
6. Cliquer de nouveau **Ouvrir 2** lorsqu’il est actif : le doublon est rejeté.
7. Cliquer X : le statut devient CLOSE (demande), la fenêtre reste ouverte.
   Seuls les boutons CLOSE injectent explicitement une commande autorisée de test.
8. Tester un chemin inexistant, un PDF invalide et un PDF situé hors du scope
   autorisé. La fenêtre reste OPENED et le statut indique l’erreur de rendu.
   Tester également CLOSE immédiatement après OPEN.
9. Vérifier les traces dans le CMD de lancement et dans les DevTools. Décocher
   **Traces DevTools + CMD** pour désactiver les nouvelles traces. Les envois
   déjà en file peuvent encore se terminer.

## Harness et ownership

Le harness prépare les enveloppes COMMAND inchangées et appelle
`CLS_BackendBridge.receive_Message()`. Les confirmations suivent le parcours
EventManager → FrontendController → BackendBridge.
Le simulateur ajuste directement le DOM des Views de test après OPEN/CLOSE ;
il conserve les jobs d’ouverture sans les modifier et ne crée pas UPDATE_LAYOUT.
Le registre `mapViews` reste la seule source des références aux Views actives.

OPENED confirme uniquement la création de la fenêtre HTML, sans attendre PDF.js.
Chaque View possède son DOM, chaque renderer possède ses tâches/document PDF.
La fermeture invalide immédiatement les continuations et vide le contenu ; la
destruction PDF.js finit de façon asynchrone. Les canvas conservent leur ratio
via CSS lorsque leur largeur change ; aucun nouveau rendu haute résolution
au redimensionnement n’a été ajouté.

## Diagnostic JavaScript → Rust → stdout

`trace_Execution()` produit des snapshots JSON horodatés et numérotés. Les messages
apparaissent immédiatement dans les DevTools. Une file de promesses appelle
séquentiellement `invoke('trace_execution', { message })` pour préserver leur
ordre dans CMD sans attendre dans les méthodes métier.
La commande Rust écrit et flush stdout ; elle est définie et enregistrée uniquement
sous `#[cfg(debug_assertions)]`. Le frontend active le relais uniquement sous
`import.meta.env.DEV` et dans Tauri. Un échec de relais est signalé dans la console
et ne bloque ni la file suivante ni le rendu.
Mécanisme officiel : [commandes Tauri 2](https://v2.tauri.app/develop/calling-rust/).

L’instrumentation s’installe depuis le seul point d’entrée PoC. Ses observateurs
préservent les résultats synchrones, les promesses originales et les exceptions.
Les seules additions dans les classes sont les traces de construction et les
étapes internes PDF (chargement, pages, annulation/destruction). Les autres
renderers spécialisés sont inchangés.
Les arguments sont limités aux champs du contrat. Les snapshots omettent les
DOM, objets PDF.js, références circulaires et buffers ; aucun contenu de page ni
binaire PDF n’est enregistré.

Méthodes observées :

- `CLS_BackendBridge` : `receive_Message`, `convert_Data_From_Backend_To_Frontend`,
  `send_Data_To_Frontend_Controller`, `convert_Data_From_Frontend_To_Backend`, `send_Message`.
- `CLS_FrontendController` : `process_Command`, `get_View`, `process_Event`, avec
  nombre et identifiants de `mapViews` à l’entrée/sortie.
- `CLS_EventManager` : `event_Processing` et `ST_FrontendEvent` normalisé.
- `CLS_View` : `constructor`, `execute_Command`, `create_Container`,
  `choose_Special_Renderer`, `request_Close`, `release_View_Resources`.
- `CLS_RenderGeneric` : `constructor`, `convert_file_path_In_URL`, `release_Render_Resources`.
- `CLS_RenderPDF` : `constructor`, `load_PDF_Library`, `render`, `release_Render_Resources`,
  début/fin du document et de chaque page, nombre de pages et destruction.
- Harness : `send_Test_Command`, `reflow_Test_Layouts`, avec enveloppe,
  chemin, `ST_JobLayout` simulé et liste des sections actives.

Exemple illustratif abrégé (numéros/temps varient ; l’ordre réel est conservé) :

```text
[TRACE 001] 2026-10-11T10:00:00.001Z PDF_PoC.send_Test_Command START sectionId=pdf-poc-1
{"envelope":{"messageType":"COMMAND","data":{"commandType":"OPEN","sectionId":"pdf-poc-1",...}}}
[TRACE 002] ... CLS_BackendBridge.receive_Message ENTER sectionId=pdf-poc-1
[TRACE 010] ... CLS_RenderPDF.render START sectionId=pdf-poc-1
[TRACE 013] ... CLS_EventManager.event_Processing ENTER sectionId=pdf-poc-1
{"stFrontendEvent":{"eventType":"OPENED","sectionId":"pdf-poc-1"}}
[TRACE 025] ... CLS_RenderPDF.render COMPLETE sectionId=pdf-poc-1
{"operation":"loadDocument","numPages":3}
[TRACE 026] ... CLS_RenderPDF.render START sectionId=pdf-poc-1
{"operation":"renderPage","pageNumber":1}
[TRACE 027] ... CLS_RenderPDF.render COMPLETE sectionId=pdf-poc-1
{"operation":"renderPage","pageNumber":1}
[TRACE 040] ... PDF_PoC.send_Test_Command START sectionId=pdf-poc-2
{"envelope":{"messageType":"COMMAND","data":{"commandType":"CLOSE","sectionId":"pdf-poc-2"}}}
[TRACE 045] ... CLS_RenderPDF.release_Render_Resources START sectionId=pdf-poc-2
{"operation":"cancelAndDestroy","activeRender":false,"activeLoading":true}
[TRACE 050] ... CLS_EventManager.event_Processing ENTER sectionId=pdf-poc-2
{"stFrontendEvent":{"eventType":"CLOSED","sectionId":"pdf-poc-2"}}
```

## Fichiers de cette extension

Créés : `frontend/pdf-poc-harness.js`, `frontend/pdf-poc-instrumentation.js`,
`frontend/trace-execution.js`, `tests/pdf-poc.test.mjs`.

Modifiés : `frontend/pdf-poc.html`, `frontend/pdf-poc.js`, `frontend/styles.css`,
`frontend/domain/CLS_View.js`, `frontend/domain/renderer/CLS_RenderGeneric.js`,
`frontend/domain/renderer/CLS_RenderPDF.js`, `src-tauri/src/lib.rs`, `PDF_POC.md`.

AGENTS.md, Notion, les contrats métier et le backend Python restent inchangés.
Aucune commande Git n’est exécutée.

## Validation

`npm.cmd test` : **38 tests réussis**, y compris les deux tests de contrat Python.
Les nouveaux tests vérifient les layouts à 1/2/3, les dimensions impaires,
l’absence de chevauchement, les instances distinctes, les événements préparés,
les doublons, X sans destruction, CLOSE ciblé, la réouverture, le recalcul et la
conservation des jobs, ainsi que la file de traces et ses échecs.
Ils utilisent des doubles DOM/PDF.js : ils ne testent pas le LayoutManager Python.

`npm.cmd run build` et `cargo check --manifest-path src-tauri/Cargo.toml --offline`
réussissent. Les tests graphiques, l’accès réel assetProtocol et l’affichage du
relais WebView → CMD restent à effectuer sous Tauri avec la procédure ci-dessus.
Aucune surface navigateur/application contrôlable n’est exposée dans cet environnement.
