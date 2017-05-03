const mongoose = require('mongoose')
const Schema = mongoose.Schema

const validator = require('validator')

const UserSchema = new Schema({ 
  mail: {
    type: String,
    uniqe: true,
    required: true,
    validate: validator.isEmail
  }
})

const model = mongoose.model('User', UserSchema, 'users')

module.exports =  model