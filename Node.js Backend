const express = require('express');
const app = express();
app.use(express.json());

app.post('/updateBasket', (req, res) => {
  const { basket_id, tag_id, weight } = req.body;
  console.log(`Basket: ${basket_id}, Tag: ${tag_id}, Weight: ${weight}`);
  res.json({ status: 'success' });
});

app.listen(3000, () => console.log('Server running on port 3000'));
