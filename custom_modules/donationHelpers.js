const KID = require('./KID')
const Distnr = require('./distnr')
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
      
    createKID: async (donorId, distributionNumber) => {
        //Create new valid KID
        let newKID = KID.generate(donorId, distributionNumber)
        //If KID already exists, try new kid, call this function recursively
        if (await DAO.distributions.KIDexists(newKID))
            newKID = await this.createKID()
    
        return newKID
    },

    createDistributionNumber: async () => {
        let distNr = distNr.generate()
        if (await DAO.distributions.DistnrExists(newKID))
            newKID = await this.createDistributionNumber()
    
        return newKID
    }
}