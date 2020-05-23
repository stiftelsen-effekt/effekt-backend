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
                    uri: "https://apitest.vipps.no/accesstoken/get",
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

        let donorID = await DAO.donors.getByKID(KID)
        let order = {
            orderID: `${KID}-${+new Date()}`,
            donorID: donorID,
            KID: KID,
            token: crypto.getPasswordSalt()
        }

        let data = {
            "customerInfo": {},
            "merchantInfo": {
                "authToken": token.token,
                "callbackPrefix": `${config.api_url}/vipps/`,
                "fallBack": "https://gieffektivt.no/vipps-fallback",
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
            uri: "https://apitest.vipps.no/ecomm/v2/payments",
            headers: this.getVippsHeaders(token),
            json: data
        })

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
            uri: `https://apitest.vipps.no/ecomm/v2/payments/${orderId}/capture`,
            headers: this.getVippsHeaders(token),
            json: data
        })

        
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