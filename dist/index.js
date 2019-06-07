"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const mongoose_1 = require("mongoose");
const redis_1 = require("redis");
/**
 * Class for creating a Redis/MongoDB cache
 */
class CacheClient extends events_1.EventEmitter {
    constructor(options) {
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
    async init() {
        this.redis = redis_1.createClient(this.options.redisOptions);
        this.mongo = mongoose_1.createConnection(this.options.mongoURI, {
            useNewUrlParser: true,
        });
        this.redis.on("error", (err) => this.emit("error", `[error][redis] ${err}`));
        this.redis.on("message", (ch, msg) => this.emit("debug", `[cache] [redis] ${ch} ${msg}`));
        this.mongooseStatus = true;
        this.redisStatus = true;
        this.ready = true;
        this.emit("ready");
    }
    /**
     * Makes a Mongoose model usable by the cacher
     * @param {Array<Model<any>>} models Models to add to the cacher
     * @returns {CacheClient} CacheClient
     */
    model(...models) {
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
     * @param {ModelType} type The name of the model to use when accessing MongoDB
     * @param {string} hash The hash field to use
     * @param {string} key The key to get from the field
     */
    get(type, hash, key) {
        const start = Date.now();
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
                this.emit("debug", `[cache][query][get] ${result ? "SUCCESS" : "NO RESULT"} ${type} ${hash} ${key}, ${Date.now() - start}ms`);
            }
        });
    }
    /**
     * Gets all keys from a hash
     * @param {ModelType} type
     * @param {string} hash
     */
    getAll(type, hash) {
        const start = Date.now();
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
                this.emit("debug", `[cache][query][getAll] ${result ? "SUCCESS" : "NO RESULT"} ${type} ${hash}, ${Date.now() - start}ms`);
            }
        });
    }
    /**
     * Sets a value in the cache
     * @param {ModelType} type The name of the model to use when accessing MongoDB
     * @param {string} hash The hash field to use
     * @param {string} key The key to get from the field
     * @param {string} value The value to store
     */
    set(type, hash, key, value) {
        const start = Date.now();
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
            const result = await this.setMongoose(type, hash, key, value);
            resolve(result);
            this.emit("debug", `[cache][query][set] ${result ? "SUCCESS" : "NO RESULT"} ${type} ${hash}, ${Date.now() - start}ms`);
        });
    }
    // REDIS METHODS
    /**
     * Gets a value from the Redis cache
     * @param {string} key Key to use
     * @param {string} field Field to grab
     */
    getFromRedis(key, field) {
        return new Promise((resolve, reject) => {
            if (!this.ready || !this.redis) {
                return reject("Not connected.");
            }
            this.redis.hget(key, field, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * Gets all values of a key
     * @param {string} key Key to get
     */
    getAllFromRedis(key) {
        return new Promise((resolve, reject) => {
            if (!this.ready || !this.redis) {
                return reject("Not connected.");
            }
            this.redis.hgetall(key, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
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
    setToRedis(key, field, value) {
        return new Promise((resolve, reject) => {
            if (!this.ready || !this.redis) {
                return reject("Not connected.");
            }
            this.redis.hset(key, field, value, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
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
    getFromMongoose(modelName, identifier, field) {
        return new Promise(async (resolve, reject) => {
            if (this.modelNames.indexOf(modelName) === -1) {
                throw Error(`Model "${modelName}" is unknown.`);
            }
            if (!this.ready || !this.mongo) {
                return reject("Not connected.");
            }
            const model = this.models.get(modelName);
            const doc = await model.findOne({ _id: identifier });
            return resolve(doc[field] || null);
        });
    }
    /**
     * Retrieves a document from MongoDB
     * @param {ModelName} modelName The model to use
     * @param {string} identifier The identifier to use when saving the document
     */
    getAllFromMongoose(modelName, identifier) {
        return new Promise(async (resolve, reject) => {
            if (this.modelNames.indexOf(modelName) === -1) {
                throw Error(`Model "${modelName}" is unknown.`);
            }
            if (!this.ready || !this.mongo) {
                return reject("Not connected.");
            }
            const model = this.models.get(modelName);
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
    setMongoose(modelName, identifier, field, value) {
        return new Promise(async (resolve, reject) => {
            if (this.modelNames.indexOf(modelName) === -1) {
                throw Error(`Model "${modelName}" is unknown.`);
            }
            if (!this.ready || !this.mongo) {
                return reject("Not connected.");
            }
            const model = this.models.get(modelName);
            model.updateOne({ _id: identifier }, { [field]: value }, { upsert: true }, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
}
exports.CacheClient = CacheClient;
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
