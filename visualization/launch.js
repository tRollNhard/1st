// Cross-platform launcher: clears ELECTRON_RUN_AS_NODE (set by VS Code) so
// Electron starts as a real Electron process, not a bare Node.js process.
const { spawn } = require('child_process');
const electronPath = require('electron');

const isDev = process.argv.includes('--dev');
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
if (isDev) env.SMILLEE_DEV = '1';

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('close', code => process.exit(code || 0));
