import { E_CommandType }                from '../domain/DUT/ENUM/E_CommandType.js';
import { E_EventType }                  from '../domain/DUT/ENUM/E_EventType.js';
import { E_FrontendEvent }              from '../domain/DUT/ENUM/E_FrontendEvent.js';
import { ST_FrontendToBackendData }     from '../domain/DUT/STRUCT/ST_FrontendToBackendData.js';
import { CLS_View }                     from '../domain/CLS_View.js';
import { CLS_EventManager }             from './CLS_EventManager.js';

/** Routes commands to individual Views and events to the backend bridge. */
export class CLS_FrontendController {
    /** Stores dependencies and an instance-only View registry. */
    constructor(clsBackendBridge, clsViewClass = CLS_View) {
        this.clsBackendBridge  = clsBackendBridge;
        this.clsViewClass      = clsViewClass;
        this.views             = new Map();
        this.clsEventManager   = new CLS_EventManager(this);
    }

    /** Returns the View instance associated with a backend section identifier. */
    get_View(sectionId) {
        return this.views.get(sectionId);
    }

    /** Routes full OPEN jobs and minimal CLOSE commands without accessing the DOM. */
    process_Command(stJobFrontend) {
        const command_Type = stJobFrontend.commandType;
        const section_Id   = stJobFrontend.sectionId;
        if (command_Type !== E_CommandType.OPEN && command_Type !== E_CommandType.CLOSE) return;
        if (section_Id === undefined || section_Id === null || section_Id === '') {
            throw new Error('A command requires a sectionId.');
        }
        let clsView = this.get_View(section_Id);
        if (command_Type === E_CommandType.OPEN) {
            if (clsView) throw new Error('Duplicate View for section ' + section_Id + '.');
            clsView = new this.clsViewClass(section_Id, this.clsEventManager);
            this.views.set(section_Id, clsView);
            try {
                return clsView.process_Command(stJobFrontend);
            } catch (error) {
                if (!clsView.isOpen && this.get_View(section_Id) === clsView) {
                    try { clsView.dispose(); }
                    finally { this.views.delete(section_Id); }
                }
                throw error;
            }
        }
        if (!clsView) throw new Error('Unknown View for section ' + section_Id + '.');
        return clsView.process_Command({ commandType: E_CommandType.CLOSE, sectionId: section_Id });
    }

    /** Forwards requests and effective confirmations, rejecting stale View events. */
    process_Event(stFrontendEvent, clsView) {
        const event_Type = stFrontendEvent.eventType;
        const section_Id = stFrontendEvent.sectionId;
        const clsCurrentView = this.get_View(section_Id);
        if (!clsCurrentView || clsCurrentView !== clsView || clsView.sectionId !== section_Id) return;
        if (![E_FrontendEvent.OPEN, E_FrontendEvent.CLOSE, E_EventType.OPENED, E_EventType.CLOSED].includes(event_Type)) return;
        if (event_Type === E_EventType.OPENED && !clsView.isOpen) return;
        if (event_Type === E_EventType.CLOSED) {
            if (clsView.isOpen) return;
            this.views.delete(section_Id);
        }
        const stFrontendToBackendData = new ST_FrontendToBackendData();
        stFrontendToBackendData.eventType = event_Type;
        stFrontendToBackendData.sectionId = section_Id;
        return this.clsBackendBridge.send_Message(stFrontendToBackendData);
    }
}
