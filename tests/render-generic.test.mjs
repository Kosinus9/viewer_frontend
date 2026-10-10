import assert from 'node:assert/strict';
import test from 'node:test';

import { CLS_RenderGeneric } from '../frontend/domain/renderer/CLS_RenderGeneric.js';

function create_Content_Container() {
    return {
        nodeType: 1,
        children: [{ id: 'rendered-content' }],
        replaceChildren() {
            this.children = [];
        }
    };
}

test('constructor retains a valid DOM content container', () => {
    const content_Container = create_Content_Container();
    const clsRenderer = new CLS_RenderGeneric(content_Container);

    assert.equal(clsRenderer.contentContainer, content_Container);
});

test('constructor rejects an invalid content container', () => {
    assert.throws(() => new CLS_RenderGeneric(null), TypeError);
    assert.throws(() => new CLS_RenderGeneric({ nodeType: 1 }), TypeError);
});

test('render rejects direct use of the generic renderer', async () => {
    const clsRenderer = new CLS_RenderGeneric(create_Content_Container());

    await assert.rejects(
        clsRenderer.render('document.pdf'),
        /must be implemented by a specialized renderer/
    );
});

test('a specialized renderer can override the asynchronous render contract', async () => {
    class CLS_TestRenderer extends CLS_RenderGeneric {
        async render(filePath) {
            return filePath;
        }
    }

    const clsRenderer = new CLS_TestRenderer(create_Content_Container());

    assert.equal(await clsRenderer.render('document.pdf'), 'document.pdf');
});

test('convert_file_path_In_URL delegates to the Tauri path converter', async () => {
    const clsRenderer = new CLS_RenderGeneric(create_Content_Container());
    const received_File_Paths = [];
    CLS_RenderGeneric.convert_File_Src = (filePath) => {
        received_File_Paths.push(filePath);
        return `asset://localhost/${filePath}`;
    };

    try {
        const file_URL = await clsRenderer.convert_file_path_In_URL('C:/media/document.pdf');

        assert.equal(file_URL, 'asset://localhost/C:/media/document.pdf');
        assert.deepEqual(received_File_Paths, ['C:/media/document.pdf']);
    } finally {
        CLS_RenderGeneric.convert_File_Src = null;
    }
});

test('convert_file_path_In_URL rejects invalid file paths', async () => {
    const clsRenderer = new CLS_RenderGeneric(create_Content_Container());

    await assert.rejects(clsRenderer.convert_file_path_In_URL(''), TypeError);
    await assert.rejects(clsRenderer.convert_file_path_In_URL('   '), TypeError);
    await assert.rejects(clsRenderer.convert_file_path_In_URL(null), TypeError);
});

test('convert_file_path_In_URL propagates conversion errors', async () => {
    const clsRenderer = new CLS_RenderGeneric(create_Content_Container());
    const conversion_Error = new Error('Tauri conversion failed.');
    CLS_RenderGeneric.convert_File_Src = () => {
        throw conversion_Error;
    };

    try {
        await assert.rejects(
            clsRenderer.convert_file_path_In_URL('C:/media/document.pdf'),
            conversion_Error
        );
    } finally {
        CLS_RenderGeneric.convert_File_Src = null;
    }
});

test('release_Render_Resources is repeatable and preserves the View container', () => {
    const content_Container = create_Content_Container();
    const clsRenderer = new CLS_RenderGeneric(content_Container);

    clsRenderer.release_Render_Resources();
    clsRenderer.release_Render_Resources();

    assert.equal(clsRenderer.contentContainer, content_Container);
    assert.deepEqual(content_Container.children, []);
});
