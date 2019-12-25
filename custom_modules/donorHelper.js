/**
 * Gets firstname from donor object
 * @param {Donor} donor
 * @return {string} The firstname
 */
function getFirstname(donor) {
    let nameSplit = donor.name.split(' ')
    return nameSplit[0]
}

/**
 * Gets last name of donor
 * @param {Donor} donor 
 * @param {boolean} full Whether to include all names after firstname, or only last name
 */
function getLastName(donor, full=true) {
    let nameSplit = donor.name.split(' ')

    if (!full) return nameSplit[nameSplit.length - 1]
    else return nameSplit.shift().join(' ')
}

module.exports = {
    getFirstname,
    getLastName
}