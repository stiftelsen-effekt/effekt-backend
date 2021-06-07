const express = require('express')
const router = express.Router()
const auth = require('../custom_modules/authorization/authMiddleware')
const roles = require('../enums/authorizationRoles')

const DAO = require('../custom_modules/DAO.js')

router.post("/", auth(roles.read_all_donations), async (req,res, next) => {
  try {
    const limit = parseInt(req.body.limit)
    const offset = parseInt(req.body.page*limit)

    const entries = await DAO.logging.getEntries(limit, offset)

    res.json({
      status: 200,
      content: {
        rows: entries,
        pages: 1
      }
    })
  }
  catch(ex) {
    next(ex)
  }
})

router.get("/:id", auth(roles.read_all_donations), async (req,res, next) => {
  try {
    const id = parseInt(req.params.id)

    const entry = await DAO.logging.get(id)

    res.json({
      status: 200,
      content: entry
    })
  }
  catch(ex) {
    next(ex)
  }
})

module.exports = router