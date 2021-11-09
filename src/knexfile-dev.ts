export default {
  development: {
    client: "pg",
    migrations: {
      directory: "./db/migrations",
    },
    seeds: {
      directory: "./db/seeds"
    },
  }
};