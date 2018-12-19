const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')


router.get("/methods", async (req,res, next) => {
  try {
    let paymentMethods = await DAO.payment.getMethods()

    res.json({
      status: 200,
      content: paymentMethods
    })
  }
  catch(ex) {
    next({ex: ex})
  }
})

module.exports = router