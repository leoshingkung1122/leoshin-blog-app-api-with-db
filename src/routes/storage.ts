import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import protectAdmin from "../middleware/protectAdmin";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { DatabaseError } from "../utils/errors";

const router = Router();

// POST /storage/signed-url - Generate a signed URL for uploading a file
router.post("/signed-url", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { fileName, fileType } = req.body;
    const accessToken = (req as any).accessToken;
    const supabaseRls = createSupabaseRlsHelper(accessToken);

    if (!fileName || !fileType) {
        return res.status(400).json({ success: false, error: "fileName and fileType are required." });
    }

    try {
        const bucketName = "post-images";
        // Create a unique path for the file to avoid overwriting
        const filePath = `post-${Date.now()}-${fileName}`;

        const { data, error } = await supabaseRls.createSignedUploadUrl(bucketName, filePath);

        if (error) {
            throw new DatabaseError(`Failed to create signed URL: ${error.message}`);
        }

        // The 'token' in the data is the signed key, and 'path' is the full path for the upload
        return res.status(200).json({ success: true, ...data });

    } catch (error) {
        console.error("Error creating signed URL:", error);
        if (error instanceof DatabaseError) {
            throw error;
        }
        throw new DatabaseError("Failed to create signed URL.");
    }
}));

// DELETE /storage/delete/:fileName - Delete a file from storage
router.delete("/delete/:fileName", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { fileName } = req.params;
    const accessToken = (req as any).accessToken;
    const supabaseRls = createSupabaseRlsHelper(accessToken);

    if (!fileName) {
        return res.status(400).json({ success: false, error: "fileName is required." });
    }

    try {
        const bucketName = "post-images";
        await supabaseRls.deleteFile(bucketName, fileName);
        return res.status(200).json({ success: true, message: "File deleted successfully." });

    } catch (error) {
        console.error("Error deleting file:", error);
        if (error instanceof DatabaseError) {
            throw error;
        }
        throw new DatabaseError("Failed to delete file.");
    }
}));

export default router;
