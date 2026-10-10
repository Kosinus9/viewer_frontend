import { CLS_BackendBridge }            from './infrastructure/CLS_BackendBridge.js';
import { CLS_FrontendController }       from './application/CLS_FrontendController.js';
import { E_MessageType }                from './domain/DUT/ENUM/E_MessageType.js';
import { E_CommandType }                from './domain/DUT/ENUM/E_CommandType.js';
import { E_FileType }                   from './domain/DUT/ENUM/E_FileType.js';

const status_Element                    = document.getElementById('pdf-status');
// No backend transport is installed: events remain prepared JSON in this isolated PoC.
const clsBackendBridge                  = new CLS_BackendBridge(null);
const clsFrontendController             = new CLS_FrontendController(clsBackendBridge);
clsBackendBridge.clsFrontendController  = clsFrontendController;

/** Injects a test command through the unchanged backend message boundary. */
function send_Test_Command(data) {
    try {
        const json_Result               = clsBackendBridge.receive_Message(JSON.stringify({ messageType: E_MessageType.COMMAND, data }));
        status_Element.textContent      = json_Result || '';
    } catch (command_Error) {
        status_Element.textContent = command_Error.message;
    }
}

document.getElementById('pdf-poc-form').addEventListener('submit', submit_Event => {
    submit_Event.preventDefault();
    const file_Path                    = document.getElementById('pdf-path').value;
    send_Test_Command({
        commandType:    E_CommandType.OPEN,
        sectionId:      'pdf-poc', fileType: E_FileType.PDF,
        fileName:       file_Path.split(/[\\/]/).pop(), filePath: file_Path,
        stJobLayout:    { x: 0, y: 0, width: Math.max(100, window.innerWidth - 20), height: Math.max(100, window.innerHeight - 100) }
    });
});
document.getElementById('pdf-close').addEventListener('click', () => {
    send_Test_Command({ commandType: E_CommandType.CLOSE, sectionId: 'pdf-poc' });
});
