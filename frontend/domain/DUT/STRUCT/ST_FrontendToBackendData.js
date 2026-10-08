/** Backend-bound confirmation, distinct from internal user requests. */
export class ST_FrontendToBackendData {
    /** @type {(typeof import('../ENUM/E_EventType.js').E_EventType)[keyof typeof import('../ENUM/E_EventType.js').E_EventType]} */
    eventType;
    sectionId;
}
