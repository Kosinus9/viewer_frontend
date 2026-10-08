import { ST_JobLayout } from './ST_JobLayout.js';

/** Backend-to-frontend data declaration; no defaults or enrichment. */
export class ST_BackendToFrontendData {
    fileName;
    fileType;
    filePath;
    sectionId;
    /** @type {ST_JobLayout} */
    stJobLayout;
}
