import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CLS_BackendBridge } from '../frontend/infrastructure/CLS_BackendBridge.js';
import { E_CommandType } from '../frontend/domain/DUT/ENUM/E_CommandType.js';
import { E_EventType } from '../frontend/domain/DUT/ENUM/E_EventType.js';
import { ST_FrontendToBackendData } from '../frontend/domain/DUT/STRUCT/ST_FrontendToBackendData.js';

test('Python commands reach JavaScript without emitting confirmations', () => {
    const backend_Path = fileURLToPath(new URL('../../viewer_backend/', import.meta.url));
    const python_Code = `
import json
from src.backend.infrastructure.CLS_FrontendBridge import CLS_FrontendBridge
from src.backend.domain.DUT.STRUCT.ST_BackendToFrontendData import ST_BackendToFrontendData
from src.backend.domain.DUT.STRUCT.ST_JobLayout import ST_JobLayout
from src.backend.domain.DUT.ENUM.E_CommandType import E_CommandType
from src.backend.domain.DUT.ENUM.E_FileType import E_FileType
clsBridge = CLS_FrontendBridge()
messages = []
for command in (E_CommandType.OPEN, E_CommandType.CLOSE):
    stData = ST_BackendToFrontendData(E_FileType.PDF, "section-1", "a.pdf", "a.pdf", ST_JobLayout(10, 20, 800, 600), command)
    messages.append(clsBridge.convert_data_from_backend_to_frontend(stData))
print(json.dumps(messages))
`;
    const messages_From_Python = JSON.parse(execFileSync('python', ['-B', '-c', python_Code], { cwd: backend_Path, encoding: 'utf8' }));
    const received_Data = [];
    const clsBridge = new CLS_BackendBridge({ process_Command(value) { received_Data.push(value); } });
    clsBridge.convert_Data_From_Frontend_To_Backend = () => assert.fail('Command reception must not emit a confirmation');
    for (const json_Message of messages_From_Python) {
        clsBridge.receive_Message(json_Message);
        assert.deepEqual(JSON.parse(JSON.stringify(received_Data.at(-1))), JSON.parse(json_Message).data);
    }
    assert.equal(received_Data[0].commandType, E_CommandType.OPEN);
    assert.equal(received_Data[1].commandType, E_CommandType.CLOSE);
    assert.equal(received_Data[1].sectionId, 'section-1');
});

test('JavaScript confirmations deserialize into Python snake_case fields', () => {
    const backend_Path = fileURLToPath(new URL('../../viewer_backend/', import.meta.url));
    const clsBridge = new CLS_BackendBridge({});
    for (const event_Type of Object.values(E_EventType)) {
        const stFrontendToBackendData = new ST_FrontendToBackendData();
        stFrontendToBackendData.eventType = event_Type;
        stFrontendToBackendData.sectionId = 'section-1';
        const json_Message = clsBridge.convert_Data_From_Frontend_To_Backend(stFrontendToBackendData);
        assert.deepEqual(JSON.parse(json_Message), { messageType: 'EVENT', data: { eventType: event_Type, sectionId: 'section-1' } });
        const python_Code = `
import json, sys
from src.backend.infrastructure.CLS_FrontendBridge import CLS_FrontendBridge
stData = CLS_FrontendBridge().convert_data_from_frontend_to_backend(sys.stdin.read())
print(json.dumps({"event_type": stData.event_type.value, "section_id": stData.section_id}))
`;
        const parsed_Data = JSON.parse(execFileSync('python', ['-B', '-c', python_Code], { cwd: backend_Path, input: json_Message, encoding: 'utf8' }));
        assert.deepEqual(parsed_Data, { event_type: event_Type, section_id: 'section-1' });
    }
});
