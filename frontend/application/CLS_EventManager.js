import { ST_FrontendEvent } from '../domain/DUT/STRUCT/ST_FrontendEvent.js';

/** Normalizes View events while preserving their originating instance separately. */
export class CLS_EventManager {
    /** Stores the controller without importing or constructing it. */
    constructor(clsFrontendController) {
        this.clsFrontendController = clsFrontendController;
    }

    /** Packages an event and forwards its source for stale-instance protection. */
    event_Processing(eventType, sectionId, clsView) {
        const stFrontendEvent     = new ST_FrontendEvent();
        stFrontendEvent.eventType = eventType;
        stFrontendEvent.sectionId = sectionId;
        return this.clsFrontendController.process_Event(stFrontendEvent, clsView);
    }
}
