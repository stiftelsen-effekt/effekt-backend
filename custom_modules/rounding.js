var decimal = require('decimal.js')

module.exports = {
    toPercent: function(input, total, decimals) {
        total = new decimal(total)

        var result = []
        var lastWithValue = undefined

        for (var i = 0; i < input.length; i++) {
            result[i] = new decimal(input[i])

            result[i] = result[i].div(total).mul(100)
            
            if (decimals) result[i] = setDecimals(result[i], decimals)
            if (result[i].greaterThan(0)) lastWithValue = i
        }

        if (lastWithValue) {
            var percentOfTotal = new decimal(this.sumWithPrecision(input)).div(total).mul(100)

            var remainder = percentOfTotal.sub(this.sumWithPrecision(result))
            result[lastWithValue] = result[lastWithValue].add(remainder)
        }

        for (var i = 0; i < result.length; i++) {
            result[i] = result[i].toString()
        }
        
        return result
    },

    toAbsolute: function(total, spread) {
        total = new decimal(total)

        var result = []
        var lastWithValue = undefined
        for (var i = 0; i < spread.length; i++) {
            var split = new decimal(spread[i]).div(100)

            result[i] = setDecimals(total.mul(split), 2)

            if (!split.eq(0)) lastWithValue = i
        }

        if (lastWithValue) {
            var remainder = total.mul(new decimal(this.sumWithPrecision(spread)).div(100)).sub(this.sumWithPrecision(result))
            result[lastWithValue] = result[lastWithValue].add(remainder)
        }

        for (var i = 0; i < result.length; i++) {
            result[i] = result[i].toString()
        }

        return result
    },

    sumWithPrecision: function(input) {
        var total = new decimal(0)

        for (var i = 0; i < input.length; i++) {
            total = total.add(input[i])
        }

        return total.toString()
    }
}

function setDecimals(num, decimals) {
    return new decimal(num.toFixed(decimals))
}