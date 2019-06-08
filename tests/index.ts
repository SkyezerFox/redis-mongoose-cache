import { CacheClient } from "../src";

const cache = new CacheClient<{ hewwo: { uwu: string } }>({
	mongoURI: "mongodb://localhost:27017/dog-test",
});
