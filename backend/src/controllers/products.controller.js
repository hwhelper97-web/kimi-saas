const prisma = require("../config/prisma");

async function listProducts(_req, res) {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  return res.json(products);
}

async function getProduct(req, res) {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json(product);
}

async function createProduct(req, res) {
  const payload = {
    ...req.body,
    price: Number(req.body.price),
    stock: Number(req.body.stock || 0),
    imageUrl: req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl
  };
  const product = await prisma.product.create({ data: payload });
  return res.status(201).json(product);
}

async function updateProduct(req, res) {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      ...req.body,
      price: req.body.price ? Number(req.body.price) : undefined,
      stock: req.body.stock ? Number(req.body.stock) : undefined,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl
    }
  });
  return res.json(product);
}

async function deleteProduct(req, res) {
  await prisma.product.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
