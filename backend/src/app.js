const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { errorMiddleware } = require("./middleware/error.middleware");

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 250 }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/business", require("./routes/business.routes"));
app.use("/api/appointments", require("./routes/appointment.routes"));
app.use("/api/order", require("./routes/order.routes"));
app.use("/api/voice", require("./routes/voice.routes"));

app.use(errorMiddleware);
module.exports = app;
