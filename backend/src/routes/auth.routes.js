const router = require("express").Router();
const ctl = require("../controllers/auth.controller");
const { authRequired } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { registerSchema, loginSchema } = require("../validators/auth.validator");

router.post("/register", validate(registerSchema), ctl.register);
router.post("/login", validate(loginSchema), ctl.login);
router.get("/me", authRequired, ctl.me);

module.exports = router;
