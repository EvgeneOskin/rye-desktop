screenPersentage = 0.1
robotjs = require 'robotjs'
Canvas = require 'canvas'
fs = require 'fs'


class Capturer
  constructor: () ->
    @screenSize = @getScreenSize()
    @canvas = new Canvas @screenSize.width, @screenSize.height

  getScreenSize: () ->
    screenSize = robotjs.getScreenSize()
    screenSize.width = screenSize.width*screenPersentage
    screenSize.height = screenSize.height*screenPersentage
    screenSize

  captureScreen: () ->
    ctx = @canvas.getContext '2d'
    for x in [0 .. @screenSize.width]
      for y in [0 .. @screenSize.height]
        color = robotjs.getPixelColor x, y
        ctx.fillStyle = "##{color}"
        ctx.fillRect x, y, x+1, y+1
    ctx.save()

  storeCanvas: (out) ->
    stream = @canvas.pngStream()
    stream.on 'data', (chunk) ->
      out.write chunk


capturer = new Capturer
capturer.captureScreen()
capturer.storeCanvas fs.createWriteStream 'captured.png'
