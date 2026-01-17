const express = require('express');
const cors = require('cors'); // ✅ Add this line
const app = express();

app.use(cors()); // ✅ Enable CORS for all origins
app.use(express.json());

// In-memory storage for basket data
let basketData = {};

app.post('/updateBasket', (req, res) => {
    const { basket_id, display_id, price, quantity } = req.body;
    if (!basketData[basket_id]) basketData[basket_id] = [];
    basketData[basket_id].push({ display_id, price, quantity });
    res.json({ status: 'success' });
});

app.get('/getBasket/:id', (req, res) => {
    const basket_id = req.params.id;
    res.json(basketData[basket_id] || []);
});

app.listen(3000, () => console.log('Server running on port 3000'));
