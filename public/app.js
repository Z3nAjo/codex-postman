import { initEnvironments } from './modules/environments.js';
import { initRequestEditor } from './modules/request.js';
import { initLibrary } from './modules/library.js';
import { initLayout } from './modules/layout.js';

// Wire controls before fetching disk data so the UI stays responsive at startup.
const environments = initEnvironments();
const editor = initRequestEditor(environments.read);
const library = initLibrary(editor);
initLayout();
await Promise.all([environments.ready, library.ready]);
