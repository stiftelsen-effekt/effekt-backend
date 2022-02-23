const sinon = require('sinon');
const chai = require('chai');
const request = require('supertest');
const express = require("express");
const { expect } = require("chai");
const authMiddleware = require('../custom_modules/authorization/authMiddleware');
const DAO = require("../custom_modules/DAO");

describe('Check if profile information is updated', function() {
    let server;
    let authStub;
    let checkDonorStub;
    let donorStub;

    before(function() {
        authStub = sinon.stub(authMiddleware, "auth").returns([]);
        checkDonorStub = sinon.replace(
            authMiddleware,
            "checkDonor",
            function(donorId, res, req, next) {
                next();
            }
        );
        donorStub = sinon
        .stub(DAO.donors, "getByID")
        .resolves([
            {
            id: 237,
            name: "Jack Torrance",
            email: "jack@overlookhotel.com",
            newsletter: true,
            trash: false,
            registered: "1921-07-04T23:00:00.000Z"
            }
        ]);
        const donorsRoute = require("../routes/donors");
        server = express();
        server.use("/donors", donorsRoute);

    });

    beforeEach(function () {
        sinon.resetHistory();
    });

    it("Should return 200 OK with the donor by ID", async function () {
        const response = await request(server)
        .get("/donors/237");
        console.log(response);
    });

    after(function() {
        authMiddleware.auth.restore();
    });

});
