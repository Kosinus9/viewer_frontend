import { CLS_RenderGeneric }        from './CLS_RenderGeneric.js';
import { trace_Instance }           from '../../trace-execution.js';

/** Renders local PDF pages sequentially inside a View-owned container. */
export class CLS_RenderPDF extends CLS_RenderGeneric {
    /** Initializes document, loading and rendering resource references. */
    constructor(contentContainer) {
        super(contentContainer);
        this.pdfDocument            = null;
        this.loadingTask            = null;
        this.renderTask             = null;
        this.isReleased             = false;
        this.renderStarted          = false;
        this.releasePromise         = null;
        trace_Instance(this, 'CLS_RenderPDF', 'constructor', 'COMPLETE');
    }

    /** Loads the locally bundled PDF.js library and its matching worker. */
    async load_PDF_Library() {
        const pdf_Library           = await import('pdfjs-dist/build/pdf.mjs');
        const worker_Module         = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdf_Library.GlobalWorkerOptions.workerSrc = worker_Module.default;
        return pdf_Library;
    }

    /** Loads a local PDF and paints each page at the available container width. */
    async render(filePath) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new TypeError('filePath must be a non-empty string.');
        }

        if (/^[a-z][a-z\d+.-]*:/i.test(filePath) && !/^[a-z]:[\\/]/i.test(filePath)) {
            throw new TypeError('PDF rendering requires a local file path.');
        }

        if (this.isReleased || this.renderStarted) throw new Error('PDF renderer is already used or released.');
        this.renderStarted = true;

        try {
            const file_URL = await this.convert_file_path_In_URL(filePath);
            if (this.isReleased) return;
            const pdf_Library = await this.load_PDF_Library();
            if (this.isReleased) return;
            this.loadingTask = pdf_Library.getDocument({ url: file_URL, isEvalSupported: false });
            trace_Instance(this, 'CLS_RenderPDF', 'render', 'START', { operation: 'loadDocument', filePath });
            const pdf_Document = await this.loadingTask.promise;
            if (this.isReleased) return;
            this.pdfDocument = pdf_Document;
            trace_Instance(this, 'CLS_RenderPDF', 'render', 'COMPLETE', { operation: 'loadDocument', numPages: pdf_Document.numPages });
            for (let page_Number = 1; page_Number <= pdf_Document.numPages; page_Number++) {
                trace_Instance(this, 'CLS_RenderPDF', 'render', 'START', { operation: 'renderPage', pageNumber: page_Number });
                const pdf_Page = await pdf_Document.getPage(page_Number);
                if (this.isReleased) return;
                try {
                    const base_Viewport     = pdf_Page.getViewport({ scale: 1 });
                    const available_Width   = this.contentContainer.clientWidth;

                    if (!(available_Width > 0)) throw new Error('PDF container has no available width.');

                    const page_Viewport     = pdf_Page.getViewport({ scale: available_Width / base_Viewport.width });
                    const pixel_Ratio       = globalThis.devicePixelRatio || 1;
                    const page_Canvas       = this.contentContainer.ownerDocument.createElement('canvas');

                    page_Canvas.className   = 'pdf-page';
                    page_Canvas.width       = Math.ceil(page_Viewport.width * pixel_Ratio);
                    page_Canvas.height      = Math.ceil(page_Viewport.height * pixel_Ratio);
                    page_Canvas.setAttribute('aria-label', 'PDF page ' + page_Number);
                    this.contentContainer.appendChild(page_Canvas);
                    this.renderTask         = pdf_Page.render({
                        canvasContext: page_Canvas.getContext('2d'),
                        viewport: page_Viewport,
                        transform: pixel_Ratio === 1 ? null : [pixel_Ratio, 0, 0, pixel_Ratio, 0, 0]
                    });

                    await this.renderTask.promise;
                    if (!this.isReleased) trace_Instance(this, 'CLS_RenderPDF', 'render', 'COMPLETE', { operation: 'renderPage', pageNumber: page_Number });

                } finally {
                    this.renderTask = null;
                    if (!this.isReleased) pdf_Page.cleanup();
                }
                if (this.isReleased) return;
            }
        } catch (render_Error) {
            if (this.isReleased) {
                trace_Instance(this, 'CLS_RenderPDF', 'render', 'EXIT', { operation: 'cancelled' });
                return;
            }
            trace_Instance(this, 'CLS_RenderPDF', 'render', 'ERROR', { operation: 'PDF loading or rendering', error: render_Error.message });
            this.release_Render_Resources();
            throw render_Error;
        }
    }

    /** Cancels active work and clears content without removing the View container. */
    release_Render_Resources() {
        if (this.isReleased) return this.releasePromise;
        this.isReleased             = true;
        trace_Instance(this, 'CLS_RenderPDF', 'release_Render_Resources', 'START', {
            operation: 'cancelAndDestroy', activeRender: Boolean(this.renderTask), activeLoading: Boolean(this.loadingTask)
        });
        this.renderTask?.cancel();
        const loading_Task          = this.loadingTask;
        this.loadingTask            = null;
        this.pdfDocument            = null;
        this.renderTask             = null;
        this.releasePromise         = Promise.resolve(loading_Task?.destroy()).then(() => {
            trace_Instance(this, 'CLS_RenderPDF', 'release_Render_Resources', 'COMPLETE', { operation: 'destroyDocument' });
        }).catch(release_Error => {
            trace_Instance(this, 'CLS_RenderPDF', 'release_Render_Resources', 'ERROR', { error: release_Error.message });
            console.error('PDF resource cleanup failed.', release_Error);
        });
        super.release_Render_Resources();
        return this.releasePromise;
    }
}
