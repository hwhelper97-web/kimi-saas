const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const { HttpError } = require("../lib/httpError");

function authRequired(req, _res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return next(new HttpError(401, "Missing authorization token"));

  try {
    req.auth = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return next(new HttpError(401, "Invalid token"));
  }
}

function roleRequired(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new HttpError(403, "Insufficient role"));
    }
    return next();
  };
}

module.exports = { authRequired, roleRequired };
