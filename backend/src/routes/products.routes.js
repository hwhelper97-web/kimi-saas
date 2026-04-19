const { Router } = require("express");
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
} = require("../controllers/products.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = Router();

router.get("/", listProducts);
router.get("/:id", getProduct);
router.post("/", requireAuth, upload.single("image"), createProduct);
router.put("/:id", requireAuth, upload.single("image"), updateProduct);
router.delete("/:id", requireAuth, deleteProduct);

module.exports = router;
