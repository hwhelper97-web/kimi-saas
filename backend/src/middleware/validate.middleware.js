function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      return next({ status: 422, message: result.error.issues.map((i) => i.message).join(", ") });
    }
    req.validated = result.data;
    return next();
  };
}

module.exports = { validate };
