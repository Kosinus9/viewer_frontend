import { CLS_BackendBridge } from './infrastructure/CLS_BackendBridge.js';
import { CLS_FrontendController } from './application/CLS_FrontendController.js';
import { CLS_EventManager } from './application/CLS_EventManager.js';
import { CLS_View } from './domain/CLS_View.js';
import { CLS_RenderGeneric } from './domain/renderer/CLS_RenderGeneric.js';
import { CLS_RenderPDF } from './domain/renderer/CLS_RenderPDF.js';
import { trace_Instance } from './trace-execution.js';

/** Selects only validated protocol fields for diagnostic snapshots. */
function describe_Structure(value) {
    if (!value || typeof value !== 'object') return undefined;
    const data = {};
    for (const field_Name of ['commandType', 'sectionId', 'fileName', 'fileType', 'filePath', 'eventType']) {
        if (value[field_Name] !== undefined) data[field_Name] = value[field_Name];
    }
    if (value.stJobLayout) {
        data.stJobLayout = {};
        for (const field_Name of ['x', 'y', 'width', 'height']) data.stJobLayout[field_Name] = value.stJobLayout[field_Name];
    }
    return data;
}

/** Selects method arguments without exposing DOM, PDF.js or controller references. */
function describe_Arguments(methodName, values) {
    if (methodName === 'receive_Message') {
        try {
            const envelope = JSON.parse(values[0]);
            return { envelope: { messageType: envelope.messageType, data: describe_Structure(envelope.data) } };
        }
        catch { return { error: 'Invalid JSON envelope' }; }
    }
    if (methodName === 'event_Processing') return { stFrontendEvent: { eventType: values[0], sectionId: values[1] } };
    if (['render', 'convert_file_path_In_URL'].includes(methodName)) return { filePath: values[0] };
    if (methodName === 'choose_Special_Renderer') return { fileType: values[0] };
    if (methodName === 'get_View') return { sectionId: values[0] };
    return { data: describe_Structure(values[0]) };
}

/** Installs removable PoC-only observers while preserving return values and errors. */
export function install_Poc_Instrumentation(onRenderResult = () => {}) {
    const restored_Methods = [];
    const targets = [
        [CLS_BackendBridge, ['receive_Message', 'convert_Data_From_Backend_To_Frontend', 'send_Data_To_Frontend_Controller', 'convert_Data_From_Frontend_To_Backend', 'send_Message']],
        [CLS_FrontendController, ['process_Command', 'get_View', 'process_Event']],
        [CLS_EventManager, ['event_Processing']],
        [CLS_View, ['execute_Command', 'create_Container', 'choose_Special_Renderer', 'request_Close', 'release_View_Resources']],
        [CLS_RenderGeneric, ['convert_file_path_In_URL', 'release_Render_Resources']],
        [CLS_RenderPDF, ['load_PDF_Library', 'render', 'release_Render_Resources']]
    ];
    for (const [target_Class, methods] of targets) {
        for (const method_Name of methods) {
            const original_Method = target_Class.prototype[method_Name];
            /** Observes entry and completion without awaiting the wrapped method. */
            target_Class.prototype[method_Name] = function(...values) {
                const input = describe_Arguments(method_Name, values);
                const section_Id = input.envelope?.data?.sectionId ?? input.stFrontendEvent?.sectionId ?? input.data?.sectionId ?? input.sectionId;
                const clsSource = this;
                /** Records current registry references and lifecycle state only. */
                function record(event_Name, details = {}) {
                    const data = { ...input, ...details };
                    if (clsSource.mapViews) {
                        data.viewCount = clsSource.mapViews.size;
                        data.viewIds = [...clsSource.mapViews.keys()];
                    }
                    trace_Instance(clsSource, target_Class.name, method_Name, event_Name, data, section_Id);
                }
                /** Reports PDF completion independently of lifecycle confirmations. */
                function completed(result) {
                    record(clsSource.isReleased && method_Name === 'render' ? 'EXIT' : 'COMPLETE', {
                        result, cancelled: method_Name === 'render' && clsSource.isReleased
                    });
                    if (target_Class === CLS_RenderPDF && method_Name === 'render') {
                        try { onRenderResult(clsSource, clsSource.isReleased ? 'cancelled' : 'complete'); } catch { /* Ignore observer errors. */ }
                    }
                }
                /** Observes errors without replacing or consuming the original rejection. */
                function failed(error) {
                    record('ERROR', { error: error.message });
                    if (target_Class === CLS_RenderPDF && method_Name === 'render') {
                        try { onRenderResult(clsSource, 'error', error); } catch { /* Ignore observer errors. */ }
                    }
                }
                record(method_Name === 'render' ? 'START' : 'ENTER');
                try {
                    const result = original_Method.apply(this, values);
                    if (result instanceof Promise) result.then(completed, failed);
                    else record('EXIT', { result });
                    return result;
                } catch (error) {
                    failed(error);
                    throw error;
                }
            };
            restored_Methods.push(() => { target_Class.prototype[method_Name] = original_Method; });
        }
    }
    // The harness installs this once and can explicitly restore it during tests.
    return () => restored_Methods.reverse().forEach(restore => restore());
}
