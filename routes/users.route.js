// routes/users.route.js
const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const verifyToken = require("../middlewares/verifyToken");
// তোমার MongoDB collections দরকার হলে import করে নিবে:
let usersCollection;

function setUsersCollection(collection) {
	usersCollection = collection;
}

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

router.get("/role/:email", verifyToken, async (req, res) => {
	try {
		const email = req.params.email;

		const user = await usersCollection.findOne({ email });

		if (!user) {
			return res.status(404).send({ success: false, message: "User not found" });
		}

		res.send({ success: true, role: user.role });
	} catch (error) {
		console.error("Error fetching user role:", error);
		res.status(500).send({ success: false, message: "Failed to fetch user role" });
	}
});

// POST - Create or Register user
router.post("/", async (req, res) => {
	try {
		const user = req.body;

		// 1. Check required fields
		if (!user?.email || !user?.name || !user?.image) {
			return res.status(400).send({ success: false, message: "Name, email, and image are required" });
		}

		// 2. Check if user already exists
		const existingUser = await usersCollection.findOne({ email: user.email });
		if (existingUser) {
			return res.send({
				success: false,
				existing: true,
				message: "User already exists",
				email: user.email,
			});
		}

		// 3. Add timestamp
		user.created_at = new Date().toISOString();
		user.last_login_time = req.body.last_login_time || new Date().toISOString();
		user.role = user.role || "customer"; // default role if not set

		// 4. Insert user
		const result = await usersCollection.insertOne(user);
		res.send({ success: true, insertedId: result.insertedId });
	} catch (error) {
		console.error("Error creating user:", error);
		res.status(500).send({ success: false, message: "Failed to create user" });
	}
});

router.patch("/:email", verifyToken, async (req, res) => {
	try {
		const email = req.params.email;
		const updateDoc = {
			$set: {
				last_login_time: req.body.last_login_time || new Date().toISOString(),
			},
		};

		const result = await usersCollection.updateOne({ email }, updateDoc);

		if (result.modifiedCount > 0) {
			res.send({ success: true, message: "Last login time updated" });
		} else {
			res.status(404).send({ success: false, message: "User not found or not updated" });
		}
	} catch (error) {
		console.error("Error updating login time:", error);
		res.status(500).send({ success: false, message: "Failed to update login time" });
	}
});

module.exports = { router, setUsersCollection };
