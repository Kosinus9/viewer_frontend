import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLS_FrontendController } from '../frontend/application/CLS_FrontendController.js';
import { CLS_BackendBridge } from '../frontend/infrastructure/CLS_BackendBridge.js';
import { CLS_View } from '../frontend/domain/CLS_View.js';

class CLS_TestView {
    /** Records the dependencies of one simulated window. */
    constructor(sectionId, clsEventManager) { this.sectionId = sectionId; this.clsEventManager = clsEventManager; this.commands = []; this.isOpen = false; }
    /** Records commands without generating premature confirmations. */
    execute_Command(stData) { this.commands.push(stData); }
    /** Records cleanup after failed initialization. */
    release_View_Resources() { this.disposed = true; }
}
/** Creates isolated dependencies for controller tests. */
function setup() {
    const sent_Events = [];
    const clsController = new CLS_FrontendController({
        /** Captures structures without performing network operations. */
        send_Message(stData) { sent_Events.push(stData); }
    }, CLS_TestView);
    return { clsController, sent_Events };
}
/** Returns a full opening job without changing backend values. */
function job(sectionId) { return { commandType: 'OPEN', sectionId, fileName: 'a', fileType: 'text', filePath: 'a.txt', stJobLayout: { x: 2, y: 3, width: 4, height: 5 } }; }

test('OPEN creates independent instances and preserves the exact job; duplicates fail', () => {
    const { clsController, sent_Events } = setup();
    const stJob = job('a');
    clsController.process_Command(stJob); clsController.process_Command(job('b'));
    assert.equal(clsController.mapViews.size, 2);
    assert.notEqual(clsController.get_View('a'), clsController.get_View('b'));
    assert.equal(clsController.get_View('a').commands[0], stJob);
    assert.throws(() => clsController.process_Command(job('a')), /Duplicate/);
    assert.equal(clsController.get_View('a').commands.length, 1);
    assert.equal(sent_Events.length, 0);
    assert.equal(clsController.process_Data, undefined);
});

test('CLOSE is minimal and registry removal waits for effective CLOSED', () => {
    const { clsController, sent_Events } = setup();
    clsController.process_Command(job('a')); clsController.process_Command(job('b'));
    const clsView = clsController.get_View('a'); clsView.isOpen = true;
    clsController.process_Command({ ...job('a'), commandType: 'CLOSE' });
    assert.deepEqual(clsView.commands[1], { commandType: 'CLOSE', sectionId: 'a' });
    clsController.process_Event({ eventType: 'CLOSED', sectionId: 'a' }, clsView);
    assert.equal(clsController.get_View('a'), clsView);
    clsView.isOpen = false;
    clsController.process_Event({ eventType: 'CLOSED', sectionId: 'a' }, clsView);
    assert.equal(clsController.get_View('a'), undefined);
    assert.ok(clsController.get_View('b'));
    assert.deepEqual({ ...sent_Events[0] }, { eventType: 'CLOSED', sectionId: 'a' });
});

test('requests do not close Views, stale confirmations cannot remove replacements', () => {
    const { clsController, sent_Events } = setup();
    clsController.process_Command(job('a'));
    const clsOldView = clsController.get_View('a');
    clsOldView.isOpen = true;
    for (const event_Type of ['OPEN', 'CLOSE', 'OPENED']) clsOldView.clsEventManager.event_Processing(event_Type, 'a', clsOldView);
    assert.equal(clsOldView.commands.length, 1);
    assert.deepEqual(sent_Events.map(stData => stData.eventType), ['OPEN', 'CLOSE', 'OPENED']);
    clsOldView.isOpen = false;
    clsOldView.clsEventManager.event_Processing('CLOSED', 'a', clsOldView);
    clsController.process_Command(job('a'));
    const clsNewView = clsController.get_View('a');
    clsOldView.clsEventManager.event_Processing('CLOSED', 'a', clsOldView);
    assert.equal(clsController.get_View('a'), clsNewView);
    assert.equal(sent_Events.length, 4);
});

test('unknown commands are ignored and unknown CLOSE does not create a View', () => {
    const { clsController } = setup();
    clsController.process_Command({ commandType: 'UNKNOWN', sectionId: 'a' });
    assert.throws(() => clsController.process_Command({ commandType: 'CLOSE', sectionId: 'a' }), /Unknown/);
    assert.equal(clsController.mapViews.size, 0);
});

test('failed initialization disposes its instance and removes its reference', () => {
    const { clsController } = setup();
    let clsFailedView;
    class CLS_FailedView extends CLS_TestView {
        /** Records its instance before simulating an initialization failure. */
        execute_Command() { clsFailedView = this; throw new Error('Initialization failed'); }
    }
    clsController.ViewClass = CLS_FailedView;
    assert.throws(() => clsController.process_Command(job('a')), /Initialization failed/);
    assert.equal(clsFailedView.disposed, true);
    assert.equal(clsController.mapViews.size, 0);
});

test('controller routing does not access the DOM', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, get() { assert.fail('Controller DOM access'); } });
    try { const { clsController } = setup(); clsController.process_Command(job('a')); clsController.process_Command({ commandType: 'CLOSE', sectionId: 'a' }); }
    finally { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; }
});

test('real View creates/removes DOM, X requests closure, bridge retains JSON conversion', () => {
    const original = globalThis.document;
    /** Creates a minimal DOM double with observable resource lifecycle. */
    function element() {
        return { style: {}, dataset: {}, children: [], handlers: new Map(),
            /** Attaches a child to this element. */
            appendChild(child) { this.children.push(child); child.parent = this; },
            /** Removes this element from its parent. */
            remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); },
            /** Records a DOM listener. */
            addEventListener(type, handler) { this.handlers.set(type, handler); },
            /** Releases a DOM listener. */
            removeEventListener(type) { this.handlers.delete(type); }
        };
    }
    const root = element();
    globalThis.document = { getElementById: () => root, createElement: element };
    try {
        const json_Messages = [];
        const clsBridge = new CLS_BackendBridge(null, json_Message => json_Messages.push(JSON.parse(json_Message)));
        const clsController = new CLS_FrontendController(clsBridge, CLS_View); clsBridge.clsFrontendController = clsController;
        clsBridge.receive_Message(JSON.stringify({ messageType: 'COMMAND', data: job('a') }));
        const clsView = clsController.get_View('a');
        assert.equal(root.children.length, 1); assert.equal(clsView.container.dataset.sectionId, 'a');
        assert.equal(json_Messages[0].data.eventType, 'OPENED');
        const button = clsView.closeButton;
        button.handlers.get('click')();
        assert.equal(root.children.length, 1); assert.equal(json_Messages[1].data.eventType, 'CLOSE');
        clsController.process_Command({ commandType: 'CLOSE', sectionId: 'a' });
        assert.equal(root.children.length, 0); assert.equal(button.handlers.size, 0);
        assert.equal(clsController.mapViews.size, 0); assert.equal(json_Messages[2].data.eventType, 'CLOSED');
        assert.ok(json_Messages.every(message => message.data.sectionId === 'a'));
    } finally { if (original === undefined) delete globalThis.document; else globalThis.document = original; }
});

/** Runs View lifecycle tests with a DOM double and restores the global document. */
function with_Dom(run) {
    const original_Document = globalThis.document;
    let creation_Count = 0;
    const dom_State = { failCreateAt: 0, failAppend: false, missingRoot: false };
    /** Creates independent DOM nodes with observable listeners and styles. */
    function create_Element(tagName) {
        creation_Count++;
        if (creation_Count === dom_State.failCreateAt) throw new Error('Construction failure');
        return { tagName, dataset: {}, style: {}, children: [], handlers: new Map(),
            /** Attaches the child unless an insertion failure is requested. */
            appendChild(child) {
                if (this === dom_State.root && dom_State.failAppend) throw new Error('Insertion failure');
                this.children.push(child); child.parent = this;
            },
            /** Removes the node, preserving retryability after a simulated failure. */
            remove() {
                if (this.failRemove) throw new Error('Removal failure');
                if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
            },
            /** Stores a listener for click simulation. */
            addEventListener(type, handler) { this.handlers.set(type, handler); },
            /** Removes a listener during resource cleanup. */
            removeEventListener(type) { this.handlers.delete(type); }
        };
    }
    dom_State.root = create_Element('main');
    globalThis.document = { getElementById: () => dom_State.missingRoot ? null : dom_State.root, createElement: create_Element };
    try { run(dom_State); }
    finally { if (original_Document === undefined) delete globalThis.document; else globalThis.document = original_Document; }
}

test('View constructs the expected HTML and preserves pixel layout and job identity', () => with_Dom(dom_State => {
    const event_Log = [];
    const clsView = new CLS_View('a', {
        /** Checks that OPENED follows attachment and completed initialization. */
        event_Processing(eventType, sectionId, clsSource) {
            assert.equal(clsSource.isOpen, true); assert.equal(dom_State.root.children[0], clsSource.container);
            event_Log.push({ eventType, sectionId });
        }
    });
    const stJob = job('a'); stJob.fileName = '<img src=x>'; stJob.stJobLayout.x = -2.5;
    clsView.execute_Command(stJob);
    const header_Element = clsView.container.children[0];
    assert.equal(clsView.container.tagName, 'section');
    assert.equal(header_Element.tagName, 'header'); assert.equal(header_Element.className, 'view-header');
    assert.equal(header_Element.children[0].tagName, 'span');
    assert.equal(header_Element.children[0].textContent, '<img src=x>');
    assert.equal(header_Element.children[1], clsView.closeButton);
    assert.equal(clsView.container.children[1], clsView.contentContainer);
    assert.equal(clsView.contentContainer.className, 'view-content');
    assert.deepEqual(clsView.container.style, { left: '-2.5px', top: '3px', width: '4px', height: '5px' });
    assert.equal(clsView.stFrontendJob, stJob); assert.equal(clsView.clsRenderer, null);
    assert.deepEqual(event_Log, [{ eventType: 'OPENED', sectionId: 'a' }]);
    assert.throws(() => clsView.execute_Command(stJob), /already open/);
    assert.throws(() => clsView.execute_Command({ commandType: 'CLOSE', sectionId: 'b' }), /mismatch/);
}));

test('missing or invalid layouts and missing root never emit OPENED', () => with_Dom(dom_State => {
    for (const layout_Value of [undefined, null, {}, { x: 0, y: 0, width: 0, height: 5 }, { x: '2', y: 0, width: 5, height: 5 }, { x: NaN, y: 0, width: 5, height: 5 }]) {
        const clsView = new CLS_View('a', { event_Processing: () => assert.fail('Premature OPENED') });
        assert.throws(() => clsView.execute_Command({ ...job('a'), stJobLayout: layout_Value }), /layout/);
        assert.equal(clsView.isOpen, false); assert.equal(clsView.container, null); assert.equal(clsView.stFrontendJob, null);
    }
    dom_State.missingRoot = true;
    const clsView = new CLS_View('a', { event_Processing: () => assert.fail('Premature OPENED') });
    assert.throws(() => clsView.execute_Command(job('a')), /root/);
}));

test('partial construction and insertion failures clean resources and registry', () => with_Dom(dom_State => {
    dom_State.failAppend = true;
    let clsFailedView;
    class CLS_ObservedView extends CLS_View {
        /** Captures the actual View instance for post-failure inspection. */
        constructor(sectionId, clsEventManager) { super(sectionId, clsEventManager); clsFailedView = this; }
    }
    const clsController = new CLS_FrontendController({ send_Message: () => assert.fail('Premature event') }, CLS_ObservedView);
    assert.throws(() => clsController.process_Command(job('a')), /Insertion failure/);
    assert.equal(clsController.mapViews.size, 0); assert.equal(dom_State.root.children.length, 0);
    for (const field_Name of ['container', 'closeButton', 'close_Handler', 'contentContainer', 'stFrontendJob', 'clsRenderer']) assert.equal(clsFailedView[field_Name], null);
    dom_State.failAppend = false; dom_State.failCreateAt = 8;
    assert.throws(() => clsController.process_Command(job('b')), /Construction failure/);
    assert.equal(clsController.mapViews.size, 0);
}));

test('failed CLOSE emits no CLOSED, successful retry releases resources idempotently', () => with_Dom(dom_State => {
    const event_Log = [];
    const clsEventManager = { event_Processing: event_Type => event_Log.push(event_Type) };
    const clsView = new CLS_View('a', clsEventManager);
    clsView.execute_Command(job('a'));
    const button_Element = clsView.closeButton; const late_Handler = clsView.close_Handler;
    clsView.container.failRemove = true;
    assert.throws(() => clsView.execute_Command({ commandType: 'CLOSE', sectionId: 'a' }), /Removal failure/);
    assert.equal(clsView.isOpen, true); assert.deepEqual(event_Log, ['OPENED']);
    clsView.container.failRemove = false;
    clsView.execute_Command({ commandType: 'CLOSE', sectionId: 'a' });
    clsView.release_View_Resources(); clsView.release_View_Resources(); late_Handler();
    assert.deepEqual(event_Log, ['OPENED', 'CLOSED']); assert.equal(dom_State.root.children.length, 0);
    assert.equal(button_Element.handlers.size, 0); assert.equal(clsView.sectionId, 'a'); assert.equal(clsView.clsEventManager, clsEventManager);
}));

test('multiple real Views own separate DOM and close independently', () => with_Dom(dom_State => {
    const clsController = new CLS_FrontendController({ send_Message: () => {} });
    clsController.process_Command(job('a')); clsController.process_Command(job('b'));
    const clsFirstView = clsController.get_View('a'); const clsSecondView = clsController.get_View('b');
    assert.notEqual(clsFirstView.contentContainer, clsSecondView.contentContainer);
    clsController.process_Command({ commandType: 'CLOSE', sectionId: 'a' });
    assert.equal(dom_State.root.children.length, 1); assert.equal(dom_State.root.children[0], clsSecondView.container);
    assert.equal(clsController.get_View('a'), undefined); assert.equal(clsSecondView.isOpen, true);
}));


test('invalid jobs and missing command fields fail before DOM construction', () => {
    const clsView = new CLS_View('a', { event_Processing: () => assert.fail('Unexpected event') });
    clsView.create_Container = () => assert.fail('Invalid data reached DOM construction');
    for (const invalid_Job of [undefined, null, false, 2, 'OPEN', [], {}, { commandType: 'OPEN' }, { sectionId: 'a' }, { commandType: '', sectionId: 'a' }]) {
        assert.throws(() => clsView.execute_Command(invalid_Job), /valid job object|commandType and sectionId/);
    }
    assert.throws(() => clsView.execute_Command(job('b')), /mismatch/);
    assert.equal(clsView.isOpen, false);
    assert.equal(clsView.container, null);
});

test('OPEN validates fileName and delegates unchanged data before confirming success', () => with_Dom(dom_State => {
    const event_Log = [];
    const clsView = new CLS_View('a', { event_Processing: event_Type => event_Log.push(event_Type) });
    const create_Container = clsView.create_Container;
    let creation_Count = 0;
    const stJob = job('a');
    clsView.create_Container = function(stJobFrontend, root_Element) {
        creation_Count++;
        assert.equal(stJobFrontend, stJob);
        assert.equal(root_Element, dom_State.root);
        assert.equal(this.isOpen, false);
        assert.deepEqual(event_Log, []);
        return create_Container.call(this, stJobFrontend, root_Element);
    };
    for (const invalid_Name of [undefined, null, 123, {}]) {
        assert.throws(() => clsView.execute_Command({ ...stJob, fileName: invalid_Name }), /fileName/);
    }
    assert.equal(creation_Count, 0);
    clsView.execute_Command(stJob);
    assert.equal(creation_Count, 1);
    assert.deepEqual(event_Log, ['OPENED']);
    clsView.execute_Command({ commandType: 'CLOSE', sectionId: 'a' });
    assert.deepEqual(event_Log, ['OPENED', 'CLOSED']);
}));


test('renderer selection rejects unknown and undefined values without altering View lifecycle', () => {
    const clsView = new CLS_View('a', { event_Processing: () => assert.fail('Selection must not emit events') });
    const content_Element = {};
    clsView.contentContainer = content_Element;
    for (const file_Type of [undefined, null, 'UNKNOWN', 'PDF', 'IMAGE', 'VIDEO', 'TEXT']) {
        assert.throws(() => clsView.choose_Special_Renderer(file_Type), /Unsupported fileType/);
    }
    assert.equal(clsView.contentContainer, content_Element);
    assert.equal(clsView.clsRenderer, null);
    assert.equal(clsView.isOpen, false);
});
