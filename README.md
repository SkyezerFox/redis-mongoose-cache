# redis-mongoose-cache - Thing for caching things with Redis and MongoDB

## Usage

```js
const Client = require("redis-mongoose-cache").CacheClient;

const cache = new Client({
	mongoURI: "mongodb://localhost:27017/dog-test",
});

cache.on("ready", (v) => console.log("Cache is ready."));
cache.on("debug", console.log);

const DogSchema = new Schema(
	{
		_id: String,
		name: String,
	},
);

const Dog = model("Dog", DogSchema);

cache.model(Dog);
cache.init();

cache.set("Dog", "dog-1", "isBarking", "true");

```
