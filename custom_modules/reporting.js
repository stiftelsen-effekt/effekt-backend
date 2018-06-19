const xlsx = require('node-xlsx').default

module.exports = {
    /**
     * Creates an excel file from individual donations
     * @param {Array} donations An array containing individual donations
     * @param {Array} organizations An array of all the organizations in the database
     * @returns {Buffer} The output excel file
     */
    createExcelFromIndividualDonations: function(donations, organizations) {
        let organizationMapping = new Map();

        let data = []

        let topRow = ['ID', 'Donasjon registrert', 'Navn', 'Metode', 'Sum']
        let currentColumn = topRow.length
        organizations.forEach((org) => {
            let organizationHeaders = [org.name, 'Prosent fordeling', 'Sum fordeling']
            topRow.push(...organizationHeaders)

            organizationMapping.set(org.id, currentColumn)

            currentColumn += organizationHeaders.length
        })

        data.push(topRow)

        donations.forEach((donation) => {
            let donationRow = [donation.ID, donation.time, donation.name, donation.paymentMethod, donation.sum]

            donation.split.forEach((split) => {
                let startIndex = organizationMapping.get(split.id)

                donationRow[startIndex] = split.name;
                donationRow[startIndex+1] = Number(split.percentage);
                donationRow[startIndex+2] = Number(split.amount);
            })

            data.push(donationRow)
        })

        let buffer = xlsx.build([{name: "mySheetName", data: data}]);

        return buffer;
    }
}