const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// BASKET SCHEMA
const Basket = mongoose.model("Basket", new mongoose.Schema({
  basketId: String,
  items: [
    {
      uidItem: String,
      itemName: String,
      itemPrice: Number
    }
  ],
  status: { type: String, default: "PENDING" }
}));

// ADD / UPDATE BASKET
app.post("/basket/update", async (req, res) => {
  const { basketId, items } = req.body;

  const basket = await Basket.findOneAndUpdate(
    { basketId },
    { items },
    { upsert: true, new: true }
  );

  res.json(basket);
});

// CHECKOUT
app.post("/basket/checkout", async (req, res) => {
  const { basketId } = req.body;

  await Basket.updateOne(
    { basketId },
    { status: "PAID" }
  );

  res.json({ success: true });
});

app.listen(3000, () => console.log("🚀 Server running"));

