module.exports = {
    generate: function() {
        var KID = Array.from({length: 7}, () => {
            return Math.floor(9 * Math.random()) + 1;
        }).join("")

        KID = KID + this.luhn_caclulate(KID)

        return KID
    },

    luhn_checksum: function(code) {
        const length = code.length
        const parity = length % 2
        var sum = 0
        for (var i = length-1; i >= 0; i--) {
            var d = parseInt(code.charAt(i))
            if (i % 2 == parity) { d *= 2 }
            if (d > 9) { d -= 9 }
            sum += d
        }
        return sum % 10
    },

    luhn_caclulate: function(partcode) {
        const checksum = this.luhn_checksum(partcode + "0")
        return checksum == 0 ? 0 : 10 - checksum
    }
}