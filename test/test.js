//const expect = require('expect.js')

describe('hooks', function() {

  before(function() {
    // runs before all tests in this block
    console.log("Before all tests")
  });

  after(function() {
    // runs after all tests in this block
    console.log("After all tests")
  });

  beforeEach(function() {
    // runs before each test in this block
    console.log("Before each test")
  });

  afterEach(function() {
    // runs after each test in this block
    console.log("After each test")
  });

  // test cases
});