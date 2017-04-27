const mongoose = require('mongoose')
const Schema = mongoose.Schema

const DonationSplit = new Schema({
  organizationID: {
    type: String,
    required: true
  },
  share: {
    type: Number,
    required: true
  }
})

module.exports = DonationSplit