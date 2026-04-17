const router = require("express").Router();
const ctl = require("../controllers/appointment.controller");
const { authRequired } = require("../middleware/auth.middleware");
const { tenantRequired, typeRequired } = require("../middleware/tenant.middleware");
const { validate } = require("../middleware/validate.middleware");
const { createAppointmentSchema, slotSchema } = require("../validators/appointment.validator");

router.use(authRequired, tenantRequired, typeRequired("APPOINTMENT"));
router.post("/", validate(createAppointmentSchema), ctl.create);
router.get("/availability", ctl.availability);
router.post("/slots", validate(slotSchema), ctl.slot);

module.exports = router;
