# AGENTS.md — Viewer Frontend

## Purpose
This repository contains the frontend of the Viewer / DisplaySystem.
Codex must implement the architecture defined by the project. It must not redesign the architecture on its own.

The Viewer is separate from the Display Manager:
- Display Manager is the higher-level service that decides who/what may be displayed.
- Viewer / DisplaySystem is the application that displays content on a target screen.

## V1 technology
- Use native HTML, CSS and JavaScript.
- Do not add a frontend framework or UI framework unless explicitly requested.
- Keep frontend and backend independent. Do not move backend code into this repository.
- The backend currently uses Python and pywebview for the application/WebView integration.

## Project structure
Keep responsibilities grouped as follows:

frontend/
- application/
  - FrontendController.js
  - ViewManager.js
  - EventManager.js
- domain/
  - View.js
  - renderer/
    - FrontendRenderer.js
    - PDFRenderer.js
    - ImageRenderer.js
    - VideoRenderer.js
    - TextRenderer.js
- infrastructure/
  - BackendBridge.js
- index.html
- styles.css

Do not create new architectural layers or move responsibilities between layers without explicit approval.

## Naming convention
Use the project naming convention consistently:
- Classes: `CLS_...`
  - Example: `CLS_BackendBridge`, `CLS_FrontendController`, `CLS_ViewManager`, `CLS_View`
- Class instances: `cls...`
  - Example: `clsBackendBridge`, `clsFrontendController`, `clsView`
- Data structures: `ST_...`
  - Example: `ST_FrontendJob`, `ST_FrontendEvent`
- Structure instances: `st...`
  - Example: `stFrontendJob`, `stFrontendEvent`
- Enums: `E_...`
  - Example: `E_FrontendEvent`, `E_FileType`

Do not silently rename existing architectural concepts.

## Core runtime flow
The required frontend input flow is:

Backend
→ CLS_BackendBridge
→ CLS_FrontendController
→ CLS_ViewManager
→ CLS_View
→ specialized Renderer
→ DOM

The event/return flow is:

CLS_View
→ CLS_EventManager
→ CLS_FrontendController
→ CLS_ViewManager for local View actions
and/or
→ CLS_BackendBridge
→ Backend

`CLS_FrontendController` is the central frontend orchestrator. Do not bypass it by directly connecting managers to the backend.

## CLS_BackendBridge
Responsibilities:
- It is the frontend technical boundary toward the backend.
- Receive backend-side data.
- Perform only the technical conversion/deserialization required to obtain clean JavaScript-side data.
- Pass normalized frontend data to `CLS_FrontendController`.
- Send frontend-to-backend data to the backend.

Rules:
- Do not put business decisions in the bridge.
- Do not enrich backend jobs with invented fields.
- Do not confuse this frontend `CLS_BackendBridge` with the backend-side `CLS_FrontendBridge`.
- Do not assume JSON is the final transport contract unless explicitly established. pywebview is the current integration technology.

## CLS_FrontendController
Responsibilities:
- Central orchestration and routing.
- Receive `stFrontendJob` from `CLS_BackendBridge`.
- Pass the same `stFrontendJob` to `CLS_ViewManager`; do not rebuild it unnecessarily.
- Receive `stFrontendEvent` from `CLS_EventManager`.
- Decide the required local frontend action.
- Build the frontend-to-backend data required for backend notification.
- Pass backend-bound data to `CLS_BackendBridge`.

Do not move DOM construction, rendering or View storage into this class.

## CLS_ViewManager
Responsibilities:
- Manage all active `CLS_View` instances.
- Create Views from `stFrontendJob`.
- Store active Views in a dictionary/map.
- Locate, close and remove Views.

Identity rule:
`dicViews[sectionId] = clsView`

V1 lifecycle:
- `createView(stFrontendJob)`
- `closeView(sectionId)`
- `removeView(sectionId)`

Rules:
- `sectionId` is the identity supplied by the backend.
- Do not invent a separate `jobId`.
- The dictionary contains View instances, not jobs.
- ViewManager does not build the View DOM itself.
- Do not implement hide/show in V1 unless explicitly requested.

## CLS_View
Responsibilities:
- Represent one independent visual container/window/zone.
- Retain its `stFrontendJob`.
- Create and manage its own DOM container.
- Use `stJobLayout` to position and size the container.
- Use `fileType` to choose the correct specialized Renderer.
- Provide `filePath` to the Renderer.
- Keep `sectionId` for identity and events.
- Handle interactions that belong to the whole View, including CLOSE.

Rules:
- Borders, dimensions, position, rounded corners and View-level styling belong to the View/CSS, not to the Renderer.
- `fileName` remains available to the View and is not required by the Renderer in V1 unless needed later.

## Renderers
`FrontendRenderer` is the base renderer abstraction.
Specialized renderers:
- `PDFRenderer`
- `ImageRenderer`
- `VideoRenderer`
- `TextRenderer`

Rules:
- At runtime, `CLS_View` selects and uses the specialized Renderer directly.
- Do not insert `FrontendRenderer` as an unnecessary runtime intermediary.
- A Renderer renders content into the DOM target/container owned by its View.
- A Renderer manages content, not View geometry or global layout.
- Do not make a Renderer responsible for CLOSE or other View-level controls.

## ST_FrontendJob
`ST_FrontendJob` is the JavaScript-side representation of backend data.
It mirrors backend information and must not introduce business enrichment.

V1 fields:
- `fileType`
- `sectionId`
- `fileName`
- `filePath`
- `stJobLayout`

Rules:
- Preserve backend values.
- Do not add `jobId`.
- Do not add fields without an explicit architectural decision.
- Pass the same structure through BackendBridge → FrontendController → ViewManager → View when appropriate.

## ST_FrontendEvent
This is an internal frontend contract between `CLS_EventManager` and `CLS_FrontendController`.

V1 fields:
- `eventType`
- `sectionId`

The V1 event currently required is `E_FrontendEvent.CLOSE`.

Do not confuse `ST_FrontendEvent` with `ST_FrontendToBackendData`.

## ST_FrontendToBackendData
This is the contract used for data leaving the frontend toward the backend.

For the V1 CLOSE flow, it contains the information required by the backend, including:
- event
- sectionId

`CLS_FrontendController` determines/builds this data from the frontend event.
`CLS_BackendBridge` performs technical transport/conversion only.

Do not invent additional fields without checking the backend contract.

## CLS_EventManager
Responsibilities:
- Receive/capture events produced by Views/DOM interactions.
- Normalize/package event information into `ST_FrontendEvent`.
- Send `stFrontendEvent` to `CLS_FrontendController`.

Conceptual V1 method:
- `eventProcessing(...)`

Controller receiver:
- `processEvent(stFrontendEvent)`

Do not make EventManager decide backend behavior or directly close Views through ViewManager.

## CLOSE flow
The required V1 CLOSE sequence is:

1. A View produces a CLOSE interaction.
2. `CLS_EventManager` creates `stFrontendEvent` with `eventType` and `sectionId`.
3. `CLS_FrontendController.processEvent(stFrontendEvent)` receives it.
4. Controller asks `CLS_ViewManager.closeView(sectionId)` to close the local View.
5. ViewManager stops/releases View/Renderer resources and removes the View through the lifecycle.
6. Controller creates the required `ST_FrontendToBackendData`.
7. Controller sends it to `CLS_BackendBridge`.
8. BackendBridge sends it to the backend.

Do not add a direct `CLS_EventManager → CLS_ViewManager` or `CLS_ViewManager → Backend` path.

## V1 scope restrictions
- No hide/show lifecycle for Views.
- No frontend framework.
- No authentication/login logic in the Viewer unless explicitly requested.
- Do not merge Display Manager responsibilities into Viewer.
- Do not implement speculative features outside the current task.
- Multiple Views must remain independently identifiable by `sectionId`.

## Implementation discipline
When modifying this repository:
1. Implement only the requested scope.
2. Prefer small, controlled changes.
3. Do not perform unrelated refactoring.
4. Do not change validated contracts to make implementation easier.
5. Do not add dependencies unless they are necessary and explicitly justified.
6. Reuse existing project concepts before introducing new abstractions.
7. Keep classes focused on their documented responsibilities.
8. Avoid duplicated state and unnecessary transformations.
9. Preserve compatibility with the backend contract.
10. If implementation requires an architectural decision not covered here, stop and request clarification instead of guessing.

## Implementation order
Build the project in this order unless explicitly instructed otherwise:
1. Create the complete minimal skeleton: folders, classes, structures, enums, HTML and CSS.
2. Implement minimal methods and class-to-class contracts.
3. Connect the real frontend/backend integration.
4. Validate the complete OPEN flow.
5. Validate the complete CLOSE flow.
6. Only then add specialized behavior or additional features.

Do not prematurely implement advanced specializations while the basic architecture is incomplete.

## Validation
For every meaningful implementation change:
- Check that imports/exports resolve.
- Check that the browser can load the frontend without JavaScript errors.
- Check that `sectionId` remains consistent across the complete flow.
- Check that View creation registers the correct `clsView`.
- Check that CLOSE releases the View/Renderer resources and removes the correct dictionary entry.
- Check that frontend events are routed through `CLS_FrontendController`.
- Check that backend-bound data passes through `CLS_BackendBridge`.
- Do not report a test as successful unless it was actually executed and passed.
