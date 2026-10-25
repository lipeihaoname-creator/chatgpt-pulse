import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(project, 'test-results', 'evidence');

// Retry only sharing violations. Never terminate processes or change security.
export async function bundleWithRetry(runAttempt, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const attempts = [];
  for (let number = 1; number <= 3; number += 1) {
    const result = await runAttempt(number);
    const sharingViolation = result.exit_code !== 0 && /\bos error 32\b/i.test(result.output);
    attempts.push({ number, exit_code: result.exit_code, log: result.log, sharing_violation: sharingViolation });
    if (!sharingViolation || number === 3) return { exit_code: result.exit_code, attempts };
    await wait(2000);
  }
}

async function main() {
  const configIndex = process.argv.indexOf('--config');
  const config = configIndex < 0 ? 'src-tauri/tauri.windows.conf.json' : process.argv[configIndex + 1];
  if (!['src-tauri/tauri.windows.conf.json','src-tauri/tauri.windows-offline.conf.json'].includes(config)) throw Error('Unknown reviewed Windows bundle configuration');
  await mkdir(evidence, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result = await bundleWithRetry(async number => {
    const relativeLog = `test-results/evidence/nsis-attempt-${stamp}-${number}.txt`;
    const absoluteLog = path.join(project, relativeLog);
    const log = createWriteStream(absoluteLog, { flags: 'wx' });
    console.log(`NSIS attempt ${number}/3; log: ${relativeLog}`);
    const exit_code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(project, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
        'bundle', '--bundles', 'nsis', '--config', config,
        '--no-sign', '--no-binary-patching', '--ci',
      ], { cwd: project, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      log.on('error', reject);
      child.stdout.on('data', chunk => log.write(chunk));
      child.stderr.on('data', chunk => log.write(chunk));
      child.on('error', error => { log.end(); reject(error); });
      child.on('close', code => log.end(() => resolve(code ?? 1)));
    });
    const output = await readFile(absoluteLog, 'utf8');
    console.log(output.trimEnd());
    return { exit_code, output, log: relativeLog };
  });
  await writeFile(path.join(evidence, 'windows-nsis-attempts.json'), JSON.stringify({
    checked_at: new Date().toISOString(), ...result, installer_executed: false,
  }, null, 2) + '\n', 'utf8');
  process.exitCode = result.exit_code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
