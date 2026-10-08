import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLS_FrontendController } from '../frontend/application/CLS_FrontendController.js';
import { CLS_BackendBridge } from '../frontend/infrastructure/CLS_BackendBridge.js';
import { ST_BackendToFrontendData } from '../frontend/domain/DUT/STRUCT/ST_BackendToFrontendData.js';
import { ST_FrontendEvent } from '../frontend/domain/DUT/STRUCT/ST_FrontendEvent.js';
import { ST_FrontendToBackendData } from '../frontend/domain/DUT/STRUCT/ST_FrontendToBackendData.js';
import { E_CommandType } from '../frontend/domain/DUT/ENUM/E_CommandType.js';
import { E_EventType } from '../frontend/domain/DUT/ENUM/E_EventType.js';
import { E_FrontendEvent } from '../frontend/domain/DUT/ENUM/E_FrontendEvent.js';

test('OPEN and CLOSE report the missing Viewer without emitting confirmations', () => {
    const clsController = new CLS_FrontendController({
        /** Fails if command reception attempts to prepare a confirmation. */
        convert_Data_From_Frontend_To_Backend() { assert.fail('Premature confirmation'); },
    });
    for (const command_Type of Object.values(E_CommandType)) {
        const stBackendToFrontendData = new ST_BackendToFrontendData();
        stBackendToFrontendData.commandType = command_Type;
        stBackendToFrontendData.sectionId = 'section-2';
        assert.throws(() => clsController.process_Command(stBackendToFrontendData),
            new RegExp(`Viewer interface.*${command_Type}.*section-2`));
    }
    assert.equal(clsController.process_Command({ commandType: 'UNKNOWN', sectionId: 'section-2' }), undefined);
    assert.equal(clsController.process_Data, undefined);
    assert.deepEqual(Object.keys(clsController), ['clsBackendBridge']);
});

test('user CLOSE does not close a View or become a CLOSED confirmation', () => {
    const clsController = new CLS_FrontendController({
        /** Fails if a user request is serialized as a confirmation. */
        convert_Data_From_Frontend_To_Backend() { assert.fail('User request is not a confirmation'); },
    });
    const stFrontendEvent = new ST_FrontendEvent();
    stFrontendEvent.eventType = E_FrontendEvent.CLOSE;
    stFrontendEvent.sectionId = 'section-3';
    assert.throws(() => clsController.process_Event(stFrontendEvent), /user CLOSE request.*section-3.*not defined/);
});

test('reported confirmations preserve sectionId through the real bridge interface', () => {
    const prepared_Data = [];
    const clsRealBridge = new CLS_BackendBridge({});
    const clsController = new CLS_FrontendController({
        /** Observes the typed confirmation and delegates to actual serialization. */
        convert_Data_From_Frontend_To_Backend(stFrontendToBackendData) {
            prepared_Data.push(stFrontendToBackendData);
            return clsRealBridge.convert_Data_From_Frontend_To_Backend(stFrontendToBackendData);
        },
    });
    for (const event_Type of Object.values(E_EventType)) {
        const stFrontendEvent = new ST_FrontendEvent();
        stFrontendEvent.eventType = event_Type;
        stFrontendEvent.sectionId = 'section-4';
        assert.deepEqual(JSON.parse(clsController.process_Event(stFrontendEvent)), {
            messageType: 'EVENT', data: { eventType: event_Type, sectionId: 'section-4' },
        });
        assert.ok(prepared_Data.at(-1) instanceof ST_FrontendToBackendData);
    }
    assert.equal(clsController.process_Event({ eventType: 'UNKNOWN', sectionId: 'section-4' }), undefined);
    assert.equal(prepared_Data.length, 2);
});

test('bridge forwards the same instance to the sole command entry point', () => {
    const received_Data = [];
    const clsBridge = new CLS_BackendBridge({
        /** Captures commands without implementing Viewer behavior. */
        process_Command(stBackendToFrontendData) { received_Data.push(stBackendToFrontendData); },
    });
    const stBackendToFrontendData = new ST_BackendToFrontendData();
    stBackendToFrontendData.sectionId = 'section-5';
    clsBridge.send_Data_To_Frontend_Controller(stBackendToFrontendData);
    assert.equal(received_Data[0], stBackendToFrontendData);
});

test('controller processing does not access the DOM', () => {
    const original_Descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, get() { assert.fail('DOM access'); } });
    try {
        const clsController = new CLS_FrontendController(new CLS_BackendBridge({}));
        assert.throws(() => clsController.process_Command({ commandType: E_CommandType.OPEN, sectionId: 's' }), /Viewer interface/);
        assert.throws(() => clsController.process_Command({ commandType: E_CommandType.CLOSE, sectionId: 's' }), /Viewer interface/);
        assert.throws(() => clsController.process_Event({ eventType: E_FrontendEvent.CLOSE, sectionId: 's' }), /not defined/);
        clsController.process_Event({ eventType: E_EventType.OPENED, sectionId: 's' });
        clsController.process_Event({ eventType: E_EventType.CLOSED, sectionId: 's' });
    } finally {
        if (original_Descriptor) Object.defineProperty(globalThis, 'document', original_Descriptor);
        else delete globalThis.document;
    }
});
