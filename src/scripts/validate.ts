import config from "../config";
import { DAO } from "../custom_modules/DAO";
import methods from "../enums/methods";

async function validateStandardSplit() {
  try {
    const organisations = await DAO.organizations.getStandardSplit();
    return organisations.length > 0;
  } catch (ex) {
    console.log(ex);
    return false;
  }
}

async function validateDataOwners() {
  try {
    const dataOwners = await DAO.meta.getDataOwners();
    return dataOwners.length > 0;
  } catch (ex) {
    return false;
  }
}

async function validateDefaultDataOwner() {
  try {
    const defaultDataOwner = await DAO.meta.getDefaultOwnerID();
    return defaultDataOwner != null;
  } catch (ex) {
    return false;
  }
}

async function validatePaymentMethods() {
  try {
    const paymentMethods = await DAO.payment.getMethods();

    for (const method of paymentMethods) {
      switch (method.id) {
        case methods.SWISH: {
        }
      }
    }
  } catch (ex) {
    return false;
  }
}

function validateSwish() {
  return (
    config.swish_cert != null && config.swish_cert_key != null && config.swish_payee_alias != null
  );
}

const main = async () => {
  await DAO.connect();

  const canGetStandardSplit = await validateStandardSplit();
  const canGetDataOwners = await validateDataOwners();
  const canGetDefaultDataOwner = await validateDefaultDataOwner();
  console.log({
    canGetStandardSplit,
    canGetDataOwners,
    canGetDefaultDataOwner,
  });
  if (![canGetStandardSplit, canGetDataOwners, canGetDefaultDataOwner].every(Boolean)) {
    throw new Error("Validation failed");
  }
  console.log("Validation passed");
};

void main();
