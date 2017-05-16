const mongoose = require('mongoose')
const Schema = mongoose.Schema

const DonationSplit = new Schema({
  organizationID: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'organizations'
  },
  share: {
    type: Number,
    required: true
  }
})

module.exports = DonationSplit