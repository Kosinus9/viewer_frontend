import { E_CommandType }        from './DUT/ENUM/E_CommandType.js';
import { E_EventType }          from './DUT/ENUM/E_EventType.js';
import { E_FrontendEvent }      from './DUT/ENUM/E_FrontendEvent.js';
import { E_FileType } from './DUT/ENUM/E_FileType.js';
import { CLS_PDFRenderer } from './renderer/CLS_PDFRenderer.js';
import { CLS_ImageRenderer } from './renderer/CLS_ImageRenderer.js';
import { CLS_VideoRenderer } from './renderer/CLS_VideoRenderer.js';
import { CLS_TextRenderer } from './renderer/CLS_TextRenderer.js';

/** Owns one HTML window and its layout; content rendering is deferred. */
export class CLS_View {
    /** Initializes the identity, lifecycle state and resources of one window. */
    constructor(sectionId, clsEventManager) {
        // Backend-provided identifier for this window and its events.
        this.sectionId              = sectionId;
        // Normalizes View events and forwards them to the controller.
        this.clsEventManager        = clsEventManager;
        // Indicates whether the HTML window has been successfully opened.
        this.isOpen                 = false;
        // Root section element owned by this View.
        this.container              = null;
        // Button that requests backend-authorized closure.
        this.closeButton            = null;
        // Stored click callback, retained for listener removal during cleanup.
        this.close_Handler          = null;
        // Original opening job, retained without changing backend values.
        this.stFrontendJob          = null;
        // Reserved reference to the future content renderer instance.
        this.clsRenderer            = null;
        // View-owned content element reserved as the future renderer target.
        this.contentContainer       = null;
    }

    /** Executes authorized commands and confirms only successfully installed or removed windows. */
    execute_Command(stJobFrontend) {
        if (!stJobFrontend || typeof stJobFrontend !== 'object' || Array.isArray(stJobFrontend)) {
            throw new Error('View command requires a valid job object.');
        }
        if (typeof stJobFrontend.commandType !== 'string' || !stJobFrontend.commandType ||
            stJobFrontend.sectionId === undefined || stJobFrontend.sectionId === null || stJobFrontend.sectionId === '') {
            throw new Error('View command requires commandType and sectionId.');
        }
        if (stJobFrontend.sectionId !== this.sectionId) throw new Error('View sectionId mismatch.');

        if (stJobFrontend.commandType === E_CommandType.OPEN) {
            if (this.isOpen) throw new Error('View is already open.');
            try {
                const root_Element = document.getElementById('viewer');

                if (!root_Element) throw new Error('Viewer DOM root is missing.');

                const stJobLayout = stJobFrontend.stJobLayout;

                if (!stJobLayout || !['x', 'y', 'width', 'height'].every(field_Name => Number.isFinite(stJobLayout[field_Name])) ||
                    stJobLayout.width <= 0 || stJobLayout.height <= 0) {
                    throw new Error('View layout requires finite numeric x/y and positive width/height in pixels.');
                }

                if (typeof stJobFrontend.fileName !== 'string') {
                    throw new Error('View OPEN requires a fileName string.');
                }
                this.stFrontendJob                  = stJobFrontend;
                this.create_Container(stJobFrontend, root_Element);
                // Renderer selection requires E_FileType values and a contentContainer constructor contract.
                // Future rendering will receive stJobFrontend.filePath after that interface is implemented.
                this.isOpen                         = true;
                
            } catch (error) {
                try { this.release_View_Resources(); }
                catch { /* Preserve the original construction error for the controller. */ }
                throw error;
            }
            return this.clsEventManager.event_Processing(E_EventType.OPENED, this.sectionId, this);
        }
        if (stJobFrontend.commandType === E_CommandType.CLOSE && this.isOpen) {
            this.release_View_Resources();
            return this.clsEventManager.event_Processing(E_EventType.CLOSED, this.sectionId, this);
        }
    }

    /** Builds and attaches the window DOM from an already validated opening job. */
    create_Container(stJobFrontend, root_Element) {
        const stJobLayout                   = stJobFrontend.stJobLayout;
        this.container                      = document.createElement('section');
        this.container.className            = 'view';
        this.container.dataset.sectionId    = this.sectionId;
        this.container.style.left           = stJobLayout.x + 'px';
        this.container.style.top            = stJobLayout.y + 'px';
        this.container.style.width          = stJobLayout.width + 'px';
        this.container.style.height         = stJobLayout.height + 'px';

        const header_Element                = document.createElement('header');
        header_Element.className            = 'view-header';

        const title_Element                 = document.createElement('span');
        title_Element.className             = 'view-title';
        title_Element.textContent           = stJobFrontend.fileName;
        this.closeButton                    = document.createElement('button');
        this.closeButton.type               = 'button';
        this.closeButton.className          = 'view-close';
        this.closeButton.textContent        = 'X';

        this.close_Handler                  = () => this.request_Close();
        this.closeButton.addEventListener('click', this.close_Handler);
        header_Element.appendChild(title_Element);
        header_Element.appendChild(this.closeButton);
        this.contentContainer               = document.createElement('div');
        this.contentContainer.className     = 'view-content';
        this.container.appendChild(header_Element);
        this.container.appendChild(this.contentContainer);
        root_Element.appendChild(this.container);
    }

    /** Identifies the specialized renderer and reports unavailable enum or constructor contracts. */
    choose_Special_Renderer(fileType) {
        if (fileType === undefined || fileType === null) {
            throw new Error('Unsupported fileType: a defined E_FileType value is required.');
        }
        let RendererClass;
        switch (fileType) {
            case E_FileType.PDF:
                RendererClass = CLS_PDFRenderer;
                break;
            case E_FileType.IMAGE:
                RendererClass = CLS_ImageRenderer;
                break;
            case E_FileType.VIDEO:
                RendererClass = CLS_VideoRenderer;
                break;
            case E_FileType.TEXT:
                RendererClass = CLS_TextRenderer;
                break;
            default:
                throw new Error('Unsupported fileType: ' + String(fileType) + '. E_FileType values are not yet defined locally.');
        }
        // The existing renderer classes do not yet accept a contentContainer constructor argument.
        throw new Error(RendererClass.name + ' requires an implemented contentContainer constructor contract.');
    }

    /** Requests backend-authorized closure without removing this window. */
    request_Close() {
        if (!this.isOpen) return;
        return this.clsEventManager.event_Processing(E_FrontendEvent.CLOSE, this.sectionId, this);
    }

    /** Idempotently releases DOM resources without emitting a lifecycle confirmation. */
    release_View_Resources() {
        if (this.closeButton) this.closeButton.removeEventListener('click', this.close_Handler);
        if (this.container) this.container.remove();
        this.isOpen                 = false;
        this.container              = null;
        this.closeButton            = null;
        this.close_Handler          = null;
        this.contentContainer       = null;
        this.stFrontendJob          = null;
        // Renderer cleanup must be connected once its release interface is defined.
        this.clsRenderer            = null;
    }
}
