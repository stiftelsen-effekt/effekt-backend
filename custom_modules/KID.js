module.exports = class KID {
    constructor() {
    }

    generate() {
        let KID = Array.from({length: 7}, () => {
            return Math.floor(9 * Math.random()) + 1;
        }).join("")

        KID = "123456" + (Math.floor(9 * Math.random()) + 1)

        KID = KID + this.luhn_caclulate(KID)

        return KID
    }

    luhn_checksum(code) {
        var len = code.length
        var parity = len % 2
        var sum = 0
        for (var i = len-1; i >= 0; i--) {
            var d = parseInt(code.charAt(i))
            if (i % 2 == parity) { d *= 2 }
            if (d > 9) { d -= 9 }
            sum += d
        }
        return sum % 10
    }

    luhn_caclulate(partcode) {
        var checksum = this.luhn_checksum(partcode + "0")
        return checksum == 0 ? 0 : 10 - checksum
    }
}