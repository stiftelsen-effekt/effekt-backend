
const chai = require('chai');
const expect = require('chai').expect;
const config = require('../config.js');
const DAO = require('../custom_modules/DAO.js');
const users = require('../routes/users.js');

var ActiveOrganizationsIDs = [];
var NotExistingEmail = (new Date().getTime()).toString() + "@email.com";
var DonationID = undefined;

var UserData = {
	KID: undefined,
	email: undefined,
	firstName: "testuser_firstName",
	lastName: "testuser_lastName"
}

var donationObject = {
	KID: undefined,
	amount: 100,
	standardSplit: undefined,
	split: []
}


it("createConnection and genereate user KID", async function() {
	await DAO.createConnection();
	
	// Generate a new KID for the test user
	UserData.KID = await users.generateKID(); 
	UserData.email = "test" + (new Date().getTime()).toString() + "@email.com";

	expect(UserData.KID).not.to.equal(undefined);
	expect(DAO.createConnection).to.be.a('function');
	
	// setup the donation 
	donationObject.KID = UserData.KID;
	donationObject.split = await DAO.organizations.getStandardSplit();
	donationObject.standardSplit = true;


});	




describe('donors', function() {
	it("donors.add", async function() {
		var objectData = await DAO.donors.add(UserData);
		expect(objectData).to.equal(UserData.KID);		
		expect(DAO.donors.add).to.be.a('function');
	});

	

	it("donors.getKIDByEmail", async function() {
		expect(DAO.donors.getKIDByEmail).to.be.a('function');
		expect(await DAO.donors.getKIDByEmail(UserData.email)).to.equal(UserData.KID);
		expect(await DAO.donors.getKIDByEmail(NotExistingEmail)).to.equal(null);
	});

	it("donors.remove", async function() {
		//	Function is not fully implented -> Test not fully implemented.	
		expect(DAO.donors.remove).to.be.a('function');
	});

	it("donors.getByKID", async function() {
		var objectData = await DAO.donors.getByKID(UserData.KID);
		expect(DAO.donors.getByKID).to.be.a('function');
		expect(objectData.KID).to.equal(UserData.KID);
		expect(objectData.email).to.equal(UserData.email);
		expect(objectData.first_name).to.equal(UserData.firstName);
		expect(objectData.last_name).to.equal(UserData.lastName);
	});
	
});



describe('organizations', function() {
	it("getActive", async function() {
		var objectData = await DAO.organizations.getActive();
		expect(objectData.length).not.to.equal(0);
		expect(objectData).not.to.equal(undefined);
		expect(objectData).not.to.equal(null);

		// save active organizations for getByIDs
		for(var x = 0; x < objectData.length; x++){
			ActiveOrganizationsIDs.push(objectData[x].id);
		}
		
		// Checking object keys.
		var objectKeys = [ 'id', 'name', 'shortDesc', 'standardShare' ];
		for(var y = 0; y < objectData.length; y++){
			for(var x = 0; x < objectKeys.length; x++){
				expect(objectData[y].hasOwnProperty(objectKeys[x])).to.equal(true);
			}
		}
	});

	it("getByIDs", async function() {
		this.timeout(1000*10);
		for(var y = 0; y < ActiveOrganizationsIDs.length; y++){
			var objectData = await DAO.organizations.getByIDs(ActiveOrganizationsIDs[y].toString());
			expect(objectData.length).not.to.equal(0);
			expect(objectData.length).not.to.equal(undefined);
			expect(objectData.length).not.to.equal(null);

			// Checking object keys.
			var objectKeys = ['ID','org_full_name','org_abbriv','short_desc','long_desc','std_percentage_share','active' ];
			for(var x = 0; x < objectKeys.length; x++){
				expect(objectData[0].hasOwnProperty(objectKeys[x])).to.equal(true);
			}
			expect(objectData[0]["active"]).to.equal(1);
		}
	});

	it("getStandardSplit", async function() {
		var objectData = await DAO.organizations.getStandardSplit();

		// Checking object keys.
		var objectKeys = [ 'organizationID', 'name', 'share' ];
		var TotalShare = 0;
		for(var y = 0; y < objectData.length; y++){
			for(var x = 0; x < objectKeys.length; x++){
				expect(objectData[y].hasOwnProperty(objectKeys[x])).to.equal(true);
			}
			TotalShare += objectData[y]["share"];
		}
		expect(TotalShare).to.equal(100);
	});
});


describe('donations', function() {
	it("donations.add", async function() {
		DonationID = await DAO.donations.add(donationObject);
		expect(DonationID).not.to.equal(undefined);
	});

	it("donations.getByID", async function() {
		var objectData = await DAO.donations.getByID(DonationID.toString());
		expect(objectData[0].ID).to.equal(DonationID);
		expect(objectData[0].Donor_KID).to.equal(donationObject.KID);
		expect(objectData[0].sum_notified).to.equal(donationObject.amount);
	});


	it("donations.getStandardShares", async function() {
		expect(DAO.donations.getStandardShares).to.be.a('function');

		var objectData = await DAO.donations.getStandardShares();
		var objectKeys = [ 'ID', 'std_percentage_share' ];
		var TotalShare = 0;
		for(var y = 0; y < objectData.length; y++){
			for(var x = 0; x < objectKeys.length; x++){
				expect(objectData[y].hasOwnProperty(objectKeys[x])).to.equal(true);
			}
			TotalShare += objectData[y]["std_percentage_share"];
		}
		expect(TotalShare).to.equal(100);
	});


	it("donations.getFullDonationById", async function() {
		var objectData = await DAO.donations.getFullDonationById(DonationID);
		expect(objectData.Donor_KID).to.equal(donationObject.KID);
		expect(objectData.ID).to.equal(DonationID);
		expect(objectData.sum_notified).to.equal(donationObject.amount);
		expect(objectData.sum_notified).to.equal(donationObject.amount);

		var TotalShare = 0;
		for(var x = 0; x < objectData.split.length; x++){
			expect(objectData.split[x].DonationID).to.equal(DonationID);
			expect(objectData.split[x].DonationID).to.equal(DonationID);
      TotalShare += objectData.split[x].percentage_share;
		}
		expect(TotalShare).to.equal(100);
	});

	it("donations.getAggregateByTime", async function() {
		expect(DAO.donations.getAggregateByTime).to.be.a('function');
		//	Function is not fully implented -> Test not fully implemented.	
	});
});
