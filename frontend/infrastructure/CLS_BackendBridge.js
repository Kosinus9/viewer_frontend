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
            const stData = this.convertDataFromBackendToFrontend(message.data);
            this.sendDataToFrontendController(stData);
        }
    }

    /**
     * Copies incoming data into frontend structures without changing its values.
     * @param {object} data Backend data containing file fields,
     * the sectionId identifier and the stJobLayout layout.
     * @returns {ST_BackendToFrontendData} Structure containing an ST_JobLayout instance.
     */
    convertDataFromBackendToFrontend(data) {
        const stData = new ST_BackendToFrontendData();
        stData.fileName    = data.fileName;
        stData.fileType    = data.fileType;
        stData.filePath    = data.filePath;
        stData.sectionId   = data.sectionId;

        const stJobLayout  = new ST_JobLayout();
        stJobLayout.x      = data.stJobLayout.x;
        stJobLayout.y      = data.stJobLayout.y;
        stJobLayout.width  = data.stJobLayout.width;
        stJobLayout.height = data.stJobLayout.height;
        stData.stJobLayout = stJobLayout;

        return stData;
    }

    /**
     * Forwards the same instance to the controller without conversion or business logic.
     * @param {ST_BackendToFrontendData} stData Data to forward to processData.
     */
    sendDataToFrontendController(stData) {
        this.clsFrontendController.processData(stData);
    }

    /**
     * Serializes the event and sectionId fields in an EVENT envelope.
     * @param {import('../domain/DUT/STRUCT/ST_FrontendToBackendData.js').ST_FrontendToBackendData} stData
     * Event data intended for the backend.
     * @returns {string} JSON message prepared for transport to the backend.
     */
    convertDataFromFrontendToBackend(stData) {
        return JSON.stringify({
            messageType: 'EVENT',
            data: {
                event: stData.event,
                sectionId: stData.sectionId,
            },
        });
    }
}
