const { Schema, model } = require("mongoose");
const Client = require("../dist").CacheClient;

const cache = new Client({
	mongoURI: "mongodb://localhost:27017/dog-test",
});

console.log("Init cache");

cache.on("ready", (v) => console.log("Cache is ready."));
cache.on("debug", console.log);

const DogSchema = new Schema(
	{
		_id: String,
		name: String,
	},
	{ versionKey: false, _id: false }
);

const Dog = model("Dog", DogSchema);

cache.model(Dog);
cache.init();

cache.set("Dog", "dog-1", "isBarking", "true");
