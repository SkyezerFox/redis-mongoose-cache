import { EventEmitter } from "events";
import { Model } from "mongoose";
import { ClientOpts as RedisClientOptions } from "redis";
interface CacheClientOptions {
    redisOptions?: RedisClientOptions;
    mongoURI: string;
}
/**
 * Class for creating a Redis/MongoDB cache
 */
export declare class CacheClient<Models extends {
    [x: string]: {
        [x: string]: any;
    };
}> extends EventEmitter {
    options: CacheClientOptions;
    models: Map<keyof Models, Model<any>>;
    modelNames: string[];
    ready: boolean;
    redisStatus: boolean;
    mongooseStatus: boolean;
    private redis?;
    private mongo?;
    constructor(options: CacheClientOptions);
    /**
     * @fires ready
     */
    init(): Promise<void>;
    /**
     * Makes a Mongoose model usable by the cacher
     * @param {Array<Model<any>>} models Models to add to the cacher
     * @returns {CacheClient} CacheClient
     */
    model(...models: Array<Model<any>>): this;
    /**
     * Gets a value from the cache
     * @param {Models} type The name of the model to use when accessing MongoDB
     * @param {string} hash The hash field to use
     * @param {string} key The key to get from the field
     */
    get<M extends keyof Models, K extends keyof Models[M]>(type: M, hash: string, key: K): Promise<any | null>;
    /**
     * Gets all keys from a hash
     * @param {keyof Models} type Model to use
     * @param {string} hash Hash
     */
    getAll<M extends keyof Models>(type: M, hash: string): Promise<Models[M] | null>;
    /**
     * Sets a value in the cache
     * @param {keyof Models} type The name of the model to use when accessing MongoDB
     * @param {string} hash The hash field to use
     * @param {string} key The key to get from the field
     * @param {string} value The value to store
     */
    set<M extends keyof Models, K extends keyof Models[M], V extends Models[M][K]>(type: M, hash: string, key: K, value: V): Promise<boolean>;
    /**
     * Gets a value from the Redis cache
     * @param {string} key Key to use
     * @param {string} field Field to grab
     */
    private getFromRedis;
    /**
     * Gets all values of a key
     * @param {string} key Key to get
     */
    private getAllFromRedis;
    /**
     * Sets a value in the Redis cache
     * @param {string} key Key to use
     * @param {string} field Field to modify
     * @param {string} value Value to set
     */
    private setToRedis;
    /**
     * Gets a value from MongoDB
     * @param {Models} modelName The model to use
     * @param {string} identifier Identifier to use
     * @param {string} field Field to return
     */
    private getFromMongoose;
    /**
     * Retrieves a document from MongoDB
     * @param {ModelName} modelName The model to use
     * @param {string} identifier The identifier to use when saving the document
     */
    private getAllFromMongoose;
    /**
     *
     * @param {Models} modelName Name of the model to use
     * @param {string} identifier Identifier to use when saving the document
     * @param {string} field The field to set
     * @param {string} value The value to set the field to
     */
    private setMongoose;
    private mongooseCastCheck;
    private stringify;
    private parse;
}
export {};
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
