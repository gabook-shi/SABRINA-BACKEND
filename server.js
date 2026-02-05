const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   DATABASE CONNECTION
========================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* =========================
   ITEM CATALOG (UID → ITEM)
========================= */
const ITEM_CATALOG = {
  "935B4A5": { name: "T-Shirt", price: 999 },
  "C3233927": { name: "Polo Shirt", price: 1490 },
  "41896316": { name: "Chocolate Bar", price: 20 },
  "1EB380": { name: "Banana", price: 35 },
  "F1C3A60": { name: "Apple", price: 75 },
  "13828E14": { name: "Coca Cola 100ml", price: 25 }
};

/* =========================
   SCHEMAS
========================= */
const BasketSchema = new mongoose.Schema({
  basketId: String,
  items: [
    {
      uidItem: String,
      itemName: String,
      itemPrice: Number,
      quantity: { type: Number, default: 1 } // ✅ Added quantity
    }
  ],
  status: { type: String, default: "PENDING" }
});

const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  basketId: String,
  action: String,
  items: Array
});

const Basket = mongoose.model("Basket", BasketSchema);
const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

/* =========================
   HELPERS
========================= */
function buildItemsFromUIDs(uidList) {
  const itemMap = {};

  uidList.forEach(uid => {
    const product = ITEM_CATALOG[uid];
    if (product) {
      if (!itemMap[uid]) {
        itemMap[uid] = {
          uidItem: uid,
          itemName: product.name,
          itemPrice: product.price,
          quantity: 1
        };
      } else {
        itemMap[uid].quantity += 1;
      }
    }
  });

  return Object.values(itemMap);
}

/* =========================
   ESP → UPDATE BASKET
========================= */
app.post("/basket/update", async (req, res) => {
  try {
    const { basketId, uids } = req.body;

    if (!basketId || !Array.isArray(uids)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const items = buildItemsFromUIDs(uids);

    const basket = await Basket.findOneAndUpdate(
      { basketId },
      { items, status: "PENDING" },
      { upsert: true, new: true }
    );

    await AuditLog.create({ basketId, action: "UPDATE", items });

    res.json(basket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET BASKET
========================= */
app.get("/basket/:basketId", async (req, res) => {
  const basket = await Basket.findOne({ basketId: req.params.basketId });
  if (!basket) return res.status(404).json({ error: "Basket not found" });
  res.json(basket);
});

/* =========================
   CONFIRM / CANCEL PAYMENT
========================= */
app.post("/basket/decision", async (req, res) => {
  try {
    const { basketId, paid } = req.body;
    const basket = await Basket.findOne({ basketId });
    if (!basket) return res.status(404).json({ error: "Basket not found" });

    basket.status = paid ? "PAID" : "CANCELLED";
    await basket.save();

    await AuditLog.create({
      basketId,
      action: paid ? "PAID" : "CANCELLED",
      items: basket.items
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CUSTOMER CHECKOUT → RETURN BASKET ID ONLY
========================= */
app.post("/basket/checkout", async (req, res) => {
  try {
    const { basketId } = req.body;
    const basket = await Basket.findOne({ basketId });
    if (!basket) return res.status(404).json({ error: "Basket not found" });

    basket.status = "PAID";
    await basket.save();

    await AuditLog.create({ basketId, action: "PAID", items: basket.items });

    res.json({ qrData: basket.basketId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   UPDATE ITEM QUANTITY
========================= */
app.post("/basket/update-quantity", async (req, res) => {
  try {
    const { basketId, uidItem, delta } = req.body;

    if (!basketId || !uidItem || typeof delta !== "number") {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }

    const basket = await Basket.findOne({ basketId });
    if (!basket) return res.status(404).json({ success: false, message: "Basket not found" });

    const item = basket.items.find(i => i.uidItem === uidItem);
    if (!item) return res.status(404).json({ success: false, message: "Item not found in basket" });

    item.quantity = Math.max(1, (item.quantity || 1) + delta); // Prevent quantity < 1

    await basket.save();

    await AuditLog.create({
      basketId,
      action: `QUANTITY ${delta > 0 ? "INCREASED" : "DECREASED"}`,
      items: basket.items
    });

    res.json({ success: true, updatedItem: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   VIEW AUDIT LOGS (optional)
========================= */
app.get("/audit", async (req, res) => {
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
