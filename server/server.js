const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const authRoutes = require("./routes/authroutes");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

let databaseStatus = "disconnected";
app.get("/api/health", (req, res) => {
  res.json({ server: "running", database: databaseStatus, databaseName: mongoose.connection.name || null });
});
app.use("/api/auth", authRoutes);

const PORT = Number(process.env.PORT || 5000);
async function start() {
  if (!process.env.MONGO_URI) {
    console.error("ERROR: MONGO_URI is missing. Create server/.env using server/.env.example.");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("ERROR: JWT_SECRET is missing. Create server/.env using server/.env.example.");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    databaseStatus = "connected";
    console.log("MongoDB connected. Database:", mongoose.connection.name);
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  } catch (error) {
    databaseStatus = "disconnected";
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}
start();
