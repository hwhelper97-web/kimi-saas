function errorMiddleware(err, req, res, _next) {
  const status = Number(err?.status) || 500;
  const message = err?.message || "Internal server error";

  console.error("[error.middleware] Request failed", {
    method: req.method,
    path: req.originalUrl,
    status,
    message,
  });

  res.status(status).json({ message });
}

module.exports = { errorMiddleware };
