const express = require("express");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const fast2sms = require("fast-two-sms");
const otplib = require("otplib");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const UserModel = require("./model/User");
const ProductModel = require("./model/Product");
const OrderModel = require("./model/Order");
const authenticateJWT = require("./middlewares/authenticateJWT");
const data = require("./data");
app.use(cors());
dotenv.config();

const app = express();
app.use(express.json());
app.use("/images", express.static("images"));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");

    ProductModel.findOne({ id: 1 })
      .then((existingProduct) => {
        if (!existingProduct) {
          ProductModel.insertMany(data.products)
            .then(() => {
              console.log("Product data successfully inserted!");
            })
            .catch((err) =>
              console.error("Error inserting product data:", err)
            );
        } else {
          console.log("Product data already exists.");
        }
      })
      .catch((err) =>
        console.error("Error checking existing product data:", err)
      );
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));

let otpStore = {};

const generateOTP = () => {
  const secret = otplib.authenticator.generateSecret();
  return otplib.authenticator.generate(secret);
};

const sendMessage = async (mobile, token) => {
  const options = {
    authorization: process.env.FAST2SMS_API_KEY,
    message: `Your OTP verification code is ${token}`,
    numbers: [mobile],
  };

  try {
    const response = await fast2sms.sendMessage(options);
    return { success: true, message: "OTP sent successfully!" };
  } catch (error) {
    console.error("Error sending OTP:", error);
    return { success: false, message: "Failed to send OTP." };
  }
};

const sendResponse = (res, status, message, data = {}) => {
  return res.status(status).json({ message, ...data });
};

app.post("/signup", async (req, res) => {
  const { name, email, password, phone } = req.body;

  try {
    if (!name || !email || !password || !phone) {
      return sendResponse(res, 400, "All fields are required");
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return sendResponse(res, 409, "Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserModel({
      name,
      email,
      password: hashedPassword,
      phone,
    });

    const savedUser = await newUser.save();

    const token = jwt.sign(
      { email: savedUser.email, id: savedUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const otp = generateOTP();
    otpStore[phone] = otp;

    const result = await sendMessage(phone, otp);

    if (result.success) {
      return sendResponse(
        res,
        201,
        "User registered successfully. OTP sent to the registered phone number.",
        {
          name: savedUser.name,
          email: savedUser.email,
          id: savedUser._id,
          otpSent: true,
          token,
        }
      );
    } else {
      return sendResponse(res, 500, "User registered, but failed to send OTP");
    }
  } catch (error) {
    return sendResponse(res, 500, error.message);
  }
});

app.post("/verify-otp", (req, res) => {
  const { mobileNumber, otp } = req.body;

  if (!otp || !mobileNumber) {
    return sendResponse(res, 400, "Mobile number and OTP are required.");
  }

  if (otpStore[mobileNumber] && otpStore[mobileNumber] === otp) {
    return sendResponse(res, 200, "OTP verified successfully!");
  } else {
    return sendResponse(res, 400, "Invalid OTP.");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password, otp, phone } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) {
      return sendResponse(res, 401, "No user found");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return sendResponse(res, 401, "Invalid password");
    }

    if (phone && otpStore[phone] !== otp) {
      return sendResponse(res, 400, "Invalid OTP");
    }

    const token = jwt.sign(
      { email: user.email, id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "90d" }
    );

    return sendResponse(res, 200, "Login successful", { token });
  } catch (error) {
    return sendResponse(res, 500, error.message);
  }
});

app.get("/products", async (req, res) => {
  try {
    const products = await ProductModel.find();
    if (!products.length) {
      return sendResponse(res, 404, "No products found");
    }
    return sendResponse(res, 200, "Products fetched successfully", {
      products,
    });
  } catch (error) {
    return sendResponse(res, 500, "Failed to fetch products");
  }
});

app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await ProductModel.findOne({ id });
    if (!product) {
      return sendResponse(res, 404, "Product not found");
    }
    return sendResponse(res, 200, "Product fetched successfully", { product });
  } catch (error) {
    return sendResponse(res, 500, "Failed to fetch product");
  }
});

app.post("/order", authenticateJWT, async (req, res) => {
  try {
    const { email } = req.user;
    const user = await UserModel.findOne({ email });

    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const { items } = req.body;

    if (!items || items.length === 0) {
      return sendResponse(res, 400, "Order must contain at least one item");
    }

    const order = new OrderModel({
      user: {
        id: user._id,
        email: user.email,
      },
      items,
    });

    await order.save();

    return sendResponse(res, 201, "Order created successfully", { order });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Server error");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
