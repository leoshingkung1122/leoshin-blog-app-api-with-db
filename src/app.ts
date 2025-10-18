import express, { Request, Response } from "express";
import cors from "cors";
import connectionPool from "./utils/db";
import { errorHandler, notFoundHandler, asyncHandler } from "./middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "./utils/errors";
import validatePostData from "./middleware/postValidation";

const app = express();
const port: number = parseInt(process.env.PORT || "4001", 10);

app.use(cors());
app.use(express.json());

interface ProfileData {
  name: string;
  age: number;
}

interface ApiResponse {
  data: ProfileData;
}

app.get("/profiles", (req: Request, res: Response<ApiResponse>) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

app.post("/posts", validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const newPost = req.body;

  const query = `insert into posts (title, image, category_id, description, content, status_id)
    values ($1, $2, $3, $4, $5, $6)`;

  const values = [
    newPost.title,
    newPost.image,
    newPost.category_id,
    newPost.description,
    newPost.content,
    newPost.status_id,
  ];

  try {
    await connectionPool.query(query, values);
  } catch (error) {
    throw new DatabaseError("Failed to create post");
  }

  return res.status(201).json({ 
    success: true,
    message: "Created post successfully",
    data: { id: newPost.id }
  });
}));

app.get("/posts", asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category || "";
  const keyword = req.query.keyword || "";
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 6;

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;
  
  let query = `
    SELECT posts.*,  categories.name AS category, statuses.status
    FROM posts
    INNER JOIN categories ON posts.category_id = categories.id
    INNER JOIN statuses ON posts.status_id = statuses.id
    WHERE statuses.id = 2
  `;
  let values: any[] = [];

  if (category && keyword) {
    query += `
      AND categories.name ILIKE $1 
      AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)
    `;
    values = [`%${category}%`, `%${keyword}%`];
  } else if (category) {
    query += "AND categories.name ILIKE $1";
    values = [`%${category}%`];
  } else if (keyword) {
    query += `
      AND (posts.title ILIKE $1 
      OR posts.description ILIKE $1 
      OR posts.content ILIKE $1)
    `;
    values = [`%${keyword}%`];
  }

  query += ` ORDER BY posts.date DESC LIMIT $${values.length + 1} OFFSET $${
    values.length + 2
  }`;

  values.push(safeLimit, offset);

  let result;
  try {
    result = await connectionPool.query(query, values);
  } catch (error) {
    throw new DatabaseError("Failed to fetch posts");
  }

  let countQuery = `
    SELECT COUNT(*)
    FROM posts
    INNER JOIN categories ON posts.category_id = categories.id
    INNER JOIN statuses ON posts.status_id = statuses.id
    WHERE statuses.id = 2
  `;
  let countValues = values.slice(0, -2);

  if (category && keyword) {
    countQuery += `
      AND categories.name ILIKE $1 
      AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)
    `;
  } else if (category) {
    countQuery += "AND categories.name ILIKE $1";
  } else if (keyword) {
    countQuery += `
      AND (posts.title ILIKE $1 
      OR posts.description ILIKE $1 
      OR posts.content ILIKE $1)
    `;
  }

  let countResult;
  try {
    countResult = await connectionPool.query(countQuery, countValues);
  } catch (error) {
    throw new DatabaseError("Failed to count posts");
  }
  
  const totalPosts = parseInt(countResult.rows[0].count, 10);

  const results: any = {
    success: true,
    totalPosts,
    totalPages: Math.ceil(totalPosts / safeLimit),
    currentPage: safePage,
    limit: safeLimit,
    posts: result.rows,
  };
  
  if (offset + safeLimit < totalPosts) {
    results.nextPage = safePage + 1;
  }
  if (offset > 0) {
    results.previousPage = safePage - 1;
  }
  
  return res.status(200).json(results);
}));

app.get("/posts/:postId", asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  let results;
  try {
    results = await connectionPool.query(
      `
      SELECT posts.id, posts.image, categories.name AS category, posts.title, posts.description, posts.date, posts.content, statuses.status, posts.likes_count
      FROM posts
      INNER JOIN categories ON posts.category_id = categories.id
      INNER JOIN statuses ON posts.status_id = statuses.id
      WHERE posts.id = $1
      `,
      [postIdFromClient]
    );
  } catch (error) {
    throw new DatabaseError("Failed to fetch post");
  }

  if (!results.rows[0]) {
    throw new NotFoundError("Post", postIdFromClient);
  }

  return res.status(200).json({
    success: true,
    data: results.rows[0],
  });
}));

app.put("/posts/:postId", validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;
  const updatedPost = { ...req.body, date: new Date() };

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  try {
    const result = await connectionPool.query(
      `
        UPDATE posts
        SET title = $2,
            image = $3,
            category_id = $4,
            description = $5,
            content = $6,
            status_id = $7,
            date = $8
        WHERE id = $1
        RETURNING id
      `,
      [
        postIdFromClient,
        updatedPost.title,
        updatedPost.image,
        updatedPost.category_id,
        updatedPost.description,
        updatedPost.content,
        updatedPost.status_id,
        updatedPost.date,
      ]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Post", postIdFromClient);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to update post");
  }

  return res.status(200).json({
    success: true,
    message: "Updated post successfully",
  });
}));

app.delete("/posts/:postId", asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  try {
    const result = await connectionPool.query(
      `DELETE FROM posts
       WHERE id = $1
       RETURNING id`,
      [postIdFromClient]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Post", postIdFromClient);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to delete post");
  }

  return res.status(200).json({
    success: true,
    message: "Deleted post successfully",
  });
}));

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Export the app for Vercel
export default app;

// Only start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
}