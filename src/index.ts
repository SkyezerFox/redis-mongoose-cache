import { EventEmitter } from "events";
import {
	connect,
	connection,
	Connection as MongooseConnection,
	Document,
	Model,
} from "mongoose";
import {
	ClientOpts as RedisClientOptions,
	createClient,
	RedisClient,
} from "redis";

interface CacheClientOptions {
	redisOptions?: RedisClientOptions;
	mongoURI: string;
}

/**
 * Class for creating a Redis/MongoDB cache
 */
export class CacheClient<
	Models extends {
		[x: string]: { [x: string]: any };
	}
> extends EventEmitter {
	public options: CacheClientOptions;

	public models: Map<keyof Models, Model<any>>;
	public modelNames: string[];

	public ready: boolean;
	public redisStatus: boolean;
	public mongooseStatus: boolean;

	private redis?: RedisClient;
	private mongo?: MongooseConnection;

	constructor(options: CacheClientOptions) {
		super();
		this.options = options;

		this.models = new Map();
		this.modelNames = [];

		this.ready = false;
		this.redisStatus = false;
		this.mongooseStatus = false;
	}

	/**
	 * @fires ready
	 */
	public init(): Promise<void> {
		this.redis = createClient(this.options.redisOptions);

		connect(
			this.options.mongoURI,
			{
				useNewUrlParser: true,
			},
		);

		this.mongo = connection;

		this.redis.on("error", (err) =>
			this.emit("error", `[error][redis] ${err}`),
		);

		this.redis.on("message", (ch, msg) =>
			this.emit("debug", `[cache] [redis] ${ch} ${msg}`),
		);

		return new Promise((resolve, reject) => {
			if (!this.redis || !this.mongo) {
				return reject();
			}
			this.redis.once("ready", () => {
				this.redisStatus = true;
				if (this.mongooseStatus) {
					this.ready = true;
					this.emit("ready");
					resolve();
				}
			});

			this.mongo.once("open", () => {
				this.mongooseStatus = true;
				if (this.redisStatus) {
					this.ready = true;
					this.emit("ready");
					resolve();
				}
			});
		});
	}

	/**
	 * Makes a Mongoose model usable by the cacher
	 * @param {Array<Model<any>>} models Models to add to the cacher
	 * @returns {CacheClient} CacheClient
	 */
	public model(...models: Array<Model<any>>): this {
		models.forEach((model) => {
			this.models.set(model.modelName, model);
			this.modelNames.push(model.modelName);
		});

		this.emit("debug", `[cache] added ${models.length} models`);

		return this;
	}

	// CACHE METHODS

	/**
	 * Gets a value from the cache
	 * @param {Models} type The name of the model to use when accessing MongoDB
	 * @param {string} hash The hash field to use
	 * @param {string} key The key to get from the field
	 */
	public get<M extends keyof Models, K extends keyof Models[M]>(
		type: M,
		hash: string,
		key: K,
	): Promise<any | null> {
		const start = Date.now();
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type as string) === -1) {
				return reject(`Model "${type}" is unknown.`);
			}

			if (!this.redisStatus && !this.mongooseStatus) {
				reject("Client is not connected.");
			}
			let result = null;
			if (this.redisStatus) {
				result = await this.getFromRedis(hash, key as string);
			}

			if (!result) {
				if (!this.mongooseStatus) {
					reject("Cannot connect to Mongoose.");
				}

				result = await this.getFromMongoose(
					type as string,
					hash,
					key as string,
				);

				if (result) {
					this.setToRedis(
						hash,
						key as string,
						this.stringify(result),
					);
				}
			} else {
				result = this.parse(result);
			}

			resolve(result);
			this.emit(
				"debug",
				`[cache][query][get] ${
					result ? "SUCCESS" : "NO RESULT"
				} ${type} ${hash} ${key}, ${Date.now() - start}ms`,
			);
		});
	}

	/**
	 * Gets all keys from a hash
	 * @param {keyof Models} type
	 * @param {string} hash
	 */
	public getAll<M extends keyof Models>(
		type: M,
		hash: string,
	): Promise<object | null> {
		const start = Date.now();
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type as string) === -1) {
				return reject(`Model "${type}" is unknown.`);
			}

			if (!this.redisStatus && !this.mongooseStatus) {
				reject("Client is not connected.");
			}
			let result = null;
			if (this.redisStatus) {
				result = await this.getAllFromRedis(hash);
			}

			if (!result) {
				if (!this.mongooseStatus) {
					reject("Cannot connect to Mongoose.");
				}
				result = await this.getAllFromMongoose(type, hash);
			} else {
				result = this.parse(result as { [x: string]: string });
			}

			resolve(result);
			this.emit(
				"debug",
				`[cache][query][getAll] ${
					result ? "SUCCESS" : "NO RESULT"
				} ${type} ${hash}, ${Date.now() - start}ms`,
			);
		});
	}

	/**
	 * Sets a value in the cache
	 * @param {keyof Models} type The name of the model to use when accessing MongoDB
	 * @param {string} hash The hash field to use
	 * @param {string} key The key to get from the field
	 * @param {string} value The value to store
	 */
	public set<
		M extends keyof Models,
		K extends keyof Models[M],
		V extends Models[M][K]
	>(type: M, hash: string, key: K, value: V): Promise<boolean> {
		const start = Date.now();
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type as string) === -1) {
				return reject(`Model "${type}" is unknown.`);
			}

			if (!this.redisStatus && !this.mongooseStatus) {
				reject("Client is not connected.");
			}

			if (this.redisStatus) {
				await this.setToRedis(
					hash,
					key as string,
					this.stringify(value),
				);
			}

			if (!this.mongooseStatus) {
				reject("Cannot connect to Mongoose.");
			}
			const result = await this.setMongoose(
				type,
				hash,
				key as string,
				value,
			);
			resolve(result);
			this.emit(
				"debug",
				`[cache][query][set] ${
					result ? "SUCCESS" : "NO RESULT"
				} ${type} ${hash}, ${Date.now() - start}ms`,
			);
		});
	}

	// REDIS METHODS

	/**
	 * Gets a value from the Redis cache
	 * @param {string} key Key to use
	 * @param {string} field Field to grab
	 */
	private getFromRedis(key: string, field: string): Promise<string | null> {
		return new Promise((resolve, reject) => {
			if (!this.ready || !this.redis) {
				return reject("Not connected.");
			}
			this.redis.hget(key, field, (err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		});
	}

	/**
	 * Gets all values of a key
	 * @param {string} key Key to get
	 */
	private getAllFromRedis(key: string): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!this.ready || !this.redis) {
				return reject("Not connected.");
			}
			this.redis.hgetall(key, (err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		});
	}

	/**
	 * Sets a value in the Redis cache
	 * @param {string} key Key to use
	 * @param {string} field Field to modify
	 * @param {string} value Value to set
	 */
	private setToRedis(
		key: string,
		field: string,
		value: string,
	): Promise<boolean> {
		return new Promise((resolve, reject) => {
			if (!this.ready || !this.redis) {
				return reject("Not connected.");
			}
			this.redis.hset(key, field, value, (err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve(true);
				}
			});
		});
	}

	// MONGOOSE METHODS

	/**
	 * Gets a value from MongoDB
	 * @param {Models} modelName The model to use
	 * @param {string} identifier Identifier to use
	 * @param {string} field Field to return
	 */
	private getFromMongoose(
		modelName: keyof Models,
		identifier: string,
		field: string,
	): Promise<string | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName as string) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.ready || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;
			const doc = await model.findOne({ _id: identifier });
			return resolve(doc ? (doc[field] ? doc[field] : null) : null);
		});
	}

	/**
	 * Retrieves a document from MongoDB
	 * @param {ModelName} modelName The model to use
	 * @param {string} identifier The identifier to use when saving the document
	 */
	private getAllFromMongoose(
		modelName: keyof Models,
		identifier: string,
	): Promise<object | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName as string) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.mongooseStatus || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;
			const doc = (await model.findOne({ _id: identifier })) as Document;
			return resolve(doc);
		});
	}

	/**
	 *
	 * @param {Models} modelName Name of the model to use
	 * @param {string} identifier Identifier to use when saving the document
	 * @param {string} field The field to set
	 * @param {string} value The value to set the field to
	 */
	private setMongoose(
		modelName: keyof Models,
		identifier: string,
		field: string,
		value: string,
	): Promise<boolean> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName as string) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.mongooseStatus || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;
			this.mongooseCastCheck(model, field, value);

			await model.updateOne(
				{ _id: identifier },
				{ [field]: this.parse(value) },
				{ upsert: true },
			);
			resolve(true);
		});
	}

	private mongooseCastCheck(
		model: Model<any>,
		fieldName: string,
		value: any,
	) {
		if (!model.schema.path(fieldName)) {
			throw Error(
				`Schema for model ${
					model.modelName
				} does not have a definition for the field "${fieldName}".`,
			);
		}

		value = this.parse(value);

		if (
			typeof value !==
			// @ts-ignore
			model.schema.path(fieldName).instance.toLowerCase()
		) {
			throw Error(
				`Value ${value} is not of the type "${model.schema
					.path(fieldName)
					// @ts-ignore
					.instance.toLowerCase()}" required by the field "${fieldName}" on the model "${
					model.modelName
				}".`,
			);
		}
	}

	private stringify(data: any) {
		if (typeof data === "string") {
			return data;
		}

		return JSON.parse(data);
	}

	private parse(data: string | { [x: string]: string }) {
		if (typeof data === "string") {
			try {
				return JSON.parse(data);
			} catch (err) {
				return data;
			}
		}

		const values: string[] = [];
		Object.keys(data).map((v) => (values[v as any] = this.parse(data[v])));
		return values;
	}
}

/**
 * Emitted when the Cacher is ready
 * @event CacheClient#ready
 * @type {object}
 */

/**
 * Emitted for debug logging purposes
 * @event CacheClient#debug
 * @type {object}
 * @param {string} message Debug message
 */
