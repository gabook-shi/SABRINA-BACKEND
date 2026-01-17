const express = require('express');
const app = express();
app.use(express.json());

// In-memory storage for basket data
let basketData = {};

// ESP32 sends data here
app.post('/updateBasket', (req, res) => {
  const { basket_id, tag_id, weight } = req.body;
  if (!basketData[basket_id]) basketData[basket_id] = [];
  basketData[basket_id].push({ tag_id, weight });
  res.json({ status: 'success' });
});

// WordPress fetches data here
app.get('/getBasket/:id', (req, res) => {
  const basket_id = req.params.id;
  res.json(basketData[basket_id] || []);
});

app.listen(3000, () => console.log('Server running on port 3000'));
