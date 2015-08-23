app = require 'app'
ipc = require 'ipc'
BrowserWindow = require 'browser-window'
storage = require './storage'
mainWindow = null

# report crashes to the Electron project
require('crash-reporter').start()

# adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')()

createMainWindow = () ->
  win = new BrowserWindow
    width: 600
    height: 400
    resizable: false

  win.loadUrl "file://#{__dirname}/../render/index.html"
  win.on 'closed', onClosed

  return win

onClosed = () ->
  # deref the window
  # for multiple windows store them in an array
  mainWindow = null

app.on 'window-all-closed', () ->
  if process.platform isnt 'darwin'
    app.quit()

app.on 'activate-with-no-open-windows', () ->
  if not mainWindow
    mainWindow = createMainWindow()

app.on 'ready', () ->
  mainWindow = createMainWindow()

ipc.on 'authenticate', (event, credentials) ->
  storage.saveCredential(credentials).then(() ->
    storage.getCredential(credentials).then (doc) ->
      event.sender.send 'authenticated', doc
  ).catch (err) ->
    console.trace err
