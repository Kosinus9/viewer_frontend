import assert from 'node:assert/strict';
import test from 'node:test';
import { CLS_BackendBridge } from '../frontend/infrastructure/CLS_BackendBridge.js';
import { CLS_FrontendController } from '../frontend/application/CLS_FrontendController.js';
import { CLS_RenderGeneric } from '../frontend/domain/renderer/CLS_RenderGeneric.js';
import { CLS_RenderPDF } from '../frontend/domain/renderer/CLS_RenderPDF.js';
import { calculate_Test_Layouts, create_Poc_Harness, poc_Section_Ids } from '../frontend/pdf-poc-harness.js';
import { install_Poc_Instrumentation } from '../frontend/pdf-poc-instrumentation.js';
import { configure_Trace, flush_Trace_Queue, snapshot_Trace_Data, trace_Execution } from '../frontend/trace-execution.js';

/** Returns the geometry as plain JSON for exact comparisons. */
function geometry(layouts) {
    return [...layouts.values()].map(stJobLayout => ({ ...stJobLayout }));
}

test('local simulator matches documented layouts for one, two and three sections', () => {
    assert.deepEqual(geometry(calculate_Test_Layouts(poc_Section_Ids.slice(0, 1), 1920, 1080)), [
        { x: 480, y: 270, width: 960, height: 540 }
    ]);
    assert.deepEqual(geometry(calculate_Test_Layouts(poc_Section_Ids.slice(0, 2), 1920, 1080)), [
        { x: 0, y: 0, width: 960, height: 1080 }, { x: 960, y: 0, width: 960, height: 1080 }
    ]);
    assert.deepEqual(geometry(calculate_Test_Layouts(poc_Section_Ids, 1920, 1080)), [
        { x: 0, y: 0, width: 960, height: 540 }, { x: 960, y: 0, width: 960, height: 540 },
        { x: 480, y: 540, width: 960, height: 540 }
    ]);
});

test('simulator uses actual fractional dimensions without overlap and rejects invalid input', () => {
    const layouts = geometry(calculate_Test_Layouts(poc_Section_Ids, 901, 503));
    for (const layout of layouts) {
        assert.equal(layout.width, 450.5);
        assert.equal(layout.height, 251.5);
        assert.ok(layout.x >= 0 && layout.x + layout.width <= 901);
        assert.ok(layout.y >= 0 && layout.y + layout.height <= 503);
    }
    for (let first = 0; first < layouts.length; first++) {
        for (let second = first + 1; second < layouts.length; second++) {
            const a = layouts[first], b = layouts[second];
            assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
        }
    }
    assert.equal(calculate_Test_Layouts([], 100, 100).size, 0);
    assert.throws(() => calculate_Test_Layouts(poc_Section_Ids, 0, 100), /dimensions/);
    assert.throws(() => calculate_Test_Layouts(['pdf-poc-1', 'pdf-poc-1'], 100, 100), /unique/);
    assert.throws(() => calculate_Test_Layouts(['unknown'], 100, 100), /unique/);
});

test('trace queue preserves order, snapshots values, survives relay failure and disables output', async () => {
    const output = [], delivered = [];
    configure_Trace({ enabled: true, output: message => output.push(message), relay: async message => {
        await new Promise(resolve => setImmediate(resolve));
        delivered.push(message);
        if (delivered.length === 1) throw new Error('Relay unavailable');
    } });
    try {
        const data = { stJobLayout: { width: 50 } };
        const first = trace_Execution('Test', 'command', 'ENTER', 'pdf-poc-1', data);
        data.stJobLayout.width = 999;
        const second = trace_Execution('Test', 'command', 'EXIT', 'pdf-poc-1');
        assert.equal(second.sequence, first.sequence + 1);
        assert.ok(!Number.isNaN(Date.parse(first.timestamp)));
        await flush_Trace_Queue();
        assert.equal(delivered.length, 2);
        assert.ok(delivered[0].includes('"width": 50'));
        assert.ok(output.some(message => message.includes('TRACE RELAY ERROR')));
        configure_Trace({ enabled: false, output: message => output.push(message) });
        const output_Count = output.length;
        trace_Execution('Test', 'command', 'ENTER');
        assert.equal(output.length, output_Count);
    } finally { configure_Trace(); }
});

test('trace snapshots omit DOM, binary data, PDF runtime and cycles', () => {
    const data = { dom: { nodeType: 1, textContent: 'Do not expose' }, binary: new Uint8Array([1, 2]), pdf: new Map() };
    data.circular = data;
    const snapshot = JSON.stringify(snapshot_Trace_Data(data));
    assert.ok(snapshot.includes('runtime object omitted'));
    assert.ok(snapshot.includes('circular reference omitted'));
    assert.ok(!snapshot.includes('Do not expose'));
    assert.ok(!snapshot.includes('[1,2]'));
});

test('three-PDF harness preserves commands, instances, requests, reflow and cleanup with instrumentation', async () => {
    const original_Document = globalThis.document;
    const original_Converter = CLS_RenderGeneric.convert_File_Src;
    const original_Loader = CLS_RenderPDF.prototype.load_PDF_Library;
    const logs = [], statuses = [], outcomes = [], events = [];
    let destroy_Count = 0;
    /** Provides observable DOM operations without claiming graphical verification. */
    function element() {
        return { nodeType: 1, dataset: {}, style: {}, children: [], clientWidth: 400, handlers: new Map(),
            ownerDocument: { createElement: element },
            /** Attaches a child to this node. */
            appendChild(child) { this.children.push(child); child.parent = this; },
            /** Removes only this node from its parent. */
            remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
            /** Clears rendered children only. */
            replaceChildren() { this.children = []; },
            /** Returns the section ancestor for diagnostic identity. */
            closest() { return this.dataset.sectionId ? this : this.parent?.closest(); },
            /** Records a listener. */
            addEventListener(type, handler) { this.handlers.set(type, handler); },
            /** Removes a listener. */
            removeEventListener(type) { this.handlers.delete(type); },
            /** Accepts canvas labels in this test. */
            setAttribute() {},
            /** Provides a canvas context double. */
            getContext() { return {}; }
        };
    }
    const root = element(); root.clientWidth = 900; root.clientHeight = 500;
    globalThis.document = { createElement: element, getElementById: () => root };
    CLS_RenderGeneric.convert_File_Src = path => path;
    /** Supplies a small PDF.js double, including failure of local file access. */
    CLS_RenderPDF.prototype.load_PDF_Library = async function() {
        return { getDocument({ url }) {
            const pdf_Document = { numPages: 2,
                /** Returns independently rendered pages. */
                async getPage() { return {
                    /** Scales the test page without changing its ratio. */
                    getViewport({ scale }) { return { width: 200 * scale, height: 300 * scale }; },
                    /** Completes the canvas operation asynchronously. */
                    render() { return { promise: Promise.resolve(), cancel() {} }; },
                    /** Accepts page cleanup. */
                    cleanup() {}
                }; }
            };
            return { promise: /missing/.test(url) ? Promise.reject(new Error('Missing or denied PDF')) : Promise.resolve(pdf_Document),
                /** Records document destruction. */
                destroy() { destroy_Count++; return Promise.resolve(); }
            };
        } };
    };
    configure_Trace({ enabled: true, output: message => logs.push(message) });
    const restore = install_Poc_Instrumentation((clsRenderer, outcome) => outcomes.push(outcome));
    try {
        const clsBridge = new CLS_BackendBridge(null);
        // Capture prepared event JSON without installing a transport.
        const send_Message = clsBridge.send_Message.bind(clsBridge);
        clsBridge.send_Message = stData => { const json = send_Message(stData); events.push(JSON.parse(json)); return json; };
        const clsController = new CLS_FrontendController(clsBridge);
        clsBridge.clsFrontendController = clsController;
        const harness = create_Poc_Harness(clsBridge, clsController, root, (sectionId, status) => statuses.push({ sectionId, status }));
        assert.equal(harness.send_Test_Command('OPEN', 'pdf-poc-1', 'C:/one.pdf'), true);
        const clsFirstView = clsController.get_View('pdf-poc-1');
        const stOpeningJob = clsFirstView.stFrontendJob;
        assert.equal(clsFirstView.container.style.left, '225px');
        assert.equal(clsFirstView.container.style.top, '125px');
        assert.equal(events[0].data.eventType, 'OPENED');
        assert.equal(outcomes.length, 0);
        harness.send_Test_Command('OPEN', 'pdf-poc-2', 'C:/two.pdf');
        assert.equal(clsFirstView.container.style.height, '500px');
        harness.send_Test_Command('OPEN', 'pdf-poc-3', 'C:/three.pdf');
        assert.equal(clsController.mapViews.size, 3);
        assert.equal(new Set([...clsController.mapViews.values()]).size, 3);
        assert.equal(clsController.get_View('pdf-poc-3').container.style.left, '225px');
        assert.equal(clsController.get_View('pdf-poc-3').container.style.top, '250px');
        assert.equal(clsFirstView.stFrontendJob, stOpeningJob);
        assert.equal(stOpeningJob.stJobLayout.y, 125);
        assert.equal(harness.send_Test_Command('OPEN', 'pdf-poc-1', 'C:/duplicate.pdf'), false);
        assert.equal(clsController.get_View('pdf-poc-1'), clsFirstView);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(outcomes.filter(value => value === 'complete').length, 3);
        for (const clsView of clsController.mapViews.values()) assert.equal(clsView.contentContainer.children.length, 2);
        clsFirstView.request_Close();
        assert.equal(clsController.mapViews.size, 3);
        assert.equal(events.at(-1).data.eventType, 'CLOSE');
        const clsSecondRenderer = clsController.get_View('pdf-poc-2').clsRenderer;
        harness.send_Test_Command('CLOSE', 'pdf-poc-2');
        assert.deepEqual(harness.active_Sections(), ['pdf-poc-1', 'pdf-poc-3']);
        assert.equal(clsSecondRenderer.isReleased, true);
        assert.equal(clsFirstView.container.style.height, '500px');
        assert.equal(clsController.get_View('pdf-poc-3').container.style.left, '450px');
        assert.equal(events.at(-1).data.eventType, 'CLOSED');
        root.clientWidth = 1000;
        harness.reflow_Test_Layouts();
        assert.equal(clsController.get_View('pdf-poc-3').container.style.left, '500px');
        harness.send_Test_Command('CLOSE', 'pdf-poc-1');
        harness.send_Test_Command('CLOSE', 'pdf-poc-3');
        assert.equal(root.children.length, 0);
        assert.equal(clsController.mapViews.size, 0);
        assert.equal(destroy_Count, 3);
        harness.send_Test_Command('OPEN', 'pdf-poc-2', 'C:/missing.pdf');
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(outcomes.includes('error'));
        assert.equal(clsController.get_View('pdf-poc-2').isOpen, true);
        assert.equal(events.at(-1).data.eventType, 'OPENED');
        harness.send_Test_Command('CLOSE', 'pdf-poc-2');
        assert.equal(harness.send_Test_Command('CLOSE', 'pdf-poc-2'), false);
        assert.equal(harness.send_Test_Command('OPEN', 'pdf-poc-1', 'relative.pdf'), false);
        for (const point of ['CLS_BackendBridge.receive_Message ENTER', 'CLS_FrontendController.process_Command ENTER',
            'CLS_View.constructor COMPLETE', 'CLS_RenderGeneric.constructor COMPLETE', 'CLS_RenderPDF.constructor COMPLETE',
            'CLS_EventManager.event_Processing ENTER', 'CLS_RenderPDF.render START', 'CLS_RenderPDF.render COMPLETE',
            'CLS_RenderPDF.release_Render_Resources START']) assert.ok(logs.some(line => line.includes(point)), point);
        const opened_Index = logs.findIndex(line => line.includes('CLS_EventManager.event_Processing ENTER') && line.includes('OPENED'));
        const rendered_Index = logs.findIndex(line => line.includes('"operation": "renderPage"') && line.includes('COMPLETE'));
        assert.ok(opened_Index >= 0 && rendered_Index > opened_Index);
        assert.ok(events.every(envelope => envelope.messageType === 'EVENT' && Object.keys(envelope.data).sort().join(',') === 'eventType,sectionId'));
    } finally {
        await flush_Trace_Queue();
        restore(); configure_Trace();
        CLS_RenderGeneric.convert_File_Src = original_Converter;
        CLS_RenderPDF.prototype.load_PDF_Library = original_Loader;
        if (original_Document === undefined) delete globalThis.document;
        else globalThis.document = original_Document;
    }
});
