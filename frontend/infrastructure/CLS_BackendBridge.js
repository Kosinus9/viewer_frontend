import { ST_BackendToFrontendData } from '../domain/DUT/STRUCT/ST_BackendToFrontendData.js';
import { ST_JobLayout }             from '../domain/DUT/STRUCT/ST_JobLayout.js';
import { E_MessageType }           from '../domain/DUT/ENUM/E_MessageType.js';

/** Technical backend boundary; backend transport is deferred. */
export class CLS_BackendBridge {
    /**
     * Stores the controller reference provided by the caller.
     * @param {{ process_Command: function(ST_BackendToFrontendData): void }} clsFrontendController
     * Controller instance that receives incoming data.
     */
    constructor(clsFrontendController, send_Message) {
        this.clsFrontendController = clsFrontendController;
        this.transport = send_Message;
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
            const stJobFrontend = this.convert_Data_From_Backend_To_Frontend(message_From_Backend.data);
            this.send_Data_To_Frontend_Controller(stJobFrontend);
        }
    }

    /**
     * Copies incoming data into frontend structures without changing its values.
     * @param {object} jsonData Backend data containing file fields,
     * the sectionId identifier and the stJobLayout layout.
     * @returns {ST_BackendToFrontendData} Structure containing an ST_JobLayout instance.
     */
    convert_Data_From_Backend_To_Frontend(jsonData) {
        const stJobFrontend       = new ST_BackendToFrontendData();
        stJobFrontend.commandType = jsonData.commandType;
        stJobFrontend.fileName    = jsonData.fileName;
        stJobFrontend.fileType    = jsonData.fileType;
        stJobFrontend.filePath    = jsonData.filePath;
        stJobFrontend.sectionId   = jsonData.sectionId;

        if (jsonData.stJobLayout !== undefined) {
            const stJobLayout                   = new ST_JobLayout();
            stJobLayout.x                       = jsonData.stJobLayout.x;
            stJobLayout.y                       = jsonData.stJobLayout.y;
            stJobLayout.width                   = jsonData.stJobLayout.width;
            stJobLayout.height                  = jsonData.stJobLayout.height;
            stJobFrontend.stJobLayout = stJobLayout;
        }

        return stJobFrontend;
    }

    /**
     * Forwards the same instance to the controller without conversion or business logic.
     * @param {ST_BackendToFrontendData} stJobFrontend Data to forward to process_Command.
     */
    send_Data_To_Frontend_Controller(stJobFrontend) {
        this.clsFrontendController.process_Command(stJobFrontend);
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
    /** Serializes events and uses an injected transport; without transport, returns prepared JSON only. */
    send_Message(stFrontendToBackendData) {
        const json_Message = this.convert_Data_From_Frontend_To_Backend(stFrontendToBackendData);
        if (this.transport) return this.transport(json_Message);
        return json_Message;
    }
}
