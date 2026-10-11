import { E_MessageType } from './domain/DUT/ENUM/E_MessageType.js';
import { E_CommandType } from './domain/DUT/ENUM/E_CommandType.js';
import { E_FileType } from './domain/DUT/ENUM/E_FileType.js';
import { ST_JobLayout } from './domain/DUT/STRUCT/ST_JobLayout.js';
import { trace_Execution } from './trace-execution.js';

export const poc_Section_Ids = Object.freeze(['pdf-poc-1', 'pdf-poc-2', 'pdf-poc-3']);

/** Simulates the documented proportions locally; never invokes Python LayoutManager. */
export function calculate_Test_Layouts(sectionIds, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Test display surface must have positive dimensions.');
    }
    if (sectionIds.length > 3 || new Set(sectionIds).size !== sectionIds.length || sectionIds.some(section_Id => !poc_Section_Ids.includes(section_Id))) {
        throw new Error('Test layouts require up to three unique PoC section identifiers.');
    }
    const layouts = new Map();
    sectionIds.forEach((section_Id, index) => {
        const stJobLayout = new ST_JobLayout();
        stJobLayout.width = width / 2;
        stJobLayout.height = sectionIds.length === 2 ? height : height / 2;
        stJobLayout.x = sectionIds.length === 1 || index === 2 ? width / 4 : index * width / 2;
        stJobLayout.y = sectionIds.length === 1 ? height / 4 : index === 2 ? height / 2 : 0;
        layouts.set(section_Id, stJobLayout);
    });
    return layouts;
}

/** Creates isolated test commands and DOM adjustments without adding business commands. */
export function create_Poc_Harness(clsBackendBridge, clsFrontendController, displaySurface, onStatus = () => {}) {
    const send_Message = clsBackendBridge.send_Message.bind(clsBackendBridge);
    /** Observes prepared JSON locally; no backend transport is installed. */
    clsBackendBridge.send_Message = function(stFrontendToBackendData) {
        const json_Message = send_Message(stFrontendToBackendData);
        onStatus(stFrontendToBackendData.sectionId, stFrontendToBackendData.eventType);
        return json_Message;
    };

    /** Reads active test identities from the controller registry without duplicating jobs. */
    function active_Sections() {
        return poc_Section_Ids.filter(section_Id => clsFrontendController.mapViews.has(section_Id));
    }

    /** Applies simulated geometry directly to test DOM, preserving original opening jobs. */
    function reflow_Test_Layouts() {
        const section_Ids = active_Sections();
        const layouts = calculate_Test_Layouts(section_Ids, displaySurface.clientWidth, displaySurface.clientHeight);
        for (const [section_Id, stJobLayout] of layouts) {
            const clsView = clsFrontendController.mapViews.get(section_Id);
            for (const field_Name of ['x', 'y', 'width', 'height']) {
                clsView.container.style[{ x: 'left', y: 'top', width: 'width', height: 'height' }[field_Name]] = stJobLayout[field_Name] + 'px';
            }
            trace_Execution('PDF_PoC', 'reflow_Test_Layouts', 'COMPLETE', section_Id, { simulator: 'Local HTML test layout', stJobLayout, activeSections: section_Ids });
        }
        return layouts;
    }

    /** Injects OPEN or CLOSE through the unchanged JSON message boundary. */
    function send_Test_Command(commandType, sectionId, filePath) {
        try {
            if (!poc_Section_Ids.includes(sectionId)) throw new Error('Unknown PoC section identifier.');
            if (![E_CommandType.OPEN, E_CommandType.CLOSE].includes(commandType)) throw new Error('PoC supports OPEN and CLOSE only.');
            const data = { commandType, sectionId };
            if (commandType === E_CommandType.OPEN) {
                if (typeof filePath !== 'string' || !/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(filePath)) {
                    throw new Error('Enter an absolute local PDF path.');
                }
                const section_Ids = poc_Section_Ids.filter(section_Id => section_Id === sectionId || clsFrontendController.mapViews.has(section_Id));
                data.fileType = E_FileType.PDF;
                data.fileName = filePath.split(/[\\/]/).pop();
                data.filePath = filePath;
                data.stJobLayout = calculate_Test_Layouts(section_Ids, displaySurface.clientWidth, displaySurface.clientHeight).get(sectionId);
            }
            const envelope = { messageType: E_MessageType.COMMAND, data };
            trace_Execution('PDF_PoC', 'send_Test_Command', 'START', sectionId, { envelope, activeSections: active_Sections() });
            clsBackendBridge.receive_Message(JSON.stringify(envelope));
            reflow_Test_Layouts();
            trace_Execution('PDF_PoC', 'send_Test_Command', 'COMPLETE', sectionId, { activeSections: active_Sections() });
            return true;
        } catch (command_Error) {
            trace_Execution('PDF_PoC', 'send_Test_Command', 'ERROR', sectionId, { error: command_Error.message, activeSections: active_Sections() });
            onStatus(sectionId, 'Command error: ' + command_Error.message);
            return false;
        }
    }
    return { send_Test_Command, reflow_Test_Layouts, active_Sections };
}
