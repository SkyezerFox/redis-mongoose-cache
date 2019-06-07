import { Connection as MongooseConnection, createConnection, Model } from "mongoose";
import { ClientOpts as RedisClientOptions, createClient, RedisClient } from "redis";

interface CacheClientOptions {
	redisOptions?: RedisClientOptions;
	mongoURI: string;
}

/**
 * Class for creating a Redis/MongoDB cache
 */
export class CacheClient<ModelType extends string> {
	public options: CacheClientOptions;

	public models: Map<ModelType, Model<any>>;
	public modelNames: ModelType[];

	public ready: boolean;
	public redisStatus: boolean;
	public mongooseStatus: boolean;

	private redis?: RedisClient;
	private mongo?: MongooseConnection;

	constructor(options: CacheClientOptions) {
		this.options = options;

		this.models = new Map();
		this.modelNames = [];

		this.ready = false;
		this.redisStatus = false;
		this.mongooseStatus = false;
	}

	public init() {
		this.redis = createClient(this.options.redisOptions);
		this.mongo = createConnection();
		this.ready = true;
	}

	/**
	 * Gets a value from the cache
	 * @param {ModelType} type The name of the model to use when accessing MongoDB
	 * @param hash The hash field to use
	 * @param key The key to get from the field
	 */
	public get(
		type: ModelType,
		hash: string,
		key: string,
	): Promise<string | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type) === -1) {
				return reject(`Model "${type}" is unknown.`);
			}

			if (!this.redisStatus && !this.mongooseStatus) {
				reject("Client is not connected.");
			}
			let result = null;
			if (this.redisStatus) {
				result = await this.getFromRedis(hash, key);
			}

			if (!result) {
				if (!this.mongooseStatus) {
					reject("Cannot connect to Mongoose.");
				}
				result = await this.getFromMongoose(type, hash, key);

				resolve(result);
			}
		});
	}

	public getAll(type: ModelType, hash: string): Promise<object | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type) === -1) {
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

				resolve(result);
			}
		});
	}

	/**
	 * Sets a value in the cache
	 * @param {ModelType} type The name of the model to use when accessing MongoDB
	 * @param hash The hash field to use
	 * @param key The key to get from the field
	 * @param value The value to store
	 */
	public set(
		type: ModelType,
		hash: string,
		key: string,
		value: string,
	): Promise<boolean> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(type) === -1) {
				return reject(`Model "${type}" is unknown.`);
			}

			if (!this.redisStatus && !this.mongooseStatus) {
				reject("Client is not connected.");
			}

			if (this.redisStatus) {
				await this.setToRedis(hash, key, value);
			}

			if (!this.mongooseStatus) {
				reject("Cannot connect to Mongoose.");
			}
			resolve(await this.setMongoose(type, hash, key, value));
		});
	}

	// REDIS METHODS

	/**
	 * Gets a value from the Redis cache
	 * @param key Key to use
	 * @param field Field to grab
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
	 * @param key Key to get
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
	 * @param key Key to use
	 * @param field Field to modify
	 * @param value Value to set
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
	 * @param {ModelType} modelName The model to use
	 * @param {string} identifier Identifier to use
	 * @param {string} field Field to return
	 */
	private getFromMongoose(
		modelName: ModelType,
		identifier: string,
		field: string,
	): Promise<string | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.ready || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;
			const doc = await model.findOne({ _id: identifier });
			return resolve(doc[field] || null);
		});
	}

	/**
	 * Retrieves a document from MongoDB
	 * @param modelName The model to use
	 * @param identifier The identifier to use when saving the document
	 */
	private getAllFromMongoose(
		modelName: ModelType,
		identifier: string,
	): Promise<object | null> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.ready || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;
			const doc = await model.findOne({ _id: identifier });
			return resolve(doc);
		});
	}

	/**
	 *
	 * @param {ModelType} modelName Name of the model to use
	 * @param {string} identifier Identifier to use when saving the document
	 * @param {string} field The field to set
	 * @param {string} value The value to set the field to
	 */
	private setMongoose(
		modelName: ModelType,
		identifier: string,
		field: string,
		value: string,
	): Promise<boolean> {
		return new Promise(async (resolve, reject) => {
			if (this.modelNames.indexOf(modelName) === -1) {
				throw Error(`Model "${modelName}" is unknown.`);
			}
			if (!this.ready || !this.mongo) {
				return reject("Not connected.");
			}

			const model = this.models.get(modelName) as Model<any>;

			model.updateOne(
				{ _id: identifier },
				{ [field]: value },
				{ upsert: true },
				(err) => {
					if (err) {
						reject(err);
					} else {
						resolve(true);
					}
				},
			);
		});
	}
}
