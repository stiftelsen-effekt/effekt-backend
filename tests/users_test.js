
const expect = require('chai').expect;
const request = require('request');
const DAO = require('../custom_modules/DAO.js');

/*
	Legitimate_Email 
		This user should already exists in database.
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
	var Result = await RequestFunction(0);
	expect(Result.DataBack.content).to.equal('Missing email in request');
	expect(Result.DataBack.status).to.equal(400);
	expect(Result.ResponseCode).to.equal(400);	
});

it("Request, email parm set to 'trick' value", async function() {
	var Result = await RequestFunction(1);
	expect(Result.DataBack.content).to.equal('Missing email in request');
	expect(Result.DataBack.status).to.equal(400);
	expect(Result.ResponseCode).to.equal(400);	
});

it("Request, checking already existing user", async function() {
	var Result = await RequestFunction(2);
	expect(Result.DataBack).to.equal("User already exists");
	expect(Result.ResponseCode).to.equal(200);
});

it("Request, new user creation", async function() {
	var Result = await RequestFunction(3);
	var NumberOfUsersWithEmail = await DAO.donors.getCountByEmail(Brand_New_Email);   
	expect(Result.DataBack).to.equal("User created");
	expect(Result.ResponseCode).to.equal(200);
	expect(NumberOfUsersWithEmail > 0).to.equal(true);
});
