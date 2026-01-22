// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory basket storage
let basketData = {};
// In-memory archive
let basketArchive = {};

// Update basket (add or update item)
app.post('/updateBasket', (req, res) => {
  const { basket_id, display_id, price, quantity } = req.body;

  if (!basket_id || !display_id || !price || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!basketData[basket_id]) {
    basketData[basket_id] = [];
  }

  // Check if item already exists
  const existingItem = basketData[basket_id].find(item => item.display_id === display_id);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    basketData[basket_id].push({ display_id, price, quantity });
  }

  res.json({ status: 'updated', basket: basketData[basket_id] });
});

// Get basket contents
app.get('/getbasket/:id', (req, res) => {
  const basket_id = req.params.id;
  const items = basketData[basket_id] || [];
  res.json({ items });
});


// Checkout basket: archive + reset
app.post('/checkoutBasket/:id', (req, res) => {
  const basket_id = req.params.id;
  if (basketData[basket_id]) {
    const logEntry = {
      basket_id,
      items: basketData[basket_id],
      total: basketData[basket_id].reduce((sum, item) => sum + item.price * item.quantity, 0),
      timestamp: new Date().toISOString()
    };

    // Archive in memory
    basketArchive[basket_id] = logEntry;

    // Append to file (demo persistence)
    fs.appendFileSync('basketLogs.json', JSON.stringify(logEntry) + "\n");

    // Reset basket
    basketData[basket_id] = [];

    res.json({ status: 'checked out', basket_id, archived: true });
  } else {
    res.status(404).json({ error: 'Basket not found' });
  }
});

// Get archived baskets (optional route for viewing logs)
app.get('/archivedBaskets', (req, res) => {
  res.json(basketArchive);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
