const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

const baskets = new Map();
let basketIndex = 0;

// Add or update item in basket
app.post('/basket/add', (req, res) => {
    const { basket_id, display_id, price, quantity } = req.body;

    if (!display_id || !price || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!baskets.has(basket_id)) {
        baskets.set(basket_id, []);
    }

    const basket = baskets.get(basket_id);
    const existingItem = basket.find(item => item.display_id === display_id);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        basket.push({ display_id, price, quantity });
    }

    res.json({ status: 'updated', items: baskets.get(basket_id) });
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
    const items = baskets.get(basket_id) || [];
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
    const items = baskets.get(basket_id) || [];

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    baskets.set(basket_id, []);
    basketIndex++;

    fs.appendFileSync('checkout.json', JSON.stringify({ basket_id, total }) + "\n");

    if (!items.length) {
        return res.status(404).json({ error: 'Basket not found' });
    }

    res.json({ status: 'checked out', basket_id, archived: true });
});

// View basket index
app.get('/baskets/index', (req, res) => {
    res.json({ index: basketIndex });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
