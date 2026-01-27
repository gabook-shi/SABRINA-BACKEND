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
   Backend-only source of truth
========================= */
const ITEM_CATALOG = {
  "935B4A05": { name: "Coca Cola 330ml", price: 35 },
  "C3233927": { name: "Potato Chips", price: 25 },
  "41896316": { name: "Chocolate Bar", price: 20 }
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
      itemPrice: Number
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
   HELPER: BUILD ITEMS FROM UID LIST
========================= */
function buildItemsFromUIDs(uidList) {
  const items = [];

  uidList.forEach(uid => {
    const product = ITEM_CATALOG[uid];
    if (product) {
      items.push({
        uidItem: uid,
        itemName: product.name,
        itemPrice: product.price
      });
    }
  });

  return items;
}

/* =========================
   ESP → UPDATE BASKET
   (Presence-based, full list every time)
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

    await AuditLog.create({
      basketId,
      action: "UPDATE",
      items
    });

    res.json(basket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CASHIER → GET BASKET
========================= */
app.get("/basket/:basketId", async (req, res) => {
  const basket = await Basket.findOne({ basketId: req.params.basketId });
  if (!basket) return res.status(404).json({ error: "Basket not found" });
  res.json(basket);
});

/* =========================
   CASHIER → CONFIRM / CANCEL
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
   OPTIONAL: VIEW AUDIT LOGS
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
