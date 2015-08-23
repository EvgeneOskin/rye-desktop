PouchDB = require 'pouchdb'


class Storage
  dbname: "#{process.env.HOME}/.rye"
  constructor: () ->
    @db = new PouchDB @dbname
  saveCredential: (newOne) ->
    db = @db
    @getCredential().then (doc) ->
      console.log(newOne)
      db.put newOne, doc._id, doc._rev
  getCredential: () ->
    @db.get 'auth'

module.exports = new Storage
