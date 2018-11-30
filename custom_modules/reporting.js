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

        //A 2-dimensional array representing rows and columns
        let data = []

        //Generate headers for data
        let dataTopRow =    ['ID',  'Donasjon registrert',  'Navn',     'Metode',   'Sum']
        let dataSumation =  ['',    '',                     '',         '',         'SUM:']
        let currentColumn = dataTopRow.length

        organizations.forEach((org) => {
            let organizationHeaders = [org.name, 'Prosent fordeling', 'Sum fordeling']
            dataTopRow.push(...organizationHeaders)

            let sumationColumn = COLUMN_MAPPING[dataSumation.length+2]
            let organizationSumColumns = ['', org.name, {v: '', f: `=SUM(${sumationColumn}4:${sumationColumn + (donations.length+4)})`}]
            dataSumation.push(...organizationSumColumns)

            organizationMapping.set(org.id, currentColumn)
            currentColumn += organizationHeaders.length
        })

        //Generate the actual donation data
        let dataRows = []
        donations.forEach((donation) => {
            let donationRow = [donation.ID, donation.time, donation.name, donation.paymentMethod, donation.sum]

            donation.split.forEach((split) => {
                let startIndex = organizationMapping.get(split.id)

                donationRow[startIndex] = split.name;
                donationRow[startIndex+1] = Number(split.percentage);
                donationRow[startIndex+2] = Number(split.amount);
            })

            dataRows.push(donationRow)
        })

        //Add all the generated data
        data.push(dataSumation)
        data.push([]) //Spacing row
        data.push(dataTopRow)
        data.push(...dataRows)

        let buffer = xlsx.build([{name: "mySheetName", data: data}]);

        return buffer;
    }
}

const COLUMN_MAPPING = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS']