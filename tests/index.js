const { Schema, model } = require("mongoose");
const Client = require("../dist").CacheClient;

const cache = new Client({
	mongoURI: "mongodb://localhost:27017/dog-test",
});

console.log("Start cache...");

cache.on("debug", console.log);

const DogSchema = new Schema(
	{
		_id: String,
		isCute: Boolean,
	},
	{ versionKey: false, _id: false }
);

const Dog = model("Dog", DogSchema);

cache.model(Dog);
cache.init();

cache.on("ready", async (v) => {
	console.log("Cache is ready.");
	await cache.set("Dog", "dog-1", "isCute", "true");

	cache.get("Dog", "dog-1", "isCute").then(console.log);
});
