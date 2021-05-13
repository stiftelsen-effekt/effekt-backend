const config = require('./../config')
const DAO = require('./DAO')
const crypto = require('../custom_modules/authorization/crypto')
const paymentMethods = require('../enums/paymentMethods')
const request = require('request-promise-native')
const mail = require('../custom_modules/mail')
const moment = require('moment');
const randomstring = require("randomstring");
const hash = require('object-hash');

//Timings selected based on the vipps guidelines
//https://www.vipps.no/developers-documentation/ecom/documentation/#polling-guidelines
const POLLING_START_DELAY = 5000
const POLLING_INTERVAL = 2000

const VIPPS_TEXT = "Donasjon til gieffektivt.no"

/**
 * @typedef TransactionLogItem
 * @property {number} amount In øre
 * @property {string} transactionText
 * @property {number} transactionId
 * @property {string} timeStamp JSON timestamp
 * @property {string} operation
 * @property {number} requestId 
 * @property {boolean} operationSuccess
 */

/**
 * @typedef TransactionSummary
 * @property {number} capturedAmount
 * @property {number} remainingAmountToCapture
 * @property {number} refundedAmount
 * @property {number} remainingAmountToRefund
 * @property {number} bankIdentificationNumber
 */

/**
 * 
 * @typedef OrderDetails
 * @property {string} orderId
 * @property {TransactionSummary} transactionSummary
 * @property {Array<TransactionLogItem>} transactionLogHistory
 */

/**
 * @typedef DraftRespone
 * @property {string} agreementResource The REST resource of the agreement
 * @property {string} agreementId The ID of the agreement
 * @property {string} vippsConfirmationUrl URL to confirm the agreement
 * @property {string} chargeId The id of the initial charge (not used)
 */

/**
 * @typedef VippsRecurringAgreementCampaign
 * @property {Date} start The start of the campaign price
 * @property {Date} end The end of the campaign price
 * @property {number} campaignPrice The campaign price
 */

/**
 * @typedef VippsRecurringAgreementInitialCharge
 * @property {number} amount Amount in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} description
 * @property {"DIRECT_CAPTURE" | "RESERVE_CAPTURE"} transactionType https://github.com/vippsas/vipps-ecom-api/blob/master/vipps-ecom-api-faq.md#what-is-the-difference-between-reserve-capture-and-direct-capture
 */

/**
 * @typedef VippsRecurringAgreement
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} id
 * @property {"DAY" | "WEEK" | "MONTH"} interval The agreement interval type, such as MONTH and DAY
 * @property {number} intervalCount How often to charge per interval type
 * @property {number} price Price in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} productName 
 * @property {string} productDescription
 * @property {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status The status of the agreement
 * @property {Date | null} start When the agreement was started
 * @property {Date | null} stop When the agreement is stopped
 * @property {VippsRecurringAgreementCampaign | undefined} campaign Special campaign pricing of applicable
 * @property {VippsRecurringAgreementInitialCharge | undefined } initialCharge Initial charge for the agreement
 * 
 */

/**
 * @typedef ChargePayload
 * @property {number} amount Amount in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} description
 * @property {string} due ISO-8601 date string for due date
 * @property {number} retryDays For how many days vipps shall attempt to retry charge
 * @property {string} orderId The ID of the order 
 */

/**
 * @typedef VippsError
 * @property {string} code //https://www.vipps.no/developers-documentation/ecom/documentation/#error-codes
 * @property {string} message
 * @property {string} contextId
 */

module.exports = {
    /**
     * Fetches a fresh access token from the vipps API
     * @return {VippsToken | false} A fresh vipps token or false if failed to fetch
     */
    async fetchToken() {
        try {
            let token = await DAO.vipps.getLatestToken()

            if (!token) {
                let tokenResponse = await request.post({
                    uri: `https://${config.vipps_api_url}/accesstoken/get`,
                    headers: {
                        'client_id': config.vipps_client_id,
                        'client_secret': config.vipps_client_secret,
                        'Ocp-Apim-Subscription-Key': config.vipps_ocp_apim_subscription_key
                    }
                })

                tokenResponse = JSON.parse(tokenResponse)

                token = {
                    expires: new Date(parseInt(tokenResponse.expires_on) * 1000),
                    type: tokenResponse.token_type,
                    token: tokenResponse.access_token
                }

                token.ID = await DAO.vipps.addToken(token)
            }

            return token
        }
        catch (ex) {
            console.error("Failed to fetch vipps token", ex)
            throw ex
        }
    },

    /**
     * @typedef InitiateVippsPaymentResponse
     * @property {string} orderId
     * @property {string} externalPaymentUrl
     */

    /**
     * Initiates a vipps order
     * @param {number} donorPhoneNumber The phone number of the donor
     * @param {VippsToken} token
     * @param {number} sum The chosen donation in NOK
     * @returns {InitiateVippsPaymentResponse} Returns a URL for which to redirect the user to when finishing the payment and the orderId
     */
    async initiateOrder(KID, sum) {
        let token = await this.fetchToken()

        if (token === false) return false

        let donor = await DAO.donors.getByKID(KID)
        let orderId = `${KID}-${+new Date()}`
        let order = {
            orderID: orderId,
            donorID: donor.id,
            KID: KID,
            token: crypto.getPasswordSalt()
        }

        let data = {
            "customerInfo": {},
            "merchantInfo": {
                "authToken": order.token,
                "callbackPrefix": `${config.api_url}/vipps/`,
                "fallBack": `${config.api_url}/vipps/redirect/${orderId}`,
                "isApp": false,
                "merchantSerialNumber": config.vipps_merchant_serial_number,
                "paymentType": "eComm Regular Payment"
            },
            "transaction": {
                "amount": sum * 100, //Specified in øre, therefore NOK * 100
                "orderId": order.orderID,
                "timeStamp": new Date(),
                "transactionText": VIPPS_TEXT,
                "skipLandingPage": false
            }
        }

        let initiateRequest = await request.post({
            uri: `https://${config.vipps_api_url}/ecomm/v2/payments`,
            headers: this.getVippsHeaders(token),
            json: data
        })

        await DAO.vipps.addOrder(order)

        return {
            orderId: order.orderID,
            externalPaymentUrl: initiateRequest.url
        }
    },

    /**
     * Poll order details
     * @param {string} orderId 
     */
    async pollOrder(orderId) {
        setTimeout(() => { this.pollLoop(orderId, this.checkOrderDetails) }, POLLING_START_DELAY)
    },

    /**
     * Checks for updates in the order
     * This is run multiple times from a interval in pollOrder function
     * We keep track of how many attempts we've made, to know whether to cancel the interval
     * @param {string} orderId 
     * @param {number} polls How many times have we polled the detail endpoint
     * @returns {boolean} True if we should cancel the polling, false otherwise
     */
    async checkOrderDetails(orderId, polls) {
        console.log(`Polling ${orderId}, ${polls}th poll`)
        let orderDetails = await this.getOrderDetails(orderId)

        //If we've been polling for more than eleven minutes, stop polling for updates
        if ((polls * POLLING_INTERVAL) + POLLING_START_DELAY > 1000 * 60 * 10) {
            //Update transaction log history with all information we have
            await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory)
            return true
        }

        let captureLogItem = this.findTransactionLogItem(orderDetails.transactionLogHistory, "CAPTURE")
        let reserveLogItem = this.findTransactionLogItem(orderDetails.transactionLogHistory, "RESERVE")
        if (orderDetails.transactionLogHistory.some((logItem) => this.transactionLogItemFinalIsFinalState(logItem))) {
            if (captureLogItem !== null) {
                let KID = orderId.split("-")[0]

                try {
                    let donationID = await DAO.donations.add(
                        KID,
                        paymentMethods.vipps,
                        (captureLogItem.amount / 100),
                        captureLogItem.timeStamp,
                        captureLogItem.transactionId)
                    await DAO.vipps.updateVippsOrderDonation(orderId, donationID)
                    await mail.sendDonationReciept(donationID)
                }
                catch (ex) {
                    if (ex.message.indexOf("EXISTING_DONATION") === -1) {
                        console.info(`Vipps donation for orderid ${orderId} already exists`, ex)
                    }
                    //Donation already registered, no additional actions required
                }
            }

            await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory)

            //We are in a final state, cancel further polling
            return true
        }
        else if (reserveLogItem !== null) {
            await this.captureOrder(orderId, reserveLogItem)
        }

        //No final state is reached, keep polling vipps
        return false
    },

    /**
     * Finds a transaction log item for a given operation, or returns null if none found
     * @param {Array<TransactionLogItem>} transactionLogHistory 
     * @param {string} operation 
     * @returns {TransactionLogItem | null}
     */
    findTransactionLogItem(transactionLogHistory, operation) {
        let items = transactionLogHistory.filter((logItem) => logItem.operation === operation && logItem.operationSuccess === true)
        if (items.length > 0) return items[0]
        else return null
    },

    /**
     * Checks wether an item is in a final state (i.e. no actions are longer pending)
     * @param {TransactionLogItem} transactionLogItem 
     * @returns 
     */
    transactionLogItemFinalIsFinalState(transactionLogItem) {
        if (transactionLogItem.operation === "CAPTURE" && transactionLogItem.operationSuccess === true)
            return true
        else if (transactionLogItem.operation === "CANCEL" && transactionLogItem.operationSuccess === true)
            return true
        else if (transactionLogItem.operation === "FAILED" && transactionLogItem.operationSuccess === true)
            return true
        else if (transactionLogItem.operation === "REJECTED" && transactionLogItem.operationSuccess === true)
            return true
        else if (transactionLogItem.operation === "SALE" && transactionLogItem.operationSuccess === true)
            return true

        return false
    },

    /**
     * Updates the transaction log history of an order
     * @param {string} orderId 
     * @param {Array<TransactionLogItem>} transactionLogHistory
     */
    async updateOrderTransactionLogHistory(orderId, transactionLogHistory) {
        await DAO.vipps.updateOrderTransactionStatusHistory(orderId, transactionLogHistory)
    },

    /**
     * Fetches order details
     * @param {string} orderId
     * @returns {OrderDetails}
     */
    async getOrderDetails(orderId) {
        let token = await this.fetchToken()

        let orderDetails = await request.get({
            uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/details`,
            headers: this.getVippsHeaders(token)
        })

        orderDetails = JSON.parse(orderDetails)

        //convert string timestamp to JS Date in transaction log history
        orderDetails = {
            ...orderDetails,
            transactionLogHistory: orderDetails.transactionLogHistory.map((logItem) => ({
                ...logItem,
                timeStamp: new Date(logItem.timeStamp)
            }))
        }

        return orderDetails
    },

    /**
     * Captures a order with a reserved amount
     * @param {string} orderId
     * @param {TransactionLogItem} transactionInfo The reserved transaction info
     * @return {boolean} Captured or not
     */
    async captureOrder(orderId, transactionInfo) {
        let token = await this.fetchToken()

        let data = {
            merchantInfo: {
                merchantSerialNumber: config.vipps_merchant_serial_number
            },
            transaction: {
                amount: transactionInfo.amount,
                transactionText: VIPPS_TEXT
            }
        }

        try {
            var captureRequest = await request.post({
                uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/capture`,
                headers: this.getVippsHeaders(token),
                json: data
            })
        }
        catch (ex) {
            if (ex.statusCode === 423 || ex.statusCode === 402) {
                //This is most likely a case of the polling trying to capture an order already captured by the callback, simply return true
                return true
            }
            else {
                console.error(`Failed to capture order with id ${orderId}`, ex)
                throw ex
            }
        }

        let KID = orderId.split("-")[0]

        if (captureRequest.transactionInfo.status == "Captured") {
            try {
                let donationID = await DAO.donations.add(
                    KID,
                    paymentMethods.vipps,
                    (captureRequest.transactionInfo.amount / 100),
                    captureRequest.transactionInfo.timeStamp,
                    captureRequest.transactionInfo.transactionId)
                await DAO.vipps.updateVippsOrderDonation(orderId, donationID)
                await mail.sendDonationReciept(donationID)
                return true
            }
            catch (ex) {
                if (ex.message.indexOf("EXISTING_DONATION") === -1) {
                    console.info(`Vipps donation for orderid ${orderId} already exists`, ex)
                }
                //Donation already registered, no additional actions required
            }
        }
        else {
            //Handle?
            return false
        }
    },

    /**
     * Refunds an order and deletes the associated donation
     * @param {string} orderId 
     * @return {boolean} Refunded or not
     */
    async refundOrder(orderId) {
        let token = await this.fetchToken()

        try {
            let order = await DAO.vipps.getOrder(orderId)

            if (order.donationID == null) {
                console.error(`Could not refund order with id ${orderId}, order has not been captured`)
                return false
            }

            let donation = await DAO.donations.getByID(order.donationID)

            const data = {
                merchantInfo: {
                    merchantSerialNumber: config.vipps_merchant_serial_number
                },
                transaction: {
                    amount: donation.sum * 100,
                    transactionText: VIPPS_TEXT
                }
            }

            var refundRequest = await request.post({
                uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/refund`,
                headers: this.getVippsHeaders(token),
                json: data
            })

            await DAO.donations.remove(order.donationID)
            let orderDetails = await this.getOrderDetails(orderId)
            await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory)

            return true
        }
        catch (ex) {
            console.error(`Failed to refund vipps order with id ${orderId}`, ex)
            return false
        }
    },

    /**
     * Cancels order
     * @param {string} orderId 
     * @return {boolean} Cancelled or not
     */
    async cancelOrder(orderId) {
        let token = await this.fetchToken()

        try {
            const data = {
                merchantInfo: {
                    merchantSerialNumber: config.vipps_merchant_serial_number
                },
                transaction: {
                    transactionText: VIPPS_TEXT
                }
            }

            var cancelRequest = await request.put({
                uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/cancel`,
                headers: this.getVippsHeaders(token),
                json: data
            })

            let orderDetails = await this.getOrderDetails(orderId)
            await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory)

            return true
        }
        catch (ex) {
            console.error(`Failed to cancel vipps order with id ${orderId}`, ex)
            return false
        }
    },

    /**
     * Approves an order manually (without using the vipps app)
     * Used for integration testing
     * @param {string} orderId
     * @param {string} linkToken Token returned from the vipps api when initating an order
     * @return {boolean} Approved or not
     */
    async approveOrder(orderId, linkToken) {
        if (config.env === 'production') return false

        let token = await this.fetchToken()

        let data = {
            customerPhoneNumber: 93279221,
            token: linkToken
        }

        try {
            let approveRequest = await request.post({
                uri: `https://${config.vipps_api_url}/ecomm/v2/integration-test/payments/${orderId}/approve`,
                headers: this.getVippsHeaders(token),
                json: data
            })
            return true
        }
        catch (ex) {
            return false
        }
    },

    /**
     * Drafts an agreement for a recurring payment
     * @param {string} KID KID for organization share
     * @param {number} amount Amount in kroner, not øre
     */
    async draftAgreement(KID, amount) {
        let token = await this.fetchToken()

        if (token === false) return false

        // Real price is set in øre
        const realAmount = amount * 100
        const description = "Første belastning skjer umiddelbart"

        const data = {
            "currency": "NOK",
            "scope": "name email phoneNumber birthdate",
            "initialCharge": {
                "amount": realAmount,
                "currency": "NOK",
                "description": description,
                "transactionType": "DIRECT_CAPTURE"
            },
            "interval": "MONTH",
            "intervalCount": 1,
            "isApp": false,
            "merchantRedirectUrl": `https://gieffektivt.no/vipps/recurring/confirmation`, // TODO: Create page
            "merchantAgreementUrl": `https://gieffektivt.no/vipps/recurring/customer-agreement`, // TODO: Figure out login solution and create page
            "price": realAmount,
            "productDescription": description,
            "productName": "Månedlig donasjon til gieffektivt.no"
        }

        try {
            let draftRequest = await request.post({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements`,
                headers: this.getVippsHeaders(token),
                json: data
            })

            /** @type {DraftRespone} */
            let response = draftRequest

            let donor = await DAO.donors.getByKID(KID)

            if (!donor) {
                console.error(`No donor found with KID ${KID}`)
                return false
            }

            // Amount in EffektDonasjonDB is stored in kroner, not øre 
            await DAO.vipps.addAgreement(response.agreementId, donor.id, KID, amount)

            this.pollAgreement(response.agreementId)

            return response
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /***
     * Fetches an agreement from vipps by ID
     * @param {number} id The agreement id
     * @returns {VippsRecurringAgreement} The vipps agreement
     */
    async getAgreement(id) {
        let token = await this.fetchToken()

        if (token === false) return false

        try {
            let agreementRequest = await request.get({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${id}`,
                headers: this.getVippsHeaders(token)
            })

            /** @type {VippsRecurringAgreement} */
            let response = JSON.parse(agreementRequest)

            return response
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Updates the price of an agreement
     * @param {string} agreementId The ID of the agreement being updated
     * @param {number} price The new agreement price
     * @return {boolean} Success
     */
    async updateAgreementPrice(agreementId, price) {
        let token = await this.fetchToken()
        if (token === false) return false

        if (!agreementId || !price) {
            console.error("Missing parameter agreementId")
            return false
        }
        if (price < 100) {
            console.error("Price must be more than 100 øre")
            return false
        }
        let body = {}
        body.price = price

        try {
            let response = await request.patch({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}`,
                headers: this.getVippsHeaders(token),
                body: JSON.stringify(body)
            })

            return response
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Updates the price of an agreement
     * @param {string} agreementId The ID of the agreement being updated
     * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status The new agreement status
     * @return {boolean} Success
     */
    async updateAgreementStatus(agreementId, status) {
        let token = await this.fetchToken()
        if (token === false) return false

        if (!agreementId || !status) {
            console.error("Missing parameter")
            return false
        }
        let body = {}
        body.status = status

        const vippsAgreement = await this.getAgreement(agreementId)
        if (vippsAgreement.status === "STOPPED") {
            console.error("Cannot modify STOPPED agreements")
            return false
        }

        try {
            await request.patch({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}`,
                headers: this.getVippsHeaders(token),
                body: JSON.stringify(body)
            })
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Creates a charge for an agreement
     * @param {string} agreementId The agreement id
     * @param {number} amountKroner The amount to charge in kroner, not øre
     * @param {number} daysInAdvance How many days in advance of today the charge is due
     * @return {boolean} Success
     */
    async createCharge(agreementId, amountKroner, daysInAdvance = 3) {

        if (daysInAdvance <= 2) {
            console.error("Due date must be more than 2 days in advance of today")
            return false
        }

        const timeNow = new Date().getTime()
        const dueDateTime = new Date(timeNow + (1000 * 60 * 60 * 24 * daysInAdvance))
        const dueDate = new Date(dueDateTime)

        // This is the date format that Vipps accepts
        const formattedDueDate = moment(dueDate).format('YYYY-MM-DD')

        const token = await this.fetchToken()
        if (token === false) return false

        // Create Idempotency-Key to prevent duplicate insertions
        // Vipps returns the same chargeId for all requests with the same Idempotency-Key
        const idempotencyKey = hash(agreementId + amountKroner + formattedDueDate)

        let headers = this.getVippsHeaders(token)
        headers['Idempotency-Key'] = idempotencyKey
        headers['agreementId'] = agreementId

        /** @type {ChargePayload} */
        const data = {
            amount: amountKroner * 100,
            currency: "NOK",
            description: "Fast donasjon til gieffektivt.no",
            due: formattedDueDate,
            retryDays: 5
        }

        const vippsAgreement = await this.getAgreement(agreementId)
        if (vippsAgreement.status !== "ACTIVE") {
            console.error("Agreement status must be ACTIVE to create charges")
            return false
        }

        try {
            const chargeRequest = await request.post({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}/charges`,
                headers: headers,
                body: JSON.stringify(data)
            })

            const vippsResponse = JSON.parse(chargeRequest)
            const vippsChargeId = vippsResponse.chargeId

            // Add to effektDonasjonDB if charge does not exist already
            const chargeInEffektDB = await DAO.vipps.getCharge(vippsChargeId)
            if (chargeInEffektDB === false) {
                await DAO.vipps.addCharge(vippsResponse["chargeId"], agreementId, amountKroner, formattedDueDate)
                return true
            }

            return true
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Fetches a single charge
     * @param {string} agreementId The agreement id
     * @param {string} chargeId The charge id
     */
    async getCharge(agreementId, chargeId) {

        const token = await this.fetchToken()
        if (token === false) return false

        try {
            const response = await request.get({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}/charges/${chargeId}`,
                headers: this.getVippsHeaders(token)
            })

            return JSON.parse(response)
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },


    /**
     * Cancels a charge
     * @param {string} agreementId The ID of the agreement
     * @param {string} chargeId The ID of the charge being cancelled
     * @return {boolean} Success
     */
    async cancelCharge(agreementId, chargeId) {

        const token = await this.fetchToken()
        if (token === false) return false

        try {
            const response = await request.delete({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}/charges/${chargeId}`,
                headers: this.getVippsHeaders(token)
            })

            return true
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Refunds a charge
     * @param {string} agreementId The ID of the agreement
     * @param {string} chargeId The ID of the charge being refunded
     * @return {boolean} Success
     */
    async refundCharge(agreementId, chargeId) {

        const token = await this.fetchToken()
        if (token === false) return false

        // Create Idempotency-Key to prevent duplicate insertions
        // Vipps returns the same chargeId for all requests with the same Idempotency-Key
        const idempotencyKey = hash(agreementId + chargeId)

        let headers = this.getVippsHeaders(token)
        headers['Idempotency-Key'] = idempotencyKey

        const charge = await this.getCharge(agreementId, chargeId)

        // Charge must be paid to be refunded
        if (charge.status !== "CHARGED") return false 

        let body = {}
        body.amount = charge.amount
        body.description = "Donasjonen din blir nå refundert"

        try {
            const response = await request.post({
                uri: `https://${config.vipps_api_url}/recurring/v2/agreements/${agreementId}/charges/${chargeId}/refund`,
                headers,
                body: JSON.stringify(body)
            })

            console.log(response)

            return true
        }
        catch (ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Poll agreement
     * @param {string} agreementId 
     */
    async pollAgreement(agreementId) {
        setTimeout(() => { this.pollLoop(agreementId, this.checkAgreement.bind(this)) }, POLLING_START_DELAY)
    },

    /**
     * This function is polled after an agreement has been drafted, to check whether
     * the user has accepted the agreement.
     * @param {string} agreementId 
     * @param {number} polls The number of times we've polled
     * @returns {boolean} True if we should cancel the polling, false otherwise
     */
    async checkAgreement(agreementId, polls) {
        // If we've been polling for more than eleven minutes, stop polling for updates
        if ((polls * POLLING_INTERVAL) + POLLING_START_DELAY > 1000 * 60 * 10) {
            console.log("Stopped polling checkAgreement for agreementId " + agreementId)
            return true
        }

        // Agreement from Vipps database
        const vippsAgreement = await this.getAgreement(agreementId)

        if (
            vippsAgreement.status === "STOPPED" || 
            vippsAgreement.status === "EXPIRED" ||
            vippsAgreement.status === "ACTIVE"
        ) {
            await DAO.vipps.updateAgreementStatus(agreementId, vippsAgreement.status)
            return true
        }

        // Keep polling for updates (status = pending)
        return false
    },

    /**
     * UTIL
     */

    /**
     * Gets vipps authorization headers
     * @param {VippsToken} token
     */
    getVippsHeaders(token) {
        return {
            'content-type': 'application/json',
            'merchant_serial_number': config.vipps_merchant_serial_number,
            'Ocp-Apim-Subscription-Key': config.vipps_ocp_apim_subscription_key,
            'Authorization': `${token.type} ${token.token}`
        }
    },

    /**
     * 
     * @param {string} id Resource ID
     * @param {function} fn Function that does the polling
     * @param {number} count The count of how many times we've polled
     */
    async pollLoop(id, fn, count = 1) {
        let shouldCancel = await fn(id, count)
        if (!shouldCancel) setTimeout(() => { this.pollLoop(id, fn, count + 1) }, POLLING_INTERVAL)
    },
}
