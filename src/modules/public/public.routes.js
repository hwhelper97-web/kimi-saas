const express = require("express");
const router = express.Router();
const publicController = require("./public.controller");

// Public Menu Route: e.g., nexton.ai/m/pizza-shop
router.get("/m/:subdomain", publicController.renderMobileMenu);

module.exports = router;
