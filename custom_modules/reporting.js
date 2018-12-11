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
        const dataStartRow = 6;

        //A 2-dimensional array representing rows and columns
        let data = []

        //Generate headers for data
        let sumifnameColumn = COLUMN_MAPPING[3] //Metode header

        let simifcomparisonrange = `${sumifnameColumn + dataStartRow}:${sumifnameColumn + (donations.length+dataStartRow)}`
        let sumationRange = `${COLUMN_MAPPING[4] + dataStartRow}:${COLUMN_MAPPING[4] + (donations.length+dataStartRow)}`
        let checkSumRange = `${COLUMN_MAPPING[6]}1:${COLUMN_MAPPING[6 + (organizations.length * 3)]}1`;

        let dataTopRow =            ['ID',  'Donasjon registrert',  'Navn',     'Metode',   'Sum']
        let dataSumation =          ['Checksum', formula(`${COLUMN_MAPPING[4]}1 - SUM(${checkSumRange})`), '','Sum',formula(`SUM(${sumationRange})`)]

        //Sumation for specific payment methods
        
        let dataSumationPayPal =    ['',    '',                     '',         'Sum PayPal',formula(`SUMIF(${simifcomparisonrange}, "PayPal", ${sumationRange})`)]
        let dataSumationVipps =     ['',    '',                     '',         'Sum Vipps', formula(`SUMIF(${simifcomparisonrange}, "Vipps", ${sumationRange})`)]

        let currentColumn = dataTopRow.length

        

        organizations.forEach((org) => {
            let organizationHeaders = [org.name, '%', 'Kr']
            dataTopRow.push(...organizationHeaders)

            let sumationColumn = COLUMN_MAPPING[dataSumation.length+2]
            let sumationRange = `${sumationColumn + dataStartRow}:${sumationColumn + (donations.length+dataStartRow)}`;

            let organizationSumColumns = [org.abbriv, '', formula(`SUM(${sumationRange})`)]
            dataSumation.push(...organizationSumColumns)
            let organizationSumPayPalColumns = [org.abbriv, '', formula(`SUMIF(${simifcomparisonrange}, "PayPal", ${sumationRange})`)]
            dataSumationPayPal.push(...organizationSumPayPalColumns)
            let organizationSumVippsColumns = [org.abbriv, '', formula(`SUMIF(${simifcomparisonrange}, "Vipps", ${sumationRange})`)]
            dataSumationVipps.push(...organizationSumVippsColumns)

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
        data.push(dataSumationPayPal)
        data.push(dataSumationVipps)
        data.push([]) //Spacing row
        data.push(dataTopRow)
        data.push(...dataRows)

        let buffer = xlsx.build([{name: "mySheetName", data: data}]);

        return buffer;

        //Helper functions
        function formula(formula) {
            return {v: '', f: `=${formula}`}
        }
    }
}

const COLUMN_MAPPING = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 
                        'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ',
                        'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW', 'BX', 'BY', 'BZ' ]