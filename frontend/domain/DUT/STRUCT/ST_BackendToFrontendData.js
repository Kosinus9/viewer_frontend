import { ST_JobLayout } from './ST_JobLayout.js';

/** Backend-to-frontend data declaration; no defaults or enrichment. */
export class ST_BackendToFrontendData {
    /** @type {(typeof import('../ENUM/E_CommandType.js').E_CommandType)[keyof typeof import('../ENUM/E_CommandType.js').E_CommandType]} */
    commandType;
    fileName;
    fileType;
    filePath;
    sectionId;
    /** @type {ST_JobLayout} */
    stJobLayout;
}
