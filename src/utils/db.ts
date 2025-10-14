import { Pool } from "pg";

const connectionPool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    "postgresql://postgres:changriri@localhost:5432/leoshin-blog-app-api",
});

export default connectionPool;