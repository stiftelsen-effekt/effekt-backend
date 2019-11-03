const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')

router.get("/owners", async (req,res, next) => {
  try {
    var owners = await DAO.meta.getDataOwners()

    res.json({
      status: 200,
      content: owners
    })
  }
  catch(ex) {
    next(ex)
  }
})

module.exports = router