const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// MongoDB
// =======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// =======================
// Schemas
// =======================
const BasketSchema = new mongoose.Schema({
  basketId: String,
  items: [
    {
      uidItem: String,
      itemName: String,
      itemPrice: Number
    }
  ],
  status: { type: String, default: "ACTIVE" },
  updatedAt: { type: Date, default: Date.now }
});

const AuditSchema = new mongoose.Schema({
  basketId: String,
  action: String,
  items: [
    {
      uidItem: String,
      itemName: String,
      itemPrice: Number
    }
  ],
  timestamp: { type: Date, default: Date.now }
});

const Basket = mongoose.model("Basket", BasketSchema);
const AuditLog = mongoose.model("AuditLog", AuditSchema);

// =======================
// Audit Helper
// =======================
async function logAudit(basketId, action, items = []) {
  try {
    await AuditLog.create({ basketId, action, items });
  } catch (err) {
    console.error("❌ Audit error:", err);
  }
}

// =======================
// 1️⃣ RFID SYNC (presence-based)
// =======================
app.post("/basket/sync", async (req, res) => {
  const { basketId, items } = req.body;

  if (!basketId || !Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const basket = await Basket.findOneAndUpdate(
    { basketId },
    {
      items,
      status: "ACTIVE",
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  await logAudit(basketId, "ITEMS_SYNCED", items);

  res.json(basket);
});

// =======================
// 2️⃣ FETCH BASKET (frontend)
// =======================
app.get("/basket/:basketId", async (req, res) => {
  const basket = await Basket.findOne({ basketId });
  res.json(basket);
});

// =======================
// 3️⃣ CHECKOUT (generate QR payload)
// =======================
app.post("/basket/checkout", async (req, res) => {
  const { basketId } = req.body;

  const basket = await Basket.findOneAndUpdate(
    { basketId },
    { status: "CHECKOUT" },
    { new: true }
  );

  if (!basket) return res.status(404).json({ error: "Basket not found" });

  await logAudit(basketId, "CHECKOUT_STARTED", basket.items);

  // QR contains only basketId (secure & small)
  res.json({ qrData: basketId });
});

// =======================
// 4️⃣ CASHIER DECISION
// =======================
app.post("/basket/decision", async (req, res) => {
  const { basketId, paid } = req.body;

  const status = paid ? "PAID" : "CANCELLED";

  const basket = await Basket.findOneAndUpdate(
    { basketId },
    { status },
    { new: true }
  );

  if (!basket) return res.status(404).json({ error: "Basket not found" });

  await logAudit(basketId, status, basket.items);

  res.json({ success: true });
});

// =======================
// 5️⃣ AUDIT VIEWER
// =======================
app.get("/audit/:basketId", async (req, res) => {
  const logs = await AuditLog.find({ basketId: req.params.basketId })
    .sort({ timestamp: 1 });

  res.json(logs);
});

// =======================
// 6️⃣ AUTO CLEANUP (30 mins idle)
// =======================
setInterval(async () => {
  const expiry = new Date(Date.now() - 30 * 60 * 1000);

  const expired = await Basket.find({
    status: "ACTIVE",
    updatedAt: { $lt: expiry }
  });

  for (const basket of expired) {
    await logAudit(basket.basketId, "AUTO_CLEANUP", basket.items);
    await basket.deleteOne();
  }
}, 5 * 60 * 1000);

// =======================
app.listen(3000, () => console.log("🚀 Server running"));
