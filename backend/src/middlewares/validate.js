// Envuelve un esquema Zod y valida body/query/params antes de llegar al
// controlador. Cualquier campo no declarado en el esquema es rechazado
// (uso de .strict()) para evitar "mass assignment" de campos no esperados.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos.',
        detalles: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data.body ?? req.body;
    req.query = result.data.query ?? req.query;
    req.params = result.data.params ?? req.params;
    return next();
  };
}

module.exports = { validate };
