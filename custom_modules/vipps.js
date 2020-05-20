const request = require('request-promise-native')
const config = require('./../config')
const DAO = require('./DAO')

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
     * @return {string} Returns a URL for which to redirect the user to when finishing the payment
     */
    async initiateOrder(donorPhoneNumber, token) {
        let data = {
            "customerInfo": {
                "mobileNumber": donorPhoneNumber
            },
            "merchantInfo": {
                "authToken": token,
                "callbackPrefix": "https://data.gieffektivt.no/vipps/callback",
                "fallBack": "https://gieffektivt.no/vipps-kansellert",
                "isApp": false,
                "merchantSerialNumber": 212771,
                "paymentType": "eComm Regular Payment"
            },
            "transaction": {
                "amount": 100,
                "orderId": "56448919814918809841",
                "timeStamp": new Date(),
                "transactionText": "Donasjon til Gieffektivt.no",
                "skipLandingPage": false
            }
        }

        let vippsRequest = await request.post({
            uri: "https://apitest.vipps.no/accesstoken/get",
            headers: {
                'merchant_serial_number': config.vipps_merchant_serial_number,
                'Ocp-Apim-Subscription-Key': config.vipps_ocp_apim_subscription_key,
                'Authorization': `${token.type} ${token.token}`
            },
            body: data
        })

        let vippsRequest = JSON.parse(vippsRequest)

        return vippsRequest.url
    }
}