const config = require('../config')
const express = require('express')
const router = express.Router()

router.get("/env", (req, res, next) => res.send(config.env));

module.exports = router