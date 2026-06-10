const prisma = require("../config/prisma");

class NotificationService {
  /**
   * Send a notification to a specific user
   */
  async send({ tenantId, userId, title, message, type, link = null, io = null }) {
    try {
      // 1. Persist to DB
      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId,
          title,
          message,
          type,
          link,
        }
      });

      // 2. Emit via Socket.io if available
      if (io) {
        io.to(`user_${userId}`).emit("notification", notification);
      }

      return notification;
    } catch (error) {
      console.error("[NotificationService] Error:", error);
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });
  }

  /**
   * Get unread notifications for a user
   */
  async getUnread(userId) {
    return prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" }
    });
  }
}

module.exports = new NotificationService();
