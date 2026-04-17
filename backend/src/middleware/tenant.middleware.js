const { HttpError } = require("../lib/httpError");

function tenantRequired(req, _res, next) {
  const businessId = req.headers["x-business-id"] || req.auth?.businessId;
  if (!businessId) return next(new HttpError(400, "Missing business tenant context"));
  req.businessId = businessId;
  return next();
}

function typeRequired(type) {
  return (req, _res, next) => {
    if (req.auth?.businessType !== type) {
      return next(new HttpError(403, `Endpoint only available for ${type} businesses`));
    }
    return next();
  };
}

module.exports = { tenantRequired, typeRequired };
