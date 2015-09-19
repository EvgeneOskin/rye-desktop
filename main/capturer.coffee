# Usages:
#   capturer = new Capturer
#   capturer.captureScreen()
#   fs.open capturer.filename, 'r', cb
#   capturer.read cb

robotjs = require 'robotjs'
Canvas = require 'canvas'
fs = require 'fs'
temp = require 'temp'

temp.track();

class Capturer
  constructor: () ->
    @filename = temp.path({suffix: '.png'});

  captureScreen: () ->
    robotjs.getScreenshoot(@filename)

  read: (cb) ->
    fd.read @filename, 'r', cb

module.exports = new Capturer
