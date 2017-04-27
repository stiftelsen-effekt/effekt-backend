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

module.exports =  mongoose.model('User', UserSchema, 'users')