import { ST_BackendToFrontendData } from '../domain/DUT/STRUCT/ST_BackendToFrontendData.js';
import { ST_JobLayout }             from '../domain/DUT/STRUCT/ST_JobLayout.js';
import { E_MessageType }           from '../domain/DUT/ENUM/E_MessageType.js';

/** Technical backend boundary; backend transport is deferred. */
export class CLS_BackendBridge {
    /**
     * Stores the controller reference provided by the caller.
     * @param {{ process_Data: function(ST_BackendToFrontendData): void }} clsFrontendController
     * Controller instance that receives incoming data.
     */
    constructor(clsFrontendController) {
        this.clsFrontendController = clsFrontendController;
    }

    /**
     * Parses the JSON message and forwards COMMAND data to the controller.
     * Other message types, including RESPONSE, are ignored in V1.
     * @param {string} jsonMessage JSON message received from the backend.
     * @throws {SyntaxError} If the message is not valid JSON.
     */
    receive_Message(jsonMessage) {
        const message_From_Backend = JSON.parse(jsonMessage);
        if (message_From_Backend.messageType === E_MessageType.COMMAND) {
            const stBackendToFrontendData = this.convert_Data_From_Backend_To_Frontend(message_From_Backend.data);
            this.send_Data_To_Frontend_Controller(stBackendToFrontendData);
        }
    }

    /**
     * Copies incoming data into frontend structures without changing its values.
     * @param {object} jsonData Backend data containing file fields,
     * the sectionId identifier and the stJobLayout layout.
     * @returns {ST_BackendToFrontendData} Structure containing an ST_JobLayout instance.
     */
    convert_Data_From_Backend_To_Frontend(jsonData) {
        const stBackendToFrontendData       = new ST_BackendToFrontendData();
        stBackendToFrontendData.commandType = jsonData.commandType;
        stBackendToFrontendData.fileName    = jsonData.fileName;
        stBackendToFrontendData.fileType    = jsonData.fileType;
        stBackendToFrontendData.filePath    = jsonData.filePath;
        stBackendToFrontendData.sectionId   = jsonData.sectionId;

        if (jsonData.stJobLayout !== undefined) {
            const stJobLayout                   = new ST_JobLayout();
            stJobLayout.x                       = jsonData.stJobLayout.x;
            stJobLayout.y                       = jsonData.stJobLayout.y;
            stJobLayout.width                   = jsonData.stJobLayout.width;
            stJobLayout.height                  = jsonData.stJobLayout.height;
            stBackendToFrontendData.stJobLayout = stJobLayout;
        }

        return stBackendToFrontendData;
    }

    /**
     * Forwards the same instance to the controller without conversion or business logic.
     * @param {ST_BackendToFrontendData} stBackendToFrontendData Data to forward to process_Data.
     */
    send_Data_To_Frontend_Controller(stBackendToFrontendData) {
        this.clsFrontendController.process_Data(stBackendToFrontendData);
    }

    /**
     * Serializes the eventType and sectionId confirmation fields in an EVENT envelope.
     * @param {import('../domain/DUT/STRUCT/ST_FrontendToBackendData.js').ST_FrontendToBackendData} stFrontendToBackendData
     * Event data intended for the backend.
     * @returns {string} JSON message prepared for transport to the backend.
     */
    convert_Data_From_Frontend_To_Backend(stFrontendToBackendData) {
        return JSON.stringify({
            messageType: E_MessageType.EVENT,
            data: {
                eventType: stFrontendToBackendData.eventType,
                sectionId: stFrontendToBackendData.sectionId,
            },
        });
    }
}
