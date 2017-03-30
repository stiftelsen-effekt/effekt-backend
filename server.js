const config = require('./config.js')

const express = require('express')
const bodyParser = require('body-parser')
const mongoClient = require('mongodb').MongoClient

const app = express();

console.log("Connecting to MongoDB...");
mongoClient.connect(config.db_connection_string, (err, database) => {
  if (err) return console.log(err)
  console.log("Connected to DB, starting server...");
  db = database
  app.listen(3000, () => {
    console.log('listening on 3000')
  })

  app.get("/", (req,res) => {
      res.send("Hello world")
  })
})