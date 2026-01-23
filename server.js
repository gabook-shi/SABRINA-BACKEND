const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const cors = require('cors');

const PORT = process.env.PORT;
const app = express();

// Allow GitHub Pages frontend
app.use(cors({
  origin: 'https://gabook-shi.github.io'
}));

app.use(express.json());

const baskets = new Map();
const seenTags = new Map(); // ✅ Track seen tags per basket
let basketIndex = 0;

// Add or update item in basket
app.post('/basket/add', (req, res) => {
    const { basket_id, display_id, price, quantity } = req.body;

    if (!basket_id || !display_id || !price || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!baskets.has(basket_id)) {
        baskets.set(basket_id, []);
        seenTags.set(basket_id, new Set()); // ✅ Initialize seen tags
    }

    const basket = baskets.get(basket_id);
    const seen = seenTags.get(basket_id);

    if (seen.has(display_id)) {
        return res.status(200).json({ status: 'duplicate_ignored', message: 'Tag already added', items: basket });
    }

    basket.push({ display_id, price, quantity });
    seen.add(display_id); // ✅ Mark tag as seen

    res.json({ status: 'added', items: basket });
});

// View basket contents
app.get('/basket/view/:id', (req, res) => {
    const basket_id = req.params.id;
    const items = baskets.get(basket_id) || [];
    res.json({ items });
});

// Generate QR code for basket
app.get('/basket/qr/:id', async (req, res) => {
    const basket_id = req.params.id;
    const items = baskets.get(basket_id);

    if (!items || items.length === 0) {
        return res.status(404).json({ error: 'Basket not found or empty' });
    }

    const payload = { basket_id, items };

    try {
        const qr = await QRCode.toDataURL(JSON.stringify(payload));
        res.json({ qr });
    } catch (err) {
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// Checkout basket
app.post('/basket/checkout', (req, res) => {
    const basket_id = req.body.basket_id;
    const items = baskets.get(basket_id);

    if (!items || items.length === 0) {
        return res.status(404).json({ error: 'Basket not found or empty' });
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    baskets.set(basket_id, []);
    seenTags.set(basket_id, new Set()); // ✅ Reset seen tags after checkout
    basketIndex++;

    fs.appendFileSync('checkout.json', JSON.stringify({ basket_id, total }) + "\n");

    res.json({ status: 'checked out', basket_id, archived: true });
});

// View basket index
app.get('/baskets/index', (req, res) => {
    res.json({ index: basketIndex });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

