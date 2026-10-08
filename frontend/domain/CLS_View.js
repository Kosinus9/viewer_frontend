import { E_CommandType } from './DUT/ENUM/E_CommandType.js';
import { E_EventType } from './DUT/ENUM/E_EventType.js';
import { E_FrontendEvent } from './DUT/ENUM/E_FrontendEvent.js';

/** Owns one minimal DOM window; rendering and layout are deferred. */
export class CLS_View {
    /** Stores section identity and the event manager for this single window. */
    constructor(sectionId, clsEventManager) {
        this.sectionId        = sectionId;
        this.clsEventManager  = clsEventManager;
        this.isOpen           = false;
        this.container        = null;
        this.stFrontendJob    = null;
    }

    /** Executes an authorized command and confirms only completed DOM operations. */
    process_Command(stJobFrontend) {
        if (stJobFrontend.sectionId !== this.sectionId)
            throw new Error('View sectionId mismatch.');

        if (stJobFrontend.commandType === E_CommandType.OPEN) {
            if (this.isOpen) throw new Error('View is already open.');
            const root_Element = document.getElementById('viewer');
            if (!root_Element) throw new Error('Viewer DOM root is missing.');
            this.stFrontendJob                = stJobFrontend;
            this.container                    = document.createElement('section');
            this.container.className          = 'view';
            this.container.dataset.sectionId  = this.sectionId;
            const button_Element              = document.createElement('button');
            button_Element.type               = 'button';
            button_Element.className          = 'view-close';
            button_Element.textContent        = 'X';
            this.close_Handler                = () => this.clsEventManager.event_Processing(E_FrontendEvent.CLOSE, this.sectionId, this);
            this.closeButton = button_Element;

            button_Element.addEventListener('click', this.close_Handler);
            this.container.appendChild(button_Element);
            root_Element.appendChild(this.container);
            this.isOpen                       = true;
            return this.clsEventManager.event_Processing(E_EventType.OPENED, this.sectionId, this);
        }
        if (stJobFrontend.commandType === E_CommandType.CLOSE && this.isOpen) {
            this.dispose();
            return this.clsEventManager.event_Processing(E_EventType.CLOSED, this.sectionId, this);
        }
    }

    /** Releases this window's DOM and handlers, including after failed initialization. */
    dispose() {
        if (this.closeButton) this.closeButton.removeEventListener('click', this.close_Handler);
        if (this.container) this.container.remove();
        this.isOpen        = false;
        this.container     = null;
        this.closeButton   = null;
        this.close_Handler = null;
        this.stFrontendJob = null;
    }
}
