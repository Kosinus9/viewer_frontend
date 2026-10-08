import { ST_BackendToFrontendData } from '../domain/DUT/STRUCT/ST_BackendToFrontendData.js';
import { ST_JobLayout }             from '../domain/DUT/STRUCT/ST_JobLayout.js';

/** Technical backend boundary; backend transport is deferred. */
export class CLS_BackendBridge {
    /**
     * Stores the controller reference provided by the caller.
     * @param {{ processData: function(ST_BackendToFrontendData): void }} clsFrontendController
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
    receiveMessage(jsonMessage) {
        const message = JSON.parse(jsonMessage);
        if (message.messageType === 'COMMAND') {
            const stBackendToFrontendData = this.convertDataFromBackendToFrontend(message.data);
            this.sendDataToFrontendController(stBackendToFrontendData);
        }
    }

    /**
     * Copies incoming data into frontend structures without changing its values.
     * @param {object} jsonData Backend data containing file fields,
     * the sectionId identifier and the stJobLayout layout.
     * @returns {ST_BackendToFrontendData} Structure containing an ST_JobLayout instance.
     */
    convertDataFromBackendToFrontend(jsonData) {
        const stBackendToFrontendData       = new ST_BackendToFrontendData();
        stBackendToFrontendData.fileName    = jsonData.fileName;
        stBackendToFrontendData.fileType    = jsonData.fileType;
        stBackendToFrontendData.filePath    = jsonData.filePath;
        stBackendToFrontendData.sectionId   = jsonData.sectionId;

        const stJobLayout                   = new ST_JobLayout();
        stJobLayout.x                       = jsonData.stJobLayout.x;
        stJobLayout.y                       = jsonData.stJobLayout.y;
        stJobLayout.width                   = jsonData.stJobLayout.width;
        stJobLayout.height                  = jsonData.stJobLayout.height;
        stBackendToFrontendData.stJobLayout = stJobLayout;

        return stBackendToFrontendData;
    }

    /**
     * Forwards the same instance to the controller without conversion or business logic.
     * @param {ST_BackendToFrontendData} stBackendToFrontendData Data to forward to processData.
     */
    sendDataToFrontendController(stBackendToFrontendData) {
        this.clsFrontendController.processData(stBackendToFrontendData);
    }

    /**
     * Serializes the event and sectionId fields in an EVENT envelope.
     * @param {import('../domain/DUT/STRUCT/ST_FrontendToBackendData.js').ST_FrontendToBackendData} stFrontendToBackendData
     * Event data intended for the backend.
     * @returns {string} JSON message prepared for transport to the backend.
     */
    convertDataFromFrontendToBackend(stFrontendToBackendData) {
        return JSON.stringify({
            messageType: 'EVENT',
            data: {
                event:     stFrontendToBackendData.event,
                sectionId: stFrontendToBackendData.sectionId,
            },
        });
    }
}
