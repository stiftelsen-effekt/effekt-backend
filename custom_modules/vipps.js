const request = require('request-promise-native')
const config = require('./../config')
const DAO = require('./DAO')
const crypto = require('../custom_modules/authorization/crypto')

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
                    expires: new Date(parseInt(tokenResponse.expires_on)*1000),
                    type: tokenResponse.token_type,
                    token: tokenResponse.access_token
                }
                
                token.ID = await DAO.vipps.addToken(token)
            }
            
            return token
        }
        catch(ex) {
            console.error(ex)
            return false
        }
    },

    /**
     * Initiates a vipps order
     * @param {number} donorPhoneNumber The phone number of the donor
     * @param {VippsToken} token
     * @param {number} sum The chosen donation in NOK
     * @return {string | false} Returns a URL for which to redirect the user to when finishing the payment
     */
    async initiateOrder(KID, sum) {
        let token = await this.fetchToken()

        if (token === false) return false

        let donor = await DAO.donors.getByKID(KID)
        let order = {
            orderID: `${KID}-${+new Date()}`,
            donorID: donor.id,
            KID: KID,
            token: crypto.getPasswordSalt()
        }

        let data = {
            "customerInfo": {},
            "merchantInfo": {
                "authToken": order.token,
                "callbackPrefix": `${config.api_url}/vipps/`,
                "fallBack": "https://gieffektivt.no/donation-recived/",
                "isApp": false,
                "merchantSerialNumber": 212771,
                "paymentType": "eComm Regular Payment"
            },
            "transaction": {
                "amount": sum*100, //Specified in øre, therefore NOK * 100
                "orderId": order.orderID,
                "timeStamp": new Date(),
                "transactionText": "Donasjon til Gieffektivt.no",
                "skipLandingPage": false
            }
        }

        let initiateRequest = await request.post({
            uri: `https://${config.vipps_api_url}/ecomm/v2/payments`,
            headers: this.getVippsHeaders(token),
            json: data
        })

        console.log(initiateRequest)
        console.log(order)
        await DAO.vipps.addOrder(order)

        return initiateRequest.url
    },

    /**
     * Captures a order with a reserved amount
     * @param {string} orderId
     * @param {VippsOrderTransactionStatus} transactionStatus The reserved transaction status
     * @return {boolean} Captured or not
     */
    async captureOrder(orderId, transactionStatus) {
        let token = await this.fetchToken()

        let data = {
            merchantInfo: {
                merchantSerialNumber: config.vipps_merchant_serial_number
            },
            transaction: {
                amount: transactionStatus.amount,
                transactionText: "Donasjon til Gieffektivt.no"
            }
        }

        let captureRequest = await request.post({
            uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/capture`,
            headers: this.getVippsHeaders(token),
            json: data
        })

        let KID = orderId.split("-")[0]
        console.log(KID)

        if (captureRequest.transactionInfo.status == "captured") {
            let donationID = await DAO.donations.add(KID, paymentMethods.vipps, (transactionStatus.amount/100), transactionStatus.timestamp, transactionStatus.transactionID)
            await DAO.vipps.updateVippsOrderDonation(orderId, donationID)
            return true
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

        return false
    },

    /**
     * Approves an order manually (without using the vipps app)
     * Used for integration testing
     * @param {string} orderId
     * @param {string} linkToken Token returned from the vipps api when initating an order
     * @return {boolean} Approved or not
     */
    async approveOrder(orderId, orderToken) {
        if (config.env === 'production') return false

        let token = await this.fetchToken()

        let data = {
            customerPhoneNumber: 93279221,
            token: linkToken
        }

        let captureRequest = await request.post({
            uri: `https://${config.vipps_api_url}/ecomm/v2/integration-test/payments/${orderId}/approve`,
            headers: this.getVippsHeaders(token),
            json: data
        })

        console.log(captureRequest)
        if (captureRequest.statusCode == 200) return true
        else return false
    },

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
    }
}