const KID = require('./KID')
const DAO = require('./DAO')

module.exports = {
    createDonationSplitArray: async (passedOrganizations) => {
        //Filter passed organizations for 0 shares
        var filteredOrganizations = passedOrganizations.filter(org => org.split > 0)
    
        var organizationIDs = filteredOrganizations.map(org => org.id)
        var orgs = await DAO.organizations.getByIDs(organizationIDs)
    
        if (orgs.length != filteredOrganizations.length) throw new Error("Could not find all organizations in DB")
    
        var donationSplits = []
    
        for (var i = 0; i < orgs.length; i++) {
            for (var j = 0; j < filteredOrganizations.length; j++) {
                if (filteredOrganizations[j].id == orgs[i].ID) {
                    donationSplits.push({
                        organizationID: orgs[i].ID,
                        share: filteredOrganizations[j].split,
                        name: orgs[i].full_name
                    })
            
                    filteredOrganizations.splice(j,1)
                    orgs.splice(i,1)
                    i--
            
                    break
                }
            }
        }
    
        return donationSplits
    },
      
    getStandardSplit: async () => {
        return await DAO.organizations.getStandardSplit()
    },
      
    /**
     * Generates a KID with a given length
     * For length 8 uses random numbers with a luhn chekcsum
     * For length 
     * @param {8 | 15} length 
     * @param {number | null} donorId Used for new KID format with 15 positions
     * @returns {string} The generated KID
     */
    createKID: async (length = 8, donorId = null) => {
        //Create new valid KID
        let newKID = KID.generate(length, donorId)
        //If KID already exists, try new kid, call this function recursively
        if (await DAO.distributions.KIDexists(newKID))
            newKID = await this.createKID()
    
        return newKID
    }
}