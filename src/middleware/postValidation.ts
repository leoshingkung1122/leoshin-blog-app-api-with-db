
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/errors";

interface PostData {
  title: string;
  image: string;
  category_id: number;
  description: string;
  content: string;
  status_id: number;
}

function validatePostData(req: Request, res: Response, next: NextFunction) {
  const { title, image, category_id, description, content, status_id } = req.body;
  const errors: string[] = [];

  // Check for required fields
  if (!title || title.trim() === "") {
    errors.push("Title is required");
  }

  if (!image || image.trim() === "") {
    errors.push("Image URL is required");
  }

  if (category_id === undefined || category_id === null) {
    errors.push("Category ID is required");
  }

  if (!description || description.trim() === "") {
    errors.push("Description is required");
  }

  if (!content || content.trim() === "") {
    errors.push("Content is required");
  }

  if (status_id === undefined || status_id === null) {
    errors.push("Status ID is required");
  }

  // Type validations
  if (title && typeof title !== "string") {
    errors.push("Title must be a string");
  }

  if (image && typeof image !== "string") {
    errors.push("Image must be a string URL");
  }

  if (category_id !== undefined && typeof category_id !== "number") {
    errors.push("Category ID must be a number");
  }

  if (description && typeof description !== "string") {
    errors.push("Description must be a string");
  }

  if (content && typeof content !== "string") {
    errors.push("Content must be a string");
  }

  if (status_id !== undefined && typeof status_id !== "number") {
    errors.push("Status ID must be a number");
  }

  // Additional validations
  if (title && title.length > 200) {
    errors.push("Title must be less than 200 characters");
  }

  if (description && description.length > 500) {
    errors.push("Description must be less than 500 characters");
  }

  if (category_id && (category_id < 1 || !Number.isInteger(category_id))) {
    errors.push("Category ID must be a positive integer");
  }

  if (status_id && (status_id < 1 || !Number.isInteger(status_id))) {
    errors.push("Status ID must be a positive integer");
  }

  // URL validation for image
  if (image && typeof image === "string") {
    try {
      new URL(image);
    } catch {
      errors.push("Image must be a valid URL");
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(", "));
  }

  next();
}

export default validatePostData;