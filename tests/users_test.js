
const expect = require('chai').expect;
const request = require('request');
const DAO = require('../custom_modules/DAO.js');

/*
	Legitimate_Email 
		This user should already exists
	Brand_New_Email
		Generated based on unix time, making it "unique".
*/

const Legitimate_Email = "superlegit@email.com";
const Brand_New_Email = (new Date().getTime()).toString() + "@email.com";

var RequestFunction = function(testID) {
	return new Promise(function(resolve, reject) {
		var BodyData = undefined;
		if(testID == 0){  		
			// The backend will not parse the request unless it contains data. (Bad Request)
			// Therefore it is set to "notemail" instead of "email".
			BodyData = "data=" + encodeURIComponent(JSON.stringify({"notemail": undefined }));
		}
		else if(testID == 1){  			
			// Making sure an "undefined" value won't "trick" the system.
			BodyData = "data=" + encodeURIComponent(JSON.stringify({"email": undefined }));
		}
		else if(testID == 2){  			
			// Sending a "legit" email request, this should return 200 because this user exists.
			BodyData = "data=" + encodeURIComponent(JSON.stringify({"email": Legitimate_Email}));
		}
		else if(testID == 3){  		
			// Sending a "legit" email request, this should return 200 because the new user is created.
			BodyData = "data=" + encodeURIComponent(JSON.stringify({"email": Brand_New_Email }));
		}		
		request.post({
			headers: {'content-type' : 'application/x-www-form-urlencoded'},
			url:     'http://localhost:3000/users',
			body:   BodyData
		}, function(error, response, body){
			resolve({DataBack: JSON.parse(body), ResponseCode: response.statusCode});
		});
	});
}


it("Request, no email parm", async function() {
	var result = await RequestFunction(0);
	expect(result.DataBack.content).to.equal('Missing email in request');
	expect(result.DataBack.status).to.equal(400);
	expect(result.ResponseCode).to.equal(400);	
});

it("Request, email parm set to 'trick' value", async function() {
	var result = await RequestFunction(1);
	expect(result.DataBack.content).to.equal('Missing email in request');
	expect(result.DataBack.status).to.equal(400);
	expect(result.ResponseCode).to.equal(400);	
});

it("Request, checking already existing user", async function() {
	var result = await RequestFunction(2);
	expect(result.DataBack).to.equal("User already exists");
	expect(result.ResponseCode).to.equal(200);
});

it("Request, new user creation", async function() {
	var result = await RequestFunction(3);
	var numberOfUsersWithEmail = await DAO.donors.getCountByEmail(Brand_New_Email);   
	expect(result.DataBack).to.equal("User created");
	expect(result.ResponseCode).to.equal(200);
	expect(numberOfUsersWithEmail > 0).to.equal(true);
});



