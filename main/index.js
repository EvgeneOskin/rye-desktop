'use strict';
const app = require('app');
const ipc = require('ipc');
const BrowserWindow = require('browser-window');

// report crashes to the Electron project
require('crash-reporter').start();

// adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')();

function createMainWindow () {
	const win = new BrowserWindow({
		width: 600,
		height: 400,
		resizable: false
	});

	win.loadUrl(`file://${__dirname}/../render/index.html`);
	win.on('closed', onClosed);

	return win;
}

function onClosed() {
	// deref the window
	// for multiple windows store them in an array
	mainWindow = null;
}

// prevent window being GC'd
let mainWindow;

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate-with-no-open-windows', function () {
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

app.on('ready', function () {
	mainWindow = createMainWindow();
});

ipc.on('asynchronous-message', function(event, arg) {
  console.log(arg);  // prints "ping"
  event.sender.send('asynchronous-reply', 'authorized');
});
