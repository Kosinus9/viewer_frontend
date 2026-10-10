/** Provides the common contract for content renderers. */
export class CLS_RenderGeneric {
    static convert_File_Src = null;

    /** Initializes a renderer with the content container owned by its View. */
    constructor(contentContainer) {
        const is_DOM_Element = contentContainer !== null
            && typeof contentContainer === 'object'
            && contentContainer.nodeType === 1
            && typeof contentContainer.replaceChildren === 'function';

        if (!is_DOM_Element) {
            throw new TypeError('contentContainer must be a valid DOM element.');
        }

        this.contentContainer = contentContainer;
    }

    /** Defines the asynchronous rendering contract implemented by specialized renderers. */
    async render(filePath) {
        throw new Error(
            `${this.constructor.name}.render(filePath) must be implemented by a specialized renderer.`
        );
    }

    /** Converts a local file path into a URL supported by the Tauri WebView. */
    async convert_file_path_In_URL(filePath) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new TypeError('filePath must be a non-empty string.');
        }

        let convert_File_Src = CLS_RenderGeneric.convert_File_Src;

        if (convert_File_Src === null) {
            const tauri_Core = await import('@tauri-apps/api/core');
            convert_File_Src = tauri_Core.convertFileSrc;
        }

        return convert_File_Src(filePath);
    }

    /** Releases content resources while preserving the View-owned container. */
    release_Render_Resources() {
        this.contentContainer.replaceChildren();
    }
}
