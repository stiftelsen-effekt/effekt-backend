const mongoose = require('mongoose')
const Schema = mongoose.Schema

const OrganizationSchema =  new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  standardShare: {
    type: Number
  },
  shortDesc: {
    type: String
  },
  longDesc: {
    type: String
  },
  active: {
    type: Boolean
  }
})

module.exports = mongoose.model('Organization', OrganizationSchema, 'organizations')