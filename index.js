require("dotenv").config();
const express = require("express");

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 3000;
const app = express();
// middleware
const corsOptions = {
	origin: ["http://localhost:5173", "http://localhost:5174"],
	credentials: true,
	optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

const verifyToken = async (req, res, next) => {
	const token = req.cookies?.token;

	if (!token) {
		return res.status(401).send({ message: "unauthorized access" });
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			console.log(err);
			return res.status(401).send({ message: "unauthorized access" });
		}
		req.user = decoded;
		next();
	});
};
// console.log("JWT_SECRET:", process.env.ACCESS_TOKEN_SECRET);
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

const { router: usersRoute, setUsersCollection } = require("./routes/users.route");

async function run() {
	try {
		const db = client.db("phc_plantnet");
		const plantsCollection = db.collection("plants");
		const ordersCollection = db.collection("orders");
		const usersCollection = db.collection("users");

		setUsersCollection(usersCollection);
		app.use("/users", usersRoute);

		app.post("/plants", async (req, res) => {
			try {
				const plant = req.body;

				// Validation (optional)
				if (!plant.name || !plant.image) {
					return res.status(400).json({ message: "Missing required fields" });
				}

				const result = await plantsCollection.insertOne(plant);
				res.send({ success: true, insertedId: result.insertedId });
			} catch (error) {
				console.error(error);
				res.status(500).json({ success: false, message: "Server error" });
			}
		});
		app.get("/plants", async (req, res) => {
			try {
				const result = await plantsCollection.find().toArray();
				res.send(result);
			} catch (error) {
				console.error("Error fetching plants:", error);
				res.status(500).send({ success: false, message: "Failed to fetch plants" });
			}
		});
		app.get("/plants/:id", async (req, res) => {
			try {
				const id = req.params.id;

				// ID validate করা দরকার (MongoDB ObjectId হতে হবে)
				if (!ObjectId.isValid(id)) {
					return res.status(400).send({ message: "Invalid plant ID" });
				}

				const plant = await plantsCollection.findOne({ _id: new ObjectId(id) });

				if (!plant) {
					return res.status(404).send({ message: "Plant not found" });
				}

				res.send(plant);
			} catch (error) {
				console.error("Error fetching plant by ID:", error);
				res.status(500).send({ message: "Failed to fetch plant" });
			}
		});
		//
		// stripe payment
		app.post("/create-payment-intent", async (req, res) => {
			try {
				const { plantId, quantity } = req.body;

				if (!plantId || !quantity) {
					return res.status(400).json({ message: "Plant ID and quantity are required" });
				}

				// validate ObjectId
				if (!ObjectId.isValid(plantId)) {
					return res.status(400).json({ message: "Invalid plant ID" });
				}

				// get plant from database
				const plant = await plantsCollection.findOne({ _id: new ObjectId(plantId) });

				if (!plant) {
					return res.status(404).json({ message: "Plant not found" });
				}

				// check stock
				if (quantity > parseInt(plant.quantity)) {
					return res.status(400).json({ message: "Quantity exceeds available stock" });
				}

				// total price calculation
				const totalPrice = parseInt(plant.price) * parseInt(quantity);
				const amount = totalPrice * 100; // cents

				// create payment intent
				const paymentIntent = await stripe.paymentIntents.create({
					amount,
					currency: "usd",
					payment_method_types: ["card"],
					metadata: {
						plantId: plantId,
						quantity: quantity.toString(),
					},
				});

				res.send({
					clientSecret: paymentIntent.client_secret,
					amount: totalPrice,
					plantName: plant.name,
				});
			} catch (error) {
				console.error("Payment Intent Error:", error);
				res.status(500).json({ message: "Failed to create payment intent" });
			}
		});

		app.post("/orders", verifyToken, async (req, res) => {
			try {
				const orderData = req.body;

				if (!orderData.email || !orderData.plantId || !orderData.transactionId) {
					return res.status(400).send({ success: false, message: "Missing required fields" });
				}

				const plant = await plantsCollection.findOne({ _id: new ObjectId(orderData.plantId) });

				if (!plant) {
					return res.status(404).send({ success: false, message: "Plant not found" });
				}

				if (parseInt(orderData.quantity) > parseInt(plant.quantity)) {
					return res.status(400).send({ success: false, message: "Not enough stock" });
				}

				// ✅ order insert
				orderData.created_at = new Date().toISOString();
				const result = await ordersCollection.insertOne(orderData);

				// ✅ quantity update
				const updated = await plantsCollection.updateOne(
					{ _id: new ObjectId(orderData.plantId) },
					{ $inc: { quantity: -parseInt(orderData.quantity) } }
				);

				res.send({ success: true, insertedId: result.insertedId });
			} catch (error) {
				console.error("Error saving order:", error);
				res.status(500).send({ success: false, message: "Failed to save order" });
			}
		});

		// stripe payment
		//

		//
		//
		//
		// Generate jwt token
		app.post("/jwt", async (req, res) => {
			const email = req.body;
			const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "365d",
			});
			res
				.cookie("token", token, {
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
				})
				.send({ success: true });
		});
		// Logout
		app.get("/logout", async (req, res) => {
			try {
				res
					.clearCookie("token", {
						maxAge: 0,
						secure: process.env.NODE_ENV === "production",
						sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
					})
					.send({ success: true });
			} catch (err) {
				res.status(500).send(err);
			}
		});
		//
		//
		//

		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// Ensures that the client will close when you finish/error
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("Hello from plantNet Server..");
});

app.listen(port, () => {
	console.log(`plantNet is running on port ${port}`);
});
