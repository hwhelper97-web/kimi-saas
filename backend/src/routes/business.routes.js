const router = require("express").Router();
const ctl = require("../controllers/business.controller");
const { authRequired } = require("../middleware/auth.middleware");
const { tenantRequired } = require("../middleware/tenant.middleware");
const { validate } = require("../middleware/validate.middleware");
const { updateBusinessSchema } = require("../validators/business.validator");

router.get("/", authRequired, tenantRequired, ctl.getBusiness);
router.patch("/", authRequired, tenantRequired, validate(updateBusinessSchema), ctl.updateBusiness);

module.exports = router;
