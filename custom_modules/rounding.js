module.exports = {
    toPercent: function(input, decimals) {
        let total = input.reduce((acc, elem) => acc += elem, 0)
        let result = []

        for (let i = 0; i < input.length; i++) {
            result[i] = (input[i] / total) * 100
            if (typeof decimals !== "undefined") result[i] = Math.round(result[i] * Math.pow(10, decimals)) / Math.pow(10, decimals)
        }

        var remainder = 100 - result.reduce((acc, elem) => acc + elem, 0)

        if (remainder != 0) result[result.length-1] += remainder

        return result
    }
}