import "dotenv/config";
const env = {
  jwt_secret: process.env.JWT_SECRET || "",

  testing: process.env.NODE_ENV === "test",
  node_env: process.env.NODE_ENV  as "test"|"production",
  API_VERSION: process.env.API_VERSION || "1.0.0",

  ROUTER_ADDRESS: process.env.ROUTER_ADDRESS!,
  POOL_ADDRESS: process.env.POOL_ADDRESS!,
};


export default env;