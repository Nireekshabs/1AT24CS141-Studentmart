const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

const router = express.Router();
const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET_MISSING");
  return jwt.verify(header.slice(7), process.env.JWT_SECRET);
}

router.post("/register", async (req, res) => {
  console.log("[AUTH] REGISTER request received");
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required." });
    if (name.length < 2 || name.length > 50) return res.status(400).json({ message: "Name must contain 2 to 50 characters." });
    if (!emailPattern.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
    if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must contain at least 6 characters." });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "This email is already registered. Please log in instead." });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
    console.log("[AUTH] REGISTER success for user id:", user._id.toString());
    return res.status(201).json({ message: "Registration successful. You can now log in." });
  } catch (error) {
    console.error("[AUTH] REGISTER error:", error.message);
    if (error.code === 11000) return res.status(409).json({ message: "This email is already registered." });
    return res.status(500).json({ message: "Registration failed. Check that MongoDB is connected." });
  }
});

router.post("/login", async (req, res) => {
  console.log("[AUTH] LOGIN route reached");
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
    if (!emailPattern.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
    if (!process.env.JWT_SECRET) {
      console.error("[AUTH] JWT_SECRET is missing in server/.env");
      return res.status(500).json({ message: "Server setup error: JWT_SECRET is missing." });
    }
    const user = await User.findOne({ email });
    console.log("[AUTH] Login email:", email, "| user found:", Boolean(user));
    if (!user) return res.status(401).json({ message: "No account was found for this email in the connected database. Register again on this database or check MONGO_URI." });
    if (user.isActive === false) return res.status(403).json({ message: "This account is inactive." });
    const matches = await bcrypt.compare(password, user.password);
    console.log("[AUTH] Password matches:", matches);
    if (!matches) return res.status(401).json({ message: "Password does not match this account. Register a new account or use the correct password." });
    const token = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    return res.json({
      message: "Login successful", token,
      user: {
        id: user._id, name: user.name, email: user.email, phone: user.phone,
        address: user.address, bio: user.bio, college: user.college, course: user.course,
        dateOfBirth: user.dateOfBirth, linkedin: user.linkedin, github: user.github,
        isActive: user.isActive, createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("[AUTH] LOGIN error:", error.message);
    return res.status(500).json({ message: "Login failed because of a server/database error. Check the backend terminal." });
  }
});

router.get("/profile", async (req, res) => {
  try {
    const decoded = requireToken(req);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.json({ user });
  } catch (error) {
    const status = error.message === "JWT_SECRET_MISSING" ? 500 : 401;
    return res.status(status).json({ message: error.message === "JWT_SECRET_MISSING" ? "Server setup error: JWT_SECRET is missing." : "Authentication failed. Please log in again." });
  }
});

router.put("/profile", async (req, res) => {
  console.log("========== PROFILE UPDATE ==========");
console.log("Request received");
console.log("Fields received:", Object.keys(req.body));
  try {
    const decoded = requireToken(req);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body.email);
    if (name.length < 2 || name.length > 50) return res.status(400).json({ message: "Name must contain 2 to 50 characters." });
    if (!emailPattern.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
    const duplicate = await User.findOne({ email, _id: { $ne: decoded.id } });
    if (duplicate) return res.status(409).json({ message: "That email is already used by another account." });
    const { phone = "", address = "", bio = "", college = "", course = "", dateOfBirth = null, linkedin = "", github = "" } = req.body;
    if (phone && !/^[0-9]{10}$/.test(phone)) return res.status(400).json({ message: "Phone number must contain exactly 10 digits." });
    if (linkedin && !linkedin.startsWith("https://")) return res.status(400).json({ message: "LinkedIn URL must start with https://." });
    if (github && !github.startsWith("https://")) return res.status(400).json({ message: "GitHub URL must start with https://." });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    Object.assign(user, { name, email, phone, address, bio, college, course, dateOfBirth: dateOfBirth || null, linkedin, github });
    await user.save();
    console.log("PROFILE SAVED SUCCESSFULLY");
console.log("User ID:", user._id.toString());
    const safeUser = user.toObject(); delete safeUser.password;
    return res.json({ message: "Profile updated successfully.", user: safeUser });
  } catch (error) {
    console.error("[AUTH] PROFILE UPDATE error:", error.message);
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.message === "AUTH_REQUIRED") return res.status(401).json({ message: "Authentication failed. Please log in again." });
    if (error.message === "JWT_SECRET_MISSING") return res.status(500).json({ message: "Server setup error: JWT_SECRET is missing." });
    return res.status(500).json({ message: "Could not update profile." });
  }
});

router.put("/change-password", async (req, res) => {
  try {
    const decoded = requireToken(req);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Both passwords are required." });
    if (typeof newPassword !== "string" || newPassword.length < 6) return res.status(400).json({ message: "New password must contain at least 6 characters." });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ message: "Current password is incorrect." });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("[AUTH] CHANGE PASSWORD error:", error.message);
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.message === "AUTH_REQUIRED") return res.status(401).json({ message: "Authentication failed. Please log in again." });
    return res.status(500).json({ message: "Could not change password." });
  }
});

module.exports = router;
