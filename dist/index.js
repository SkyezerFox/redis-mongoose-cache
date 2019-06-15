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
    init() {
        this.redis = redis_1.createClient(this.options.redisOptions);
        this.mongo = mongoose_1.createConnection(this.options.mongoURI, {
            useNewUrlParser: true,
        });
        this.redis.on("error", (err) => this.emit("error", `[error][redis] ${err}`));
        this.redis.on("message", (ch, msg) => this.emit("debug", `[cache] [redis] ${ch} ${msg}`));
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
    model(...models) {
        this.once("ready", () => {
            if (!this.mongo) {
                throw Error("Ready event emmitted but cache not ready!");
            }
            models.forEach((model) => {
                if (!this.mongo) {
                    throw Error("Ready event emmitted but cache not ready!");
                }
                this.models.set(model.modelName, this.mongo.model(model.modelName, model.schema));
                this.modelNames.push(model.modelName);
            });
            this.emit("debug", `[cache] added ${models.length} models`);
        });
        return this;
    }
    // CACHE METHODS
    /**
     * Gets a value from the cache
     * @param {Models} type The name of the model to use when accessing MongoDB
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
            if (!key) {
                return this.getAll(type, hash);
            }
            if (this.redisStatus) {
                result = await this.getFromRedis(hash, key);
            }
            if (!result) {
                if (!this.mongooseStatus) {
                    reject("Cannot connect to Mongoose.");
                }
                result = await this.getFromMongoose(type, hash, key);
                if (result) {
                    this.setToRedis(hash, key, this.stringify(result));
                }
            }
            else {
                result = this.parse(result);
            }
            resolve(result);
            this.emit("debug", `[cache][query][get] ${result ? "SUCCESS" : "NO RESULT"} ${type} ${hash} ${key}, ${Date.now() - start}ms`);
        });
    }
    /**
     * Gets all keys from a hash
     * @param {keyof Models} type Model to use
     * @param {string} hash Hash
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
            }
            else {
                result = this.parse(result);
            }
            resolve(result);
            this.emit("debug", `[cache][query][getAll] ${result ? "SUCCESS" : "NO RESULT"} ${type} ${hash}, ${Date.now() - start}ms`);
        });
    }
    /**
     * Sets a value in the cache
     * @param {keyof Models} type The name of the model to use when accessing MongoDB
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
                await this.setToRedis(hash, key, this.stringify(value));
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
     * @param {Models} modelName The model to use
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
            return resolve(doc ? (doc[field] ? doc[field] : null) : null);
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
            if (!this.mongooseStatus || !this.mongo) {
                return reject("Not connected.");
            }
            const model = this.models.get(modelName);
            const doc = (await model.findOne({ _id: identifier }));
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
    setMongoose(modelName, identifier, field, value) {
        return new Promise(async (resolve, reject) => {
            if (this.modelNames.indexOf(modelName) === -1) {
                throw Error(`Model "${modelName}" is unknown.`);
            }
            if (!this.mongooseStatus || !this.mongo) {
                return reject("Not connected.");
            }
            const model = this.models.get(modelName);
            this.mongooseCastCheck(model, field, value);
            await model.updateOne({ _id: identifier }, { [field]: this.parse(value) }, { upsert: true });
            resolve(true);
        });
    }
    mongooseCastCheck(model, fieldName, value) {
        if (!model.schema.path(fieldName)) {
            throw Error(`Schema for model ${model.modelName} does not have a definition for the field "${fieldName}".`);
        }
        value = this.parse(value);
        if (typeof value !==
            // @ts-ignore
            model.schema.path(fieldName).instance.toLowerCase()) {
            throw Error(`Value ${value} is not of the type "${model.schema
                .path(fieldName)
                // @ts-ignore
                .instance.toLowerCase()}" required by the field "${fieldName}" on the model "${model.modelName}".`);
        }
    }
    stringify(data) {
        if (typeof data === "string") {
            return data;
        }
        return JSON.parse(data);
    }
    parse(data) {
        if (typeof data === "string") {
            try {
                return JSON.parse(data);
            }
            catch (err) {
                return data;
            }
        }
        const values = [];
        Object.keys(data).map((v) => (values[v] = this.parse(data[v])));
        return values;
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
