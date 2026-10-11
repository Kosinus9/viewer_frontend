import { invoke, isTauri } from '@tauri-apps/api/core';
import { CLS_BackendBridge } from './infrastructure/CLS_BackendBridge.js';
import { CLS_FrontendController } from './application/CLS_FrontendController.js';
import { E_CommandType } from './domain/DUT/ENUM/E_CommandType.js';
import { configure_Trace, trace_Execution } from './trace-execution.js';
import { install_Poc_Instrumentation } from './pdf-poc-instrumentation.js';
import { create_Poc_Harness, poc_Section_Ids } from './pdf-poc-harness.js';

const trace_Toggle = document.getElementById('trace-enabled');
const display_Surface = document.getElementById('viewer');
const is_Development = import.meta.env.DEV;

/** Enables development logging and uses a single optional Tauri diagnostic relay. */
function configure_Poc_Trace() {
    configure_Trace({
        enabled: is_Development && trace_Toggle.checked,
        relay: is_Development && isTauri() ? message => invoke('trace_execution', { message }) : null
    });
}
trace_Toggle.checked = is_Development;
trace_Toggle.disabled = !is_Development;
configure_Poc_Trace();
trace_Toggle.addEventListener('change', configure_Poc_Trace);

/** Updates one section status without converting requests into authorized commands. */
function show_Status(sectionId, status) {
    const status_Element = document.getElementById(sectionId + '-status');
    if (status_Element) status_Element.textContent = status;
}

// Observe asynchronous PDF outcomes separately from OPENED/CLOSED confirmations.
install_Poc_Instrumentation((clsRenderer, outcome, error) => {
    for (const [section_Id, clsView] of clsFrontendController.mapViews) {
        if (clsView.clsRenderer === clsRenderer) {
            show_Status(section_Id, outcome === 'error' ? 'OPENED — PDF ERROR: ' + error.message : outcome === 'complete' ? 'OPENED — PDF rendu' : 'OPENED — rendu annulé');
        }
    }
});
const clsBackendBridge = new CLS_BackendBridge(null);
const clsFrontendController = new CLS_FrontendController(clsBackendBridge);
clsBackendBridge.clsFrontendController = clsFrontendController;
const harness = create_Poc_Harness(clsBackendBridge, clsFrontendController, display_Surface, show_Status);

/** Opens a selected PDF using its fixed backend-style section identity. */
function open_Test_Section(sectionId) {
    harness.send_Test_Command(E_CommandType.OPEN, sectionId, document.getElementById(sectionId + '-path').value);
}
for (const section_Id of poc_Section_Ids) {
    document.getElementById(section_Id + '-open').addEventListener('click', () => open_Test_Section(section_Id));
    document.getElementById(section_Id + '-close').addEventListener('click', () => harness.send_Test_Command(E_CommandType.CLOSE, section_Id));
}
document.getElementById('pdf-open-all').addEventListener('click', () => {
    for (const section_Id of poc_Section_Ids) {
        if (!clsFrontendController.mapViews.has(section_Id)) open_Test_Section(section_Id);
    }
});
// Resizing only adjusts the simulated test DOM; the original opening job stays intact.
new ResizeObserver(() => {
    if (display_Surface.clientWidth <= 0 || display_Surface.clientHeight <= 0) return;
    try { harness.reflow_Test_Layouts(); }
    catch (layout_Error) { trace_Execution('PDF_PoC', 'reflow_Test_Layouts', 'ERROR', null, { error: layout_Error.message }); }
}).observe(display_Surface);
