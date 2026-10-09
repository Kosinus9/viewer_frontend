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
  - CLS_FrontendController.js
  - CLS_EventManager.js
- domain/
  - CLS_View.js
  - DUT/
    - ENUM/
      - E_FrontendEvent.js
      - E_FileType.js
    - STRUCT/
      - ST_FrontendJob.js
      - ST_FrontendEvent.js
      - ST_FrontendToBackendData.js
  - renderer/
    - CLS_FrontendRenderer.js
    - CLS_PDFRenderer.js
    - CLS_ImageRenderer.js
    - CLS_VideoRenderer.js
    - CLS_TextRenderer.js
- infrastructure/
  - CLS_BackendBridge.js
- index.html
- styles.css

Do not create new architectural layers or move responsibilities between layers without explicit approval.

## Naming convention
Use the project naming convention consistently:
- Classes: `CLS_...`
  - Example: `CLS_BackendBridge`, `CLS_FrontendController`, `CLS_View`
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
→ CLS_View
→ specialized Renderer
→ DOM

The event/return flow is:

DOM / CLS_View / Renderer
→ CLS_EventManager
→ CLS_FrontendController
→ CLS_BackendBridge
→ Backend

`CLS_FrontendController` is the central frontend orchestrator. Do not bypass it by directly connecting managers to the backend.

## CLS_BackendBridge
Responsibilities:
- It is the frontend technical boundary toward the backend.
- Receive backend-side data.
- Perform only the technical conversion/deserialization required to obtain clean JavaScript-side data.
- Pass received JavaScript-side data to `CLS_FrontendController.process_Command(stJobFrontend)`.
- Send frontend-to-backend data to the backend.

Rules:
- Do not put business decisions in the bridge.
- Do not enrich backend jobs with invented fields.
- Do not confuse this frontend `CLS_BackendBridge` with the backend-side `CLS_FrontendBridge`.
- Do not assume JSON is the final transport contract unless explicitly established. pywebview is the current integration technology.

## CLS_FrontendController
Responsibilities:
- Central orchestration and routing, directly between the bridge and Views.
- `process_Command(stJobFrontend)` is the sole backend-to-frontend command entry point; it routes commands through established Viewer interfaces only.
- `process_Event(stFrontendEvent)` handles normalized frontend events in the Frontend -> Backend direction.
- Build the required `ST_FrontendToBackendData` and pass it to `CLS_BackendBridge`.
- Preserve backend values and pass the same `stFrontendJob` to the View when appropriate.

Do not move DOM construction or content rendering into this class.
Use ViewClass for the injected View constructor and clsView for a concrete instance.
Maintain this.mapViews = new Map() as an instance-only registry: sectionId -> CLS_View. Do not duplicate jobs or backend Section state.
The exact incoming data envelope and command contract remain TODOs until established by backend documentation; do not invent fields.

## Section identity and visual state
- The backend is the source of truth for Sections and their lifecycle.
- The DOM represents the actual visual state of the frontend.
- Each View/DOM container must be identifiable directly through the backend-provided `sectionId`.
- A command concerning a `sectionId` locates the corresponding View/DOM container using that identity.
- View events use the same `sectionId` to identify the backend Section.
- Do not introduce another frontend View ID or jobId. The controller Map stores View references only.
- The precise DOM identity mechanism is deferred to implementation; no new identity contract is defined here.

## CLS_View

- The controller retains process_Command(stJobFrontend); each View executes commands through execute_Command(stJobFrontend).
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
- Borders, dimensions, position, rounded corners, header/title bar, close button and View-level styling belong to the View/CSS, not to the Renderer.
- `fileName` remains available to the View and is not required by the Renderer in V1 unless needed later.

## Renderers
`CLS_FrontendRenderer` is the base renderer abstraction.
Specialized renderers:
- `CLS_PDFRenderer`
- `CLS_ImageRenderer`
- `CLS_VideoRenderer`
- `CLS_TextRenderer`

Rules:
- At runtime, `CLS_View` selects and uses the specialized Renderer directly.
- Do not insert `CLS_FrontendRenderer` as an unnecessary runtime intermediary.
- A Renderer renders content into the DOM target/container owned by its View.
- A Renderer manages content, not View geometry, View lifecycle or global layout.
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
- Pass the same structure through BackendBridge -> FrontendController -> View when appropriate.

## ST_FrontendEvent
This is an internal frontend contract between `CLS_EventManager` and `CLS_FrontendController`.

V1 fields:
- `eventType`
- `sectionId`

The V1 event currently required is `E_FrontendEvent.CLOSE`.

Do not confuse `ST_FrontendEvent` with `ST_FrontendToBackendData`.

## ST_FrontendToBackendData
This is the contract used for data leaving the frontend toward the backend.

For V1 confirmations of completed View actions, it contains:
- eventType: E_FrontendEvent.OPEN/CLOSE requests or E_EventType.OPENED/CLOSED confirmations
- sectionId

`CLS_FrontendController` determines/builds this data from the frontend event.
`CLS_BackendBridge` performs technical transport/conversion only.

Do not invent additional fields without checking the backend contract.

## CLS_EventManager
Responsibilities:
- Receive/capture events produced by DOM interactions, Views or Renderers.
- Normalize/package event information into `ST_FrontendEvent`.
- Send `stFrontendEvent` to `CLS_FrontendController`.

Conceptual V1 method:
- `event_Processing(...)`

Controller receiver:
- `process_Event(stFrontendEvent)`

Do not make EventManager decide backend behavior, directly close Views or bypass the controller.

## CLOSE/event flow
The required V1 CLOSE event sequence is:

1. A View produces a CLOSE interaction carrying its backend-provided `sectionId`.
2. `CLS_EventManager` creates `stFrontendEvent` with `eventType` and `sectionId`.
3. `CLS_FrontendController.process_Event(stFrontendEvent)` receives it.
4. Controller forwards user OPEN/CLOSE requests using eventType and sectionId, without treating them as confirmations.
5. Controller forwards the structure through CLS_BackendBridge.send_Message; absent transport produces prepared JSON only.
6. BackendBridge sends it to the backend, which remains responsible for Section lifecycle.

Backend commands return through BackendBridge -> FrontendController -> View -> specialized Renderer -> DOM.
Commands target the View/DOM container using `sectionId`.
The timing and exact command contract for visual removal and resource release remain TODOs; do not assume local removal before backend notification.
Do not add a direct EventManager -> Backend path or bypass the controller.

## V1 scope restrictions
- No hide/show lifecycle for Views.
- No frontend framework.
- No authentication/login logic in the Viewer unless explicitly requested.
- Do not merge Display Manager responsibilities into Viewer.
- Do not implement speculative features outside the current task.
- Multiple Views must remain independently identifiable by `sectionId`.

## Command and confirmation contracts

- ST_BackendToFrontendData carries commandType from E_CommandType (OPEN, CLOSE), sectionId, fileName, fileType, filePath, and stJobLayout. Opening data remains inside the data envelope; CLOSE may carry only commandType and sectionId.
- ST_FrontendToBackendData uses eventType from E_EventType (OPENED, CLOSED) and sectionId; the former event field is removed.
- Internal E_FrontendEvent.OPEN/CLOSE are user requests carried by eventType, distinct from OPENED/CLOSED confirmations. Python request handling remains to be integrated.
- Emit confirmations only after the action succeeds, never merely on receipt of a command. ERROR is not validated.

## Message types

- Backend/frontend message types are centralized in `frontend/domain/DUT/ENUM/E_MessageType.js`.
- Classes must use `E_MessageType.COMMAND`, `E_MessageType.EVENT`, and `E_MessageType.RESPONSE` wherever these message type values are needed, instead of repeating string literals.
- The enum values must remain identical to the Python JSON contract and must not change the exchanged message format or keys.
- `RESPONSE` is defined for V2; do not implement its handling in V1.

## Local variable naming

- Ordinary JavaScript local variables must use words separated by `_`, with the first word lowercase and each subsequent word starting with an uppercase letter, for example `message_From_Backend` and `json_Data`.
- Method parameters retain their existing explicit names unless a specific rename is requested.
- Preserve class names (`CLS_...`), structure names (`ST_...`), enum names (`E_...`), structure instance names (`st...`), and class instance names (`cls...`). These instance conventions take precedence over ordinary local variable naming.
- Do not rename structure properties or JSON contract keys, including `messageType`, `data`, `sectionId`, and `stJobLayout`.
- Preserve the method naming convention below, for example `receive_Message()` and `convert_Data_From_Backend_To_Frontend()`.
- Keep method documentation comments in English. Naming changes must not alter program behavior.

## Method naming

Method names must follow the Python backend convention: words separated by `_`, with the first word lowercase and each subsequent word starting with an uppercase letter.
- Example: `convert_Data_From_Backend_To_Frontend()`.
- Apply this mandatory convention to new JavaScript methods and existing methods affected by the task.
- Preserve the current naming conventions for classes, structures, variables, and properties.
- Do not rename JavaScript native or library methods, or the language-defined `constructor`.
- Every method must retain a minimal descriptive comment in English.

## Method documentation
Every method must always have a short comment written in English that explains its purpose, responsibility, or intended use.
- Place the comment immediately above the method declaration.
- Apply this rule to constructors, implemented methods, and TODO/stub methods alike.
- Keep comments concise, accurate, and consistent with the method's actual behavior.
- When changing a method's purpose or behavior, update its comment accordingly.
- Do not use French for method documentation comments, even when task instructions are in French.

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
- Check that the View/DOM container can be located using the backend-provided `sectionId`.
- Once lifecycle commands are implemented, check that they target the correct sectionId and release the corresponding View/Renderer resources on removal.
- Check that frontend events are routed through `CLS_FrontendController`.
- Check that backend-bound data passes through `CLS_BackendBridge`.
- Do not report a test as successful unless it was actually executed and passed.

## V1 View integration

- CLS_View owns one minimal DOM container and the unchanged opening job. Rendering and layout remain deferred.
- View events pass through CLS_EventManager; the originating CLS_View reference is forwarded separately from ST_FrontendEvent for stale-event checks.
- Remove registry references only after effective CLOSED, or cleanup following failed initialization. Reject duplicate OPEN and unknown CLOSE using the existing Error mechanism.
