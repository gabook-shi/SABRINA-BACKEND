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
  return uidList
    .map(uid => {
      const product = ITEM_CATALOG[uid];
      if (!product) return null;
      return { uidItem: uid, itemName: product.name, itemPrice: product.price };
    })
    .filter(Boolean);
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

    await AuditLog.create({
      basketId,
      action: "UPDATE",
      items
    });

    res.status(200).json(basket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CASHIER → GET BASKET
========================= */
app.get("/basket/:basketId", async (req, res) => {
  try {
    const basket = await Basket.findOne({ basketId: req.params.basketId });
    if (!basket) return res.status(404).json({ error: "Basket not found" });
    res.status(200).json(basket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
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

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CUSTOMER CHECKOUT → GENERATE QR AND MARK PAID
========================= */
app.post("/basket/checkout", async (req, res) => {
  try {
    const { basketId } = req.body;
    const basket = await Basket.findOne({ basketId });
    if (!basket) return res.status(404).json({ error: "Basket not found" });

    basket.status = "PAID";
    await basket.save();

    await AuditLog.create({
      basketId,
      action: "PAID",
      items: basket.items
    });

    // Return QR data as JSON
    const qrData = JSON.stringify({
      basketId,
      total: basket.items.reduce((sum, i) => sum + i.itemPrice, 0)
    });

    res.status(200).json({ qrData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   OPTIONAL: VIEW AUDIT LOGS
========================= */
app.get("/audit", async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
    res.status(200).json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
