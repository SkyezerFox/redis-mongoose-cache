# redis-mongoose-cache - Thing for caching things with Redis and MongoDB

## Usage

### Quick Start

```js
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

cache.set("Dog", "dog-1", "isBarking", true);
```

### Adding Models
Adding a model to the cache enables it to use it to save, update, and retrieve documents from MongoDB.
```js
const { Schema, model } = require("mongoose");

const DogSchema = new Schema(
	{
		_id: String,
        name: String,
        isBarking: Boolean,
	},
);

const CatSchema = new Schema(
	{
		_id: String,
        name: String,
        isMeowing: Boolean,
	},
);

const FishSchema = new Schema(
	{
		_id: String,
        name: String,
        isBeingEatenByCat: Boolean,
	},
);

const Dog = model("Dog", DogSchema),
    Cat = model("Cat", CatSchema),
    Fish = model("Fish", FishSchema);

cache.model(Dog, Cat, Fish);

```

### Cache Methods
- `get` - Retrieve a value from the cache/database
  
  ```ts
  cache.get(modelName: string, key: string, field: string): Promise<any>
  ```

- `getAll` - Get all fields under a key in object form

  ```ts
  cache.getAll(modelName: string, key: string): Promise<object>
  ```

- `set` - Set a value to the cache

  ```ts
  cache.set(modelName: string, key: string, field: string, value: any): Promise<boolean>
  ```

**get**

```js
cache.get("Dog", "1234", "name")

// Example Response: "Sir Woofalot The 3rd"
```

**getAll**

```js
cache.getAll("Dog", "1234")

/* Example Response: { 
    name: "Sir Woofalot The Third", 
    isBarking: false
} */
```

**set**
```js
cache.set("Dog", "1234", "isBarking", true);
```