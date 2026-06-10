const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

class UploadService {
  /**
   * Basic file upload to local storage (for development)
   * In production, this should be swapped for S3/Cloudinary
   */
  async uploadFile(file, tenantId) {
    const uploadDir = path.join(__dirname, "../../public/uploads", tenantId);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${uuidv4()}_${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    
    // Write file
    fs.writeFileSync(filePath, file.buffer);

    return {
      fileName,
      fileUrl: `/uploads/${tenantId}/${fileName}`,
      fileType: file.mimetype,
      fileSize: file.size
    };
  }
}

module.exports = new UploadService();
