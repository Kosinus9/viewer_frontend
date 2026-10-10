import assert from 'node:assert/strict';
import test from 'node:test';
import { CLS_RenderPDF } from '../frontend/domain/renderer/CLS_RenderPDF.js';
import { CLS_View } from '../frontend/domain/CLS_View.js';
import { E_FileType } from '../frontend/domain/DUT/ENUM/E_FileType.js';
import { CLS_FrontendController } from '../frontend/application/CLS_FrontendController.js';
import { CLS_BackendBridge } from '../frontend/infrastructure/CLS_BackendBridge.js';

/** Creates a controllable promise for cancellation tests. */
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

/** Creates a renderer with observable PDF.js and DOM doubles. */
function setup(options = {}) {
    const renders = [], pages = [], container = {
        nodeType: 1, clientWidth: 400, children: [],
        ownerDocument: { createElement: () => ({ setAttribute() {}, getContext: () => ({}) }) },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; }
    };
    const pdf_Document = {
        numPages: 3,
        async getPage(number) {
            if (options.pagePromise) return options.pagePromise;
            const page = {
                getViewport: ({ scale }) => ({ width: 200 * scale, height: 300 * scale }),
                render(settings) {
                    renders.push(settings);
                    return { promise: options.renderPromise || Promise.resolve(), cancel() { options.onCancel?.(); } };
                },
                cleanup() { pages.push(number); }
            };
            return page;
        }
    };
    let destroys = 0;
    const clsRenderer = new CLS_RenderPDF(container);
    clsRenderer.convert_file_path_In_URL = async () => options.urlPromise || 'asset://test.pdf';
    clsRenderer.load_PDF_Library = async () => ({
        getDocument: () => ({ promise: options.loadPromise || Promise.resolve(pdf_Document), destroy() { destroys++; options.onDestroy?.(); return Promise.resolve(); } })
    });
    return { clsRenderer, container, renders, pages, destroys: () => destroys };
}

test('PDF paints all pages sequentially at available width and releases only content', async () => {
    const { clsRenderer, container, renders, pages, destroys } = setup();
    await clsRenderer.render('C:/documents/a.pdf');
    assert.equal(container.children.length, 3);
    assert.deepEqual(renders.map(value => value.viewport), Array(3).fill({ width: 400, height: 600 }));
    assert.deepEqual(pages, [1, 2, 3]);
    assert.equal(clsRenderer.pdfDocument.numPages, 3);
    await clsRenderer.release_Render_Resources();
    await clsRenderer.release_Render_Resources();
    assert.equal(destroys(), 1);
    assert.equal(clsRenderer.pdfDocument, null);
    assert.equal(clsRenderer.contentContainer, container);
    assert.equal(container.children.length, 0);
});

test('PDF rejects invalid and remote paths', async () => {
    for (const path of [null, '', '  ', 'https://example.com/a.pdf', 'file:///a.pdf']) {
        await assert.rejects(setup().clsRenderer.render(path), TypeError);
    }
});

test('missing or invalid PDF propagates load failure and destroys the loading task', async () => {
    for (const message of ['Missing PDF', 'Invalid PDF']) {
        const { clsRenderer, container, destroys } = setup({ loadPromise: Promise.reject(new Error(message)) });
        await assert.rejects(clsRenderer.render('C:/a.pdf'), new RegExp(message));
        assert.equal(destroys(), 1);
        assert.equal(container.children.length, 0);
    }
});

test('close during path conversion prevents starting PDF.js', async () => {
    const pending = deferred();
    const { clsRenderer, container } = setup({ urlPromise: pending.promise });
    const rendering = clsRenderer.render('C:/a.pdf');
    await clsRenderer.release_Render_Resources();
    pending.resolve('asset://test');
    await rendering;
    assert.equal(clsRenderer.loadingTask, null);
    assert.equal(container.children.length, 0);
});

test('close during document loading destroys the task and suppresses cancellation', async () => {
    const pending = deferred();
    const { clsRenderer, container, destroys } = setup({ loadPromise: pending.promise, onDestroy: () => pending.reject(new Error('Cancelled')) });
    const rendering = clsRenderer.render('C:/a.pdf');
    await new Promise(resolve => setImmediate(resolve));
    await clsRenderer.release_Render_Resources();
    await rendering;
    assert.equal(destroys(), 1);
    assert.equal(container.children.length, 0);
});

test('close during canvas rendering cancels work and never appends another page', async () => {
    const pending = deferred();
    let cancellations = 0;
    const { clsRenderer, container } = setup({ renderPromise: pending.promise, onCancel: () => { cancellations++; pending.reject(new Error('Cancelled')); } });
    const rendering = clsRenderer.render('C:/a.pdf');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(container.children.length, 1);
    await clsRenderer.release_Render_Resources();
    await rendering;
    assert.equal(cancellations, 1);
    assert.equal(container.children.length, 0);
});

test('View selects CLS_RenderPDF using the backend lowercase enum', () => {
    const clsView = new CLS_View('section', {});
    clsView.contentContainer = setup().container;
    assert.ok(clsView.choose_Special_Renderer(E_FileType.PDF) instanceof CLS_RenderPDF);
    assert.equal(E_FileType.PDF, 'pdf');
});

test('PDF OPENED precedes render completion; CLOSE clears renderer and preserves section routing', async () => {
    const original_Document = globalThis.document;
    const original_Render = CLS_RenderPDF.prototype.render;
    const pending = deferred();
    let received_Path;
    /** Records an unfinished content operation independently of OPENED. */
    CLS_RenderPDF.prototype.render = function(filePath) { received_Path = filePath; return pending.promise; };
    /** Creates a minimal View DOM with removable content. */
    function element() {
        return { nodeType: 1, children: [], dataset: {}, style: {},
            appendChild(child) { this.children.push(child); child.parent = this; },
            replaceChildren() { this.children = []; },
            addEventListener() {}, removeEventListener() {},
            remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
        };
    }
    const root = element();
    globalThis.document = { createElement: element, getElementById: () => root };
    try {
        const messages = [];
        const clsBridge = new CLS_BackendBridge(null, value => messages.push(JSON.parse(value)));
        const clsController = new CLS_FrontendController(clsBridge);
        clsBridge.clsFrontendController = clsController;
        clsBridge.receive_Message(JSON.stringify({ messageType: 'COMMAND', data: {
            commandType: 'OPEN', sectionId: 'pdf-section', fileType: 'pdf', fileName: 'a.pdf', filePath: 'C:/a.pdf',
            stJobLayout: { x: 0, y: 0, width: 400, height: 300 }
        } }));
        const clsView = clsController.get_View('pdf-section');
        const clsRenderer = clsView.clsRenderer;
        assert.equal(received_Path, 'C:/a.pdf');
        assert.equal(root.children.length, 1);
        assert.equal(clsView.container.dataset.sectionId, 'pdf-section');
        assert.deepEqual(messages[0].data, { eventType: 'OPENED', sectionId: 'pdf-section' });
        clsController.process_Command({ commandType: 'CLOSE', sectionId: 'pdf-section' });
        assert.equal(clsRenderer.isReleased, true);
        assert.equal(root.children.length, 0);
        assert.equal(clsController.mapViews.size, 0);
        assert.deepEqual(messages[1].data, { eventType: 'CLOSED', sectionId: 'pdf-section' });
        pending.resolve();
        await pending.promise;
        assert.equal(root.children.length, 0);
    } finally {
        CLS_RenderPDF.prototype.render = original_Render;
        if (original_Document === undefined) delete globalThis.document;
        else globalThis.document = original_Document;
    }
});
