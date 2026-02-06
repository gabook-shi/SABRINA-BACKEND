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
  "F4A5153": { name: "T-Shirt", price: 999 },
  "F1C3A60": { name: "Polo Shirt", price: 1490 },
  "C3233927": { name: "Shorts", price: 20 },
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
//This schema tells MongoDB how to store a basket: its ID, the list of items, their prices and quantities, and the basket’s current status.

const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  basketId: String,
  action: String,
  items: Array
});

const Basket = mongoose.model("Basket", BasketSchema);
const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

//This schema records a history of actions taken on baskets, so you can track changes over time (like a logbook).

//“In our backend, we use Mongoose schemas to define how data is stored in MongoDB. The Basket schema defines the structure of a customer’s basket — items, prices, quantities, and status. 
//The AuditLog schema records every action taken on a basket, with a timestamp and snapshot of items. We then turn these schemas into models, which give us easy methods to create, read,
//update, and delete documents in MongoDB.”

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
// “This helper function takes the raw list of scanned UIDs and builds structured basket items. It looks up each UID in our product catalog, groups duplicates together, 
// and counts them as quantities. The result is a clean array of items with names, prices, and quantities that the backend can store and the frontend can display.”

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
//“This route is where the ESP updates the basket. It receives a basket ID and a list of scanned UIDs, validates them, builds item objects, and updates the basket in MongoDB. 
// If the basket doesn’t exist, it creates one. It also logs every update in the audit trail for traceability. Finally, it returns the updated basket as JSON so the frontend stays in sync.”

/* =========================
   GET BASKET
========================= */
app.get("/basket/:basketId", async (req, res) => {
  const basket = await Basket.findOne({ basketId: req.params.basketId });
  if (!basket) return res.status(404).json({ error: "Basket not found" });
  res.json(basket);
});

//“This route lets the frontend or cashier system fetch the current basket by ID. It queries MongoDB for the basket, and if found, returns it as JSON. If not found, 
// it returns a 404 error. This ensures the frontend always has the latest basket state tied to a specific customer.”

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

//“This route finalizes the basket. The cashier sends a decision — either paid or cancelled. The backend updates the basket’s status in MongoDB, 
// logs the decision in the audit trail, and responds with success. If the basket doesn’t exist, it returns a 404, and if something fails internally, it returns a 500 error.”

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

//“This route finalizes the basket. The cashier sends a decision — either paid or cancelled. The backend updates the basket’s status in MongoDB, 
// logs the decision in the audit trail, and responds with success. If the basket doesn’t exist, it returns a 404, and if something fails internally, it returns a 500 error.”

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
//“This route lets us adjust the quantity of a specific item in a basket. The frontend sends the basket ID, the item UID, and a delta (+1 or -1). The backend finds the basket, 
// updates the item’s quantity, ensures it never goes below 1, saves the basket, and logs the change. It responds with the updated item so the frontend can refresh immediately.”

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

//“We added an optional /audit route to view the last 100 actions in the system, sorted by time. This is useful for debugging and transparency. 
// Finally, we start the server on port 3000 (or whatever port the environment provides). Once the server is running, all our basket routes are live and ready to handle requests.”
