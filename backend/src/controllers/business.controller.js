const businessService = require("../services/business.service");

async function getBusiness(req, res, next) {
  try {
    const business = await businessService.getBusiness(req.businessId);
    res.json(business);
  } catch (err) {
    next(err);
  }
}

async function updateBusiness(req, res, next) {
  try {
    const business = await businessService.updateBusiness(req.businessId, req.validated.body);
    res.json(business);
  } catch (err) {
    next(err);
  }
}

module.exports = { getBusiness, updateBusiness };
