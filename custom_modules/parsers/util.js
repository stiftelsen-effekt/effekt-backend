const KID = require('./../KID.js')

module.exports = {
    /**
     * Attempts to extract a valid KID from the 
     * @param {string} input A string with a possible KID
     * @returns {null | number} Returns null if not found, or the KID as a number
     */
    extractKID: function(input) {
        let extractionRegex = /(?=(\d{8}))/
        let attemptedExtraction = extractionRegex.exec(String(input))
      
        if (!attemptedExtraction || attemptedExtraction.length < 2) return null
      
        attemptedExtraction = attemptedExtraction[1]
      
        let KIDsubstr = attemptedExtraction.substr(0,7)
        let checkDigit = KID.luhn_caclulate(KIDsubstr)
      
        if (KIDsubstr + checkDigit.toString() != attemptedExtraction) return null
      
        return Number(attemptedExtraction)
      },

    getStartRecordTransmission: function(toBeDeleted) {
        DATAAVSENDER, FORSENDELSESNUMMER      
        var line = `NY000010--------'-------'0000808`;
        line.padEnd(80, 0);
        return line;
      },

    getStartRecordAccountingDataAndDeleted: function(toBeDeleted) {
        var line =`\nNY2100${toBeDeleted}`;
        line.padEnd(17, 0);
        line += OPPDRAGSNUMMER, OPPDRAGSKONTO;
        line.padEnd(80, 0);
      
        return line;
      },
      //make generic 
      getFirstAndSecondLine: function(DAOagreement, type) {

        TRANSNR
        var firstLine =`\nNY21${type}30-------`;
        firstLine += DAOagreement.payment_date;
        firstLine.padEnd(32, 0);

        var amount = DAOagreement.amount;
        amount.padStart(17, 0);
        firstLine += amount;

        var KID = DAOagreement.KID;
        KID.padStart(25, 0);
        firstLine += KID;
        
        firstLine.padEnd(80, 0);

        TRANSNR
        var secondLine =`\nNY210231-------`;

        NAVN

        secondLine.padEnd(80, 0);

        lines = `${firstLine}\n${secondLine}`
        return lines
      },

      getEndRecordAccountingData: function(type, transactions, sumAmount, firstDate, lastDate) {
        var line =`\nNY2100${type}`;
        var transactionsField = transactions;
        transactionsField.padStart(8, 0);
        line += transactions

        RECORDS
        line += `00000006`;
        
        var amount = sumAmount;
        amount.padStart(17, 0);
        line += amount;

        line += firstDate;
        line += lastDate;

        line.padEnd(80, 0);
        return line;
      },
}