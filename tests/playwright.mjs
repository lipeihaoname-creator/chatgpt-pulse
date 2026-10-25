import {pathToFileURL} from 'node:url';
// Optional existing runtime override; standard installs use the locked dependency.
const runtime=process.env.PULSE_PLAYWRIGHT_MODULE?await import(pathToFileURL(process.env.PULSE_PLAYWRIGHT_MODULE)):await import('playwright');
export const {chromium,webkit}=runtime;
