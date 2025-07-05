// routes/users.route.js
const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");

// তোমার MongoDB collections দরকার হলে import করে নিবে:
let usersCollection;

function setUsersCollection(collection) {
	usersCollection = collection;
}

// POST - Create or Register user
router.post("/", async (req, res) => {
	try {
		const user = req.body;
		if (!user.email) {
			return res.status(400).send({ success: false, message: "Email is required" });
		}
		user.created_at = new Date().toISOString();

		const result = await usersCollection.insertOne(user);
		res.send({ success: true, insertedId: result.insertedId });
	} catch (error) {
		console.error("Error creating user:", error);
		res.status(500).send({ success: false, message: "Failed to create user" });
	}
});

// GET all users (optional)
router.get("/", async (req, res) => {
	try {
		const users = await usersCollection.find().toArray();
		res.send(users);
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).send({ message: "Failed to fetch users" });
	}
});

module.exports = { router, setUsersCollection };
