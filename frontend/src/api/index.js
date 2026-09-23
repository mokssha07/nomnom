/**
 * The only module the pages import from.
 *
 * Flip USE_MOCK to false when the Django backend is ready. Nothing else in the
 * app changes — that is the whole reason this file exists.
 *
 * The shapes both clients must produce are documented in ./shapes.js.
 */

import * as mock from './mock';
import * as real from './real';

const USE_MOCK = true;

export default USE_MOCK ? mock : real;
