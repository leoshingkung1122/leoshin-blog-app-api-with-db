const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/profiles', (req, res) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

module.exports = app;
