const authService = require("../services/auth.service");

async function register(req, res, next) {
  try {
    const payload = req.validated?.body || req.body;
    const data = await authService.register(payload);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const payload = req.validated?.body || req.body;
    console.log("[auth.controller] Login request received", { email: payload?.email });
    const data = await authService.login(payload);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ auth: req.auth });
}

module.exports = { register, login, me };
