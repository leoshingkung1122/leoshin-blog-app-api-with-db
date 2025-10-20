import app from "../src/app";

// Export the Express app as a Vercel serverless function
export default app;

// For Vercel serverless functions
export const config = {
  api: {
    bodyParser: false,
  },
};