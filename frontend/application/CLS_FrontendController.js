import { E_CommandType } from '../domain/DUT/ENUM/E_CommandType.js';
import { E_EventType } from '../domain/DUT/ENUM/E_EventType.js';
import { E_FrontendEvent } from '../domain/DUT/ENUM/E_FrontendEvent.js';
import { ST_FrontendToBackendData } from '../domain/DUT/STRUCT/ST_FrontendToBackendData.js';

/** Central frontend orchestrator; Viewer routing and network delivery are pending. */
export class CLS_FrontendController {
    /** Stores the injected bridge without creating a circular module dependency. */
    constructor(clsBackendBridge) {
        this.clsBackendBridge = clsBackendBridge;
    }

    /** Identifies supported commands and reports the missing Viewer interface without changing Views. */
    process_Command(stBackendToFrontendData) {
        const command_Type = stBackendToFrontendData.commandType;
        const section_Id   = stBackendToFrontendData.sectionId;

        switch (command_Type) {
            case E_CommandType.OPEN:
            case E_CommandType.CLOSE:
                throw new Error(`Viewer interface is not available for ${command_Type} on section ${section_Id}.`);
            default:
                return;
        }
    }

    /** Prepares reported confirmations through the bridge; returns JSON without claiming network delivery. */
    process_Event(stFrontendEvent) {
        const event_Type = stFrontendEvent.eventType;
        const section_Id = stFrontendEvent.sectionId;

        if (event_Type === E_FrontendEvent.CLOSE) {
            throw new Error(`The backend contract for a user CLOSE request on section ${section_Id} is not defined.`);
        }
        if (event_Type !== E_EventType.OPENED && event_Type !== E_EventType.CLOSED) {
            return;
        }

        const stFrontendToBackendData     = new ST_FrontendToBackendData();
        stFrontendToBackendData.eventType = event_Type;
        stFrontendToBackendData.sectionId = section_Id;

        return this.clsBackendBridge.convert_Data_From_Frontend_To_Backend(stFrontendToBackendData);
    }
}
