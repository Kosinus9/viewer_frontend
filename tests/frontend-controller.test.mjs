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
    dispose() { this.disposed = true; }
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
function job(sectionId) { return { commandType: 'OPEN', sectionId, fileName: 'a', fileType: 'PDF', filePath: 'a.pdf', stJobLayout: { x: 2, y: 3, width: 4, height: 5 } }; }

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
        return { dataset: {}, children: [], handlers: new Map(),
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
