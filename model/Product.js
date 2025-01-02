const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  id: Number,
  ProductPicture: String,
  Name: String,
  ProductName: String,
  ModelNumber: String,
  Quantity: String,
  Size: String,
  OnlinePrice: { type: String, default: null },
  Price: Number,
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
