const authService = require("../services/auth.service");

async function register(req, res, next) {
  try {
    const data = await authService.register(req.validated.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const data = await authService.login(req.validated.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ auth: req.auth });
}

module.exports = { register, login, me };
