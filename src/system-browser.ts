import { spawn } from 'node:child_process';

/** No shell, credential arguments, inherited logs or browser attachment. */
export function openSystemBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('xdg-open', [url], { stdio: 'ignore' });
    child.unref();
    child.once('error', () => reject(new Error('Could not open Webex login. Configure xdg-open.')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Could not open Webex login.')));
  });
}
