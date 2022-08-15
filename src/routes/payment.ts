import { DAO } from '../custom_modules/DAO'

const express = require('express')
const router = express.Router()

router.get("/methods", async (req,res, next) => {
  try {
    let paymentMethods = await DAO.payment.getMethods()

    res.json({
      status: 200,
      content: paymentMethods
    })
  }
  catch(ex) {
    next(ex)
  }
})

module.exports = router